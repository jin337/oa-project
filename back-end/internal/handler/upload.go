package handler

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"back-end/internal/pkg/response"

	"github.com/gin-gonic/gin"
)

// UploadDir 上传文件根目录（相对后端运行目录）
const UploadDir = "uploads"

// UploadResult 上传成功返回结构
type UploadResult struct {
	URL  string `json:"url"`
	Name string `json:"name"`
	Size int64  `json:"size"`
}

// Upload 通用文件上传接口
// POST /api/v1/upload?app_code=xxx
// 文件存到 uploads/{app_code}/{yyyyMMdd}_{rand}.{ext}
// 静态访问路径 /uploads/...
func Upload(c *gin.Context) {
	file, err := c.FormFile("file")
	if err != nil {
		response.Fail(c, response.CodeParamError, "未获取到上传文件")
		return
	}

	// 大小限制 20MB
	if file.Size > 20*1024*1024 {
		response.Fail(c, response.CodeParamError, "文件大小不能超过 20MB")
		return
	}

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

	ext := strings.ToLower(filepath.Ext(file.Filename))
	// 安全文件名：时间戳 + 随机串
	filename := fmt.Sprintf("%s_%d%s",
		time.Now().Format("20060102150405"),
		time.Now().UnixNano()%100000,
		ext,
	)

	dir := filepath.Join(UploadDir, appCode)
	if err := os.MkdirAll(dir, 0755); err != nil {
		response.Fail(c, response.CodeServerError, "创建上传目录失败")
		return
	}

	savePath := filepath.Join(dir, filename)
	if err := c.SaveUploadedFile(file, savePath); err != nil {
		response.Fail(c, response.CodeServerError, "保存文件失败")
		return
	}

	// URL 前缀：/uploads/{appCode}/{filename}
	url := fmt.Sprintf("/uploads/%s/%s", appCode, filename)

	response.OK(c, UploadResult{
		URL:  url,
		Name: file.Filename,
		Size: file.Size,
	})
}
