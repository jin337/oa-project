package middleware

import (
	"bytes"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"

	"back-end/internal/database"
	"back-end/internal/model"

	"github.com/gin-gonic/gin"
)

// ==================== 操作审计日志 ====================
//
// 记录所有非 GET 请求（登录/授权变更/配置修改/数据删除等写操作）。
// GET 查询不记录：OA 内查询占比极高，全量记录噪音大且存储膨胀。
// 请求体完整入库（不再截断 2000 字节）；密码、token 等凭据值在写入前脱敏，
// 避免审计库变成凭据库。异步队列满或写库失败时落本地 JSONL 兜底文件，不静默丢弃。
// 登录接口未携带 token，从请求体提取 username 补记操作人；密码不落原文。

// opLogChannelSize 异步缓冲队列长度
const opLogChannelSize = 4096

// opLogFallbackPath 异步写库失败/队列满时的本地兜底文件（每行一条 JSON）
const opLogFallbackPath = "logs/operation-log-fallback.jsonl"

var (
	opLogChan       chan model.OperationLog
	opLogChanOnce   sync.Once
	opLogFallbackMu sync.Mutex
)

// 凭据字段脱敏：只替换值，保留请求体原始格式与其余字段。
// 覆盖 JSON 的 "password"/"token" 等键，以及表单的 password=...&token=...。
var (
	sensitiveJSONValueRe  = regexp.MustCompile(`(?i)("(?:password|passwd|pwd|token|access_token|refresh_token|id_token|authorization|secret|client_secret)"\s*:\s*)(?:"(?:[^"\\]|\\.)*"|[^,}\s]+)`)
	sensitiveFormValueRe  = regexp.MustCompile(`(?i)((?:password|passwd|pwd|token|access_token|refresh_token|id_token|secret|client_secret)=)[^&\s]*`)
	sensitiveQueryValueRe = regexp.MustCompile(`(?i)((?:^|&)(?:password|passwd|pwd|token|access_token|refresh_token|id_token|secret|client_secret)=)[^&]*`)
)

func redactSensitiveBody(raw []byte) string {
	if len(raw) == 0 {
		return ""
	}
	s := string(raw)
	s = sensitiveJSONValueRe.ReplaceAllString(s, `$1"[REDACTED]"`)
	s = sensitiveFormValueRe.ReplaceAllString(s, `$1[REDACTED]`)
	return s
}

func redactSensitiveQuery(rawQuery string) string {
	if rawQuery == "" {
		return ""
	}
	return sensitiveQueryValueRe.ReplaceAllString(rawQuery, `$1[REDACTED]`)
}

// truncateRunes 按字符数截断，避免超长请求头触发 MySQL 列长度错误导致整条日志落兜底。
func truncateRunes(s string, max int) string {
	if max <= 0 {
		return s
	}
	r := []rune(s)
	if len(r) <= max {
		return s
	}
	return string(r[:max])
}

// writeOperationLogFallback 兜底落盘：异步队列满或数据库写入失败时不丢记录。
func writeOperationLogFallback(rec model.OperationLog) {
	data, err := json.Marshal(rec)
	if err != nil {
		log.Printf("[operation-log] 兜底序列化失败: %v", err)
		return
	}
	opLogFallbackMu.Lock()
	defer opLogFallbackMu.Unlock()
	if err := os.MkdirAll(filepath.Dir(opLogFallbackPath), 0o755); err != nil {
		log.Printf("[operation-log] 创建兜底目录失败: %v", err)
		return
	}
	f, err := os.OpenFile(opLogFallbackPath, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644)
	if err != nil {
		log.Printf("[operation-log] 打开兜底文件失败: %v", err)
		return
	}
	defer f.Close()
	if _, err := f.Write(append(data, '\n')); err != nil {
		log.Printf("[operation-log] 写兜底文件失败: %v", err)
	}
}

// startOperationLogWorker 启动唯一消费 goroutine（首次审计请求时惰性启动，Once 保证单例）
func startOperationLogWorker() {
	opLogChanOnce.Do(func() {
		opLogChan = make(chan model.OperationLog, opLogChannelSize)
		go func() {
			for rec := range opLogChan {
				r := rec
				if database.DB == nil {
					writeOperationLogFallback(r)
					continue
				}
				if err := database.DB.Create(&r).Error; err != nil {
					log.Printf("[operation-log] 写入失败，转本地兜底: %v", err)
					writeOperationLogFallback(r)
				}
			}
		}()
	})
}

// skipPathKeywords 不审计的路径关键字（SSE 长连接会长时间阻塞 c.Next 返回，无审计价值）
var skipPathKeywords = []string{"/stream"}

func matchKeyword(path string, keywords []string) bool {
	l := strings.ToLower(path)
	for _, k := range keywords {
		if strings.Contains(l, k) {
			return true
		}
	}
	return false
}

// OperationLog 操作审计中间件：挂在 api 分组（JWTAuth 之后读取身份在 c.Next 返回时已可用）。
// 读取请求体后必须回填 Body（中间件读过即消费，不回填则下游 handler 绑定不到参数）。
func OperationLog() gin.HandlerFunc {
	return func(c *gin.Context) {
		// GET 不记录：查询类请求量大，且用户明确要求只审计写操作。
		if c.Request.Method == http.MethodGet {
			c.Next()
			return
		}
		startOperationLogWorker()
		path := c.Request.URL.Path
		if matchKeyword(path, skipPathKeywords) {
			c.Next()
			return
		}

		start := time.Now()
		contentType := c.GetHeader("Content-Type")
		// multipart（文件上传）不读取请求体：大文件整体缓冲会翻倍内存占用，
		// 二进制文件也没有入库价值；只记 Content-Type 与字节数，正文用占位说明。
		isMultipart := strings.Contains(strings.ToLower(contentType), "multipart/form-data")

		var raw []byte
		if c.Request.Body != nil && !isMultipart {
			// 完整读取后原样回填：只读前 N 字节就回填会把大请求体（如带附件列表的表单 JSON）
			// 截断后交给下游 handler，造成绑定失败/数据损坏。
			raw, _ = io.ReadAll(c.Request.Body)
			c.Request.Body = io.NopCloser(bytes.NewReader(raw))
		}

		c.Next()

		// 请求完成后投递异步落库（panic 被外层 Recovery 捕获的请求同样记录，status=500 可见异常）
		body := ""
		bodyBytes := int64(len(raw))
		if isMultipart {
			body = "[multipart/form-data: 文件内容未入库]"
			if c.Request.ContentLength > 0 {
				bodyBytes = c.Request.ContentLength
			}
		} else {
			body = redactSensitiveBody(raw)
		}
		rec := model.OperationLog{
			CreatedAt:   time.Now(),
			Method:      c.Request.Method,
			Path:        path,
			Query:       redactSensitiveQuery(c.Request.URL.RawQuery),
			Body:        body,
			Status:      c.Writer.Status(),
			IP:          c.ClientIP(),
			ElapsedMs:   time.Since(start).Milliseconds(),
			UserAgent:   truncateRunes(c.GetHeader("User-Agent"), 512),
			ContentType: truncateRunes(contentType, 128),
			RequestID:   truncateRunes(c.GetHeader("X-Request-ID"), 64),
			BodyBytes:   bodyBytes,
		}
		if v, ok := c.Get(CtxUserID); ok {
			if id, ok := v.(uint); ok {
				rec.UserID = id
			}
		}
		if v, ok := c.Get(CtxUsername); ok {
			if name, ok := v.(string); ok {
				rec.Username = truncateRunes(name, 64)
			}
		}
		// 登录接口未携带 token，上下文无身份；从请求体提取账号字段补记操作人
		// （仅取 username，密码等其余字段不落库原文）
		if rec.Username == "" && strings.Contains(strings.ToLower(path), "login") && len(raw) > 0 {
			var acc struct {
				Username string `json:"username"`
			}
			if json.Unmarshal(raw, &acc) == nil {
				rec.Username = truncateRunes(acc.Username, 64)
			}
		}
		select {
		case opLogChan <- rec:
		default:
			log.Printf("[operation-log] 缓冲已满，转本地兜底: %s %s", rec.Method, rec.Path)
			writeOperationLogFallback(rec)
		}
	}
}
