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
		applications.POST("", middleware.RequirePermission("application:edit"), handler.ApplicationCreate) // 新建流程
		applications.GET("/by-code/:code", handler.ApplicationByCode)                // 按编码查询流程（申请/审批人读取）
		applications.GET("/:id", handler.ApplicationDetail)                          // 流程详情
		applications.PUT("/:id", middleware.RequirePermission("application:edit"), handler.ApplicationUpdate) // 修改流程
		applications.DELETE("/:id", middleware.RequirePermission("application:edit"), handler.ApplicationDelete) // 删除流程
		// 表字段管理
		applications.GET("/:id/fields", middleware.RequirePermission("application:edit"), handler.TableFieldList) // 表字段列表
		applications.POST("/:id/fields", middleware.RequirePermission("application:edit"), handler.TableFieldCreate) // 新增表字段
		applications.PUT("/:id/fields/:fieldId", middleware.RequirePermission("application:edit"), handler.TableFieldUpdate) // 修改表字段
		applications.DELETE("/:id/fields/:fieldId", middleware.RequirePermission("application:edit"), handler.TableFieldDelete) // 删除表字段
		// 表单元素管理
		applications.GET("/:id/element", middleware.RequirePermission("application:edit"), handler.ApplicationElementList) // 表单元素列表
		applications.POST("/:id/element", middleware.RequirePermission("application:edit"), handler.ApplicationElementCreate) // 新增表单元素
		applications.PUT("/:id/element/:elementId", middleware.RequirePermission("application:edit"), handler.ApplicationElementUpdate) // 修改表单元素
		applications.DELETE("/:id/element/:elementId", middleware.RequirePermission("application:edit"), handler.ApplicationElementDelete) // 删除表单元素
		// 动态页面数据
		applications.POST("/:id/data", middleware.RequirePermission("application:edit"), handler.ApplicationDataCreate) // 新增流程数据
		applications.GET("/:id/data/:dataId", middleware.RequirePermission("application:edit"), handler.ApplicationDataDetail) // 流程数据详情
		applications.PUT("/:id/data/:dataId", middleware.RequirePermission("application:edit"), handler.ApplicationDataUpdate) // 修改流程数据
		applications.DELETE("/:id/data/:dataId", middleware.RequirePermission("application:edit"), handler.ApplicationDataDelete) // 删除流程数据
	}
}
