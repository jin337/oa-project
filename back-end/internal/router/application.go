package router

import (
	"back-end/internal/handler"
	"back-end/internal/middleware"

	"github.com/gin-gonic/gin"
)

// registerApplicationRoutes 页面配置管理路由
func registerApplicationRoutes(v1 *gin.RouterGroup) {
	applications := v1.Group("/application")
	applications.Use(middleware.JWTAuth())
	{
		applications.GET("", handler.ApplicationList)
		applications.POST("", handler.ApplicationCreate)
		applications.GET("/by-code/:code", handler.ApplicationByCode)
		applications.GET("/:id", handler.ApplicationDetail)
		applications.PUT("/:id", handler.ApplicationUpdate)
		applications.DELETE("/:id", handler.ApplicationDelete)
		// 表字段管理
		applications.GET("/:id/fields", handler.TableFieldList)
		applications.POST("/:id/fields", handler.TableFieldCreate)
		applications.PUT("/:id/fields/:fieldId", handler.TableFieldUpdate)
		applications.DELETE("/:id/fields/:fieldId", handler.TableFieldDelete)
		// 表单元素管理
		applications.GET("/:id/element", handler.ApplicationElementList)
		applications.POST("/:id/element", handler.ApplicationElementCreate)
		applications.PUT("/:id/element/:elementId", handler.ApplicationElementUpdate)
		applications.DELETE("/:id/element/:elementId", handler.ApplicationElementDelete)
		// 动态页面数据
		applications.POST("/:id/data", handler.ApplicationDataCreate)
		applications.GET("/:id/data/:dataId", handler.ApplicationDataDetail)
		applications.PUT("/:id/data/:dataId", handler.ApplicationDataUpdate)
		applications.DELETE("/:id/data/:dataId", handler.ApplicationDataDelete)
	}
}
