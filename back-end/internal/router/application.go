package router

import (
	"back-end/internal/handler"
	"back-end/internal/middleware"

	"github.com/gin-gonic/gin"
)

// registerApplicationRoutes 页面配置管理路由
func registerApplicationRoutes(api *gin.RouterGroup) {
	applications := api.Group("/application")
	applications.Use(middleware.JWTAuth())
	{
		applications.GET("", handler.ApplicationList)                                // 流程列表
		applications.POST("", handler.ApplicationCreate)                            // 新建流程
		applications.GET("/by-code/:code", handler.ApplicationByCode)                // 按编码查询流程
		applications.GET("/:id", handler.ApplicationDetail)                          // 流程详情
		applications.PUT("/:id", handler.ApplicationUpdate)                          // 修改流程
		applications.DELETE("/:id", handler.ApplicationDelete)                       // 删除流程
		// 表字段管理
		applications.GET("/:id/fields", handler.TableFieldList)                      // 表字段列表
		applications.POST("/:id/fields", handler.TableFieldCreate)                   // 新增表字段
		applications.PUT("/:id/fields/:fieldId", handler.TableFieldUpdate)           // 修改表字段
		applications.DELETE("/:id/fields/:fieldId", handler.TableFieldDelete)        // 删除表字段
		// 表单元素管理
		applications.GET("/:id/element", handler.ApplicationElementList)             // 表单元素列表
		applications.POST("/:id/element", handler.ApplicationElementCreate)          // 新增表单元素
		applications.PUT("/:id/element/:elementId", handler.ApplicationElementUpdate) // 修改表单元素
		applications.DELETE("/:id/element/:elementId", handler.ApplicationElementDelete) // 删除表单元素
		// 动态页面数据
		applications.POST("/:id/data", handler.ApplicationDataCreate)                // 新增流程数据
		applications.GET("/:id/data/:dataId", handler.ApplicationDataDetail)         // 流程数据详情
		applications.PUT("/:id/data/:dataId", handler.ApplicationDataUpdate)         // 修改流程数据
		applications.DELETE("/:id/data/:dataId", handler.ApplicationDataDelete)      // 删除流程数据
	}
}
