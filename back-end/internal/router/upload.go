package router

import (
	"back-end/internal/handler"
	"back-end/internal/middleware"

	"github.com/gin-gonic/gin"
)

// registerUploadRoutes 文件上传路由
func registerUploadRoutes(api *gin.RouterGroup) {
	upload := api.Group("/upload")
	upload.Use(middleware.JWTAuth())
	{
		upload.POST("", handler.Upload) // 上传文件
	}
}
