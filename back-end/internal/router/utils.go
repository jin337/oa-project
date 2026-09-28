package router

import (
	"back-end/internal/handler"
	"back-end/internal/middleware"

	"github.com/gin-gonic/gin"
)

// registerUtilRoutes 工具接口路由（需要鉴权）
func registerUtilRoutes(v1 *gin.RouterGroup) {
	utils := v1.Group("/utils")
	utils.Use(middleware.JWTAuth())
	{
		utils.POST("/calculate", handler.Calculate) // 公共计算/转换接口
	}
}
