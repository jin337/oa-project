package router

import (
	"back-end/internal/handler"
	"back-end/internal/middleware"

	"github.com/gin-gonic/gin"
)

// registerUtilRoutes 工具接口路由（需要鉴权）
func registerUtilRoutes(api *gin.RouterGroup) {
	utils := api.Group("/utils")
	utils.Use(middleware.JWTAuth())
	{
		utils.POST("/calculate", handler.Calculate) // 公共计算/转换接口
	}
}
