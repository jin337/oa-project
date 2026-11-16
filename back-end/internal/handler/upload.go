package handler

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"back-end/internal/config"
	"back-end/internal/pkg/response"

	"github.com/gin-gonic/gin"
)

// allowedUploadExts 上传扩展名白名单（小写含点）。
// 附件下载已改为受保护路由（JWTAuthWithCookie + UploadFile），文件不再以原始
// Content-Type 直接由静态目录内联下发；上传仍拒绝一切「可被浏览器当作脚本/标记执行」
// 的类型（html/htm/svg/xml/js 等）与可执行/危险类型（exe/dll/bat/sh 等），
// 避免同域存储型 XSS 与可执行文件分发。
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

// UploadFile 受保护的附件下载/预览入口
// GET /uploads/:appCode/:filename
// 仅允许 JWTAuthWithCookie 通过后进入；浏览器 <img>/<a> 由同源 HttpOnly Cookie 自动鉴权。
// 不使用 Gin 的目录静态映射，避免目录列表与任意路径读取；文件名仍保持原 URL 形态，
// 因而上传返回、业务数据存储、附件回收（service/attachment.go）无需迁移。
func UploadFile(c *gin.Context) {
	appCode := c.Param("appCode")
	filename := c.Param("filename")
	if !validUploadSegment(appCode) || !validUploadFilename(filename) {
		response.FailWithHTTP(c, http.StatusNotFound, response.CodeNotFound, "文件不存在")
		return
	}

	root, err := filepath.Abs(config.UploadDir)
	if err != nil {
		response.FailWithHTTP(c, http.StatusNotFound, response.CodeNotFound, "文件不存在")
		return
	}
	absPath, err := filepath.Abs(filepath.Join(root, appCode, filename))
	if err != nil {
		response.FailWithHTTP(c, http.StatusNotFound, response.CodeNotFound, "文件不存在")
		return
	}
	// 二次防目录穿越：解析后的路径必须仍在上传根目录内
	rel, err := filepath.Rel(root, absPath)
	if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		response.FailWithHTTP(c, http.StatusNotFound, response.CodeNotFound, "文件不存在")
		return
	}

	info, err := os.Lstat(absPath)
	if err != nil || info.Mode()&os.ModeSymlink != 0 || info.IsDir() || !info.Mode().IsRegular() {
		response.FailWithHTTP(c, http.StatusNotFound, response.CodeNotFound, "文件不存在")
		return
	}

	// 图片/PDF 允许浏览器内预览；其他类型强制下载，避免历史遗留的可执行/标记文件被内联执行。
	// 新上传已由 allowedUploadExts 白名单拦截，这里是对存量文件的第二道防线。
	ext := strings.ToLower(filepath.Ext(filename))
	disposition := "attachment"
	if isInlinePreviewExt(ext) {
		disposition = "inline"
	}
	c.Header("Content-Disposition", fmt.Sprintf("%s; filename=%q", disposition, filename))
	c.Header("Cache-Control", "private, no-store")
	c.File(absPath)
}

func validUploadSegment(s string) bool {
	if s == "" {
		return false
	}
	for _, r := range s {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '_' || r == '-' {
			continue
		}
		return false
	}
	return true
}

func validUploadFilename(name string) bool {
	ext := strings.ToLower(filepath.Ext(name))
	if ext == "" || !validUploadSegment(ext[1:]) {
		return false
	}
	base := strings.TrimSuffix(name, filepath.Ext(name))
	return validUploadSegment(base)
}

func isInlinePreviewExt(ext string) bool {
	switch ext {
	case ".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".pdf",
		".mp3", ".mp4", ".wav", ".m4a", ".mov", ".avi":
		return true
	default:
		return false
	}
}
