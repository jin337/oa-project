package router

import (
	"back-end/internal/handler"
	"back-end/internal/middleware"

	"github.com/gin-gonic/gin"
)

// registerUploadRoutes 文件上传路由
func registerUploadRoutes(v1 *gin.RouterGroup) {
	upload := v1.Group("/upload")
	upload.Use(middleware.JWTAuth())
	{
		upload.POST("", handler.Upload) // 上传文件
	}
}
