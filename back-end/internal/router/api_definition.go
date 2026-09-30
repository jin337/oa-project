package router

import (
	"back-end/internal/handler"
	"back-end/internal/middleware"

	"github.com/gin-gonic/gin"
)

// registerApiDefinitionRoutes 接口定义管理路由（/interface 接口管理页面）+ 统一分发端点
func registerApiDefinitionRoutes(api *gin.RouterGroup) {
	apiDefinitions := api.Group("/api-definitions")
	apiDefinitions.Use(middleware.JWTAuth())
	{
		apiDefinitions.GET("", handler.ApiDefinitionList)            // 接口列表
		apiDefinitions.POST("", handler.ApiDefinitionCreate)        // 新建接口
		apiDefinitions.POST("/debug", handler.ApiDefinitionDebug)   // 试调接口
		apiDefinitions.GET("/backend/routes", handler.ApiDefinitionListRoutes) // 后端路由列表
		apiDefinitions.POST("/backend/import", handler.ApiDefinitionImportRoutes) // 导入后端路由
		apiDefinitions.GET("/:id", handler.ApiDefinitionDetail)     // 接口详情
		apiDefinitions.PUT("/:id", handler.ApiDefinitionUpdate)     // 修改接口
		apiDefinitions.DELETE("/:id", handler.ApiDefinitionDelete)  // 删除接口
	}

	// 统一分发：对外以 method+path 暴露接口（GET/POST/PUT/DELETE /interfaces/*path）
	interfaces := api.Group("/interfaces")
	interfaces.Use(middleware.JWTAuth())
	{
		interfaces.Any("/*path", handler.ApiDefinitionDispatch) // 统一分发执行接口
	}
}
