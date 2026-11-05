package middleware

import (
	"bytes"
	"encoding/json"
	"io"
	"log"
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
// 落库异步：请求线程只投递到带缓冲 channel，独立 goroutine 消费写库，
// 缓冲满时丢弃并打日志（审计尽力而为，绝不阻塞/拖垮业务请求）。
// 敏感脱敏：登录/密码/token 类接口请求体不落原文（含明文凭据）。

// opLogBodyLimit 请求体记录上限（字节）：模型列 size:2000，超出截断
const opLogBodyLimit = 2000

// opLogChannelSize 异步缓冲队列长度
const opLogChannelSize = 4096

var (
	opLogChan     chan model.OperationLog
	opLogChanOnce sync.Once
)

// startOperationLogWorker 启动唯一消费 goroutine（首次审计请求时惰性启动，Once 保证单例）
func startOperationLogWorker() {
	opLogChanOnce.Do(func() {
		opLogChan = make(chan model.OperationLog, opLogChannelSize)
		go func() {
			for rec := range opLogChan {
				r := rec
				if err := database.DB.Create(&r).Error; err != nil {
					log.Printf("[operation-log] 写入失败: %v", err)
				}
			}
		}()
	})
}

// sensitivePathKeywords URL 命中任一关键字即视为凭据类接口，请求体不落库
var sensitivePathKeywords = []string{"login", "password", "token"}

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
		if c.Request.Method == "GET" {
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
		var raw []byte
		if c.Request.Body != nil {
			raw, _ = io.ReadAll(io.LimitReader(c.Request.Body, opLogBodyLimit+1024))
			c.Request.Body = io.NopCloser(bytes.NewReader(raw))
		}

		c.Next()

		// 请求完成后投递异步落库（panic 被外层 Recovery 捕获的请求同样记录，status=500 可见异常）
		body := ""
		if !matchKeyword(path, sensitivePathKeywords) {
			body = string(raw)
			if len(body) > opLogBodyLimit {
				body = body[:opLogBodyLimit]
			}
		}
		rec := model.OperationLog{
			CreatedAt: time.Now(),
			Method:    c.Request.Method,
			Path:      path,
			Query:     c.Request.URL.RawQuery,
			Body:      body,
			Status:    c.Writer.Status(),
			IP:        c.ClientIP(),
			ElapsedMs: time.Since(start).Milliseconds(),
		}
		if v, ok := c.Get(CtxUserID); ok {
			if id, ok := v.(uint); ok {
				rec.UserID = id
			}
		}
		if v, ok := c.Get(CtxUsername); ok {
			if name, ok := v.(string); ok {
				rec.Username = name
			}
		}
		// 登录接口未携带 token，上下文无身份；从请求体提取账号字段补记操作人
		// （仅取 username，密码等其余字段不落库）
		if rec.Username == "" && strings.Contains(strings.ToLower(path), "login") && len(raw) > 0 {
			var acc struct {
				Username string `json:"username"`
			}
			if json.Unmarshal(raw, &acc) == nil {
				rec.Username = acc.Username
			}
		}
		select {
		case opLogChan <- rec:
		default:
			log.Printf("[operation-log] 缓冲已满，丢弃一条记录: %s %s", rec.Method, rec.Path)
		}
	}
}
