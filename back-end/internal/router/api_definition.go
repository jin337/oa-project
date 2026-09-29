package router

import (
	"back-end/internal/handler"
	"back-end/internal/middleware"

	"github.com/gin-gonic/gin"
)

// registerApiDefinitionRoutes 接口定义管理路由（/interface 接口管理页面）+ 统一分发端点
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

	// 统一分发：对外以 method+path 暴露接口（GET/POST/PUT/DELETE /interfaces/*path）
	interfaces := v1.Group("/interfaces")
	interfaces.Use(middleware.JWTAuth())
	{
		interfaces.Any("/*path", handler.ApiDefinitionDispatch)
	}
}
