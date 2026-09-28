package router

import (
	"back-end/internal/handler"
	"back-end/internal/middleware"

	"github.com/gin-gonic/gin"
)

// registerApiDefinitionRoutes 接口定义管理路由（/interface 接口管理页面）
func registerApiDefinitionRoutes(v1 *gin.RouterGroup) {
	apiDefinitions := v1.Group("/api-definitions")
	apiDefinitions.Use(middleware.JWTAuth())
	{
		apiDefinitions.GET("", handler.ApiDefinitionList)
		apiDefinitions.POST("", handler.ApiDefinitionCreate)
		apiDefinitions.POST("/debug", handler.ApiDefinitionDebug)
		apiDefinitions.GET("/:id", handler.ApiDefinitionDetail)
		apiDefinitions.PUT("/:id", handler.ApiDefinitionUpdate)
		apiDefinitions.DELETE("/:id", handler.ApiDefinitionDelete)
	}
}
