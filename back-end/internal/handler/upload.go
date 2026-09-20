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

// UploadResult 单个文件上传结果
type UploadResult struct {
	URL  string `json:"url"`
	Name string `json:"name"`
	Size int64  `json:"size"`
}

// Upload 通用文件上传接口（支持单文件/多文件批量上传）
// POST /api/v1/upload?app_code=xxx
// form-data: file[]=xxx（多文件）或 file=xxx（单文件）
// 返回: [{ url, name, size }, ...]
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

	dir := filepath.Join(UploadDir, appCode)
	if err := os.MkdirAll(dir, 0755); err != nil {
		response.Fail(c, response.CodeServerError, "创建上传目录失败")
		return
	}

	// 优先多文件 file[]
	form, err := c.MultipartForm()
	if err != nil {
		response.Fail(c, response.CodeParamError, "未获取到上传文件")
		return
	}

	files := form.File["file[]"]
	if len(files) == 0 {
		files = form.File["file"]
	}
	if len(files) == 0 {
		response.Fail(c, response.CodeParamError, "未获取到上传文件")
		return
	}

	results := make([]UploadResult, 0, len(files))
	for _, file := range files {
		if file.Size > 20*1024*1024 {
			response.Fail(c, response.CodeParamError, fmt.Sprintf("文件 %s 大小超过 20MB", file.Filename))
			return
		}

		ext := strings.ToLower(filepath.Ext(file.Filename))
		filename := fmt.Sprintf("%s_%d%s",
			time.Now().Format("20060102150405"),
			time.Now().UnixNano()%100000,
			ext,
		)

		savePath := filepath.Join(dir, filename)
		if err := c.SaveUploadedFile(file, savePath); err != nil {
			response.Fail(c, response.CodeServerError, fmt.Sprintf("保存文件 %s 失败", file.Filename))
			return
		}

		url := fmt.Sprintf("/uploads/%s/%s", appCode, filename)
		results = append(results, UploadResult{
			URL:  url,
			Name: file.Filename,
			Size: file.Size,
		})
	}

	response.OK(c, results)
}
