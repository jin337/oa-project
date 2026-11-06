package handler

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"back-end/internal/config"
	"back-end/internal/pkg/response"

	"github.com/gin-gonic/gin"
)

// allowedUploadExts 上传扩展名白名单（小写含点）。
// /uploads 是无鉴权静态目录，且上传文件会以原 Content-Type 被浏览器直接访问，
// 故必须拒绝一切「可被浏览器当作脚本/标记执行」的类型（html/htm/svg/xml/js 等）
// 与可执行/危险类型（exe/dll/bat/sh 等）——否则任何人上传一个 .html 即可在同域执行，
// 构成存储型 XSS，进而窃取登录凭证、绕过已建立的认证防护。
// 白名单按业务实际用到的办公/图片/音视频类型收敛，未知类型一律拒绝。
var allowedUploadExts = map[string]bool{
	// 图片
	".png": true, ".jpg": true, ".jpeg": true, ".gif": true, ".webp": true, ".bmp": true,
	// 办公文档
	".pdf": true, ".doc": true, ".docx": true, ".xls": true, ".xlsx": true,
	".ppt": true, ".pptx": true,
	// 纯文本/表格数据
	".txt": true, ".csv": true, ".md": true,
	// 压缩包
	".zip": true, ".rar": true, ".7z": true,
	// 音视频
	".mp3": true, ".mp4": true, ".wav": true, ".m4a": true, ".mov": true, ".avi": true,
}

// UploadResult 单个文件上传结果
type UploadResult struct {
	URL  string `json:"url"`
	Name string `json:"name"`
	Size int64  `json:"size"`
}

// Upload 通用文件上传接口
// POST /{APIPrefix}/upload?app_code=xxx
// form-data: file=xxx
// 返回: { url, name, size }
func Upload(c *gin.Context) {
	appCode := strings.TrimSpace(c.Query("app_code"))
	if appCode == "" {
		appCode = strings.TrimSpace(c.PostForm("app_code"))
	}
	if appCode == "" {
		appCode = "common"
	}
	// 防目录穿越
	appCode = strings.Map(func(r rune) rune {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '_' || r == '-' {
			return r
		}
		return '_'
	}, appCode)

	dir := filepath.Join(config.UploadDir, appCode)
	if err := os.MkdirAll(dir, 0755); err != nil {
		response.Fail(c, response.CodeServerError, "创建上传目录失败")
		return
	}

	file, err := c.FormFile("file")
	if err != nil {
		response.Fail(c, response.CodeParamError, "未获取到上传文件")
		return
	}

	if file.Size > 20*1024*1024 {
		response.Fail(c, response.CodeParamError, "文件大小不能超过 20MB")
		return
	}

	ext := strings.ToLower(filepath.Ext(file.Filename))
	if !allowedUploadExts[ext] {
		response.Fail(c, response.CodeParamError, "不支持的文件类型："+ext)
		return
	}
	// 加密随机后缀（8 hex）替代纳秒取模：时间戳同微秒并发也不会碰撞覆盖，且不可被枚举猜测
	rnd := make([]byte, 4)
	if _, err := rand.Read(rnd); err != nil {
		response.Fail(c, response.CodeServerError, "生成文件名失败")
		return
	}
	filename := fmt.Sprintf("%s_%s%s",
		time.Now().Format("20060102150405"),
		hex.EncodeToString(rnd),
		ext,
	)

	savePath := filepath.Join(dir, filename)
	if err := c.SaveUploadedFile(file, savePath); err != nil {
		response.Fail(c, response.CodeServerError, "保存文件失败")
		return
	}

	url := fmt.Sprintf("/uploads/%s/%s", appCode, filename)
	response.OK(c, UploadResult{
		URL:  url,
		Name: file.Filename,
		Size: file.Size,
	})
}
