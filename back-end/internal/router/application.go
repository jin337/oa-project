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
		applications.GET("", handler.ApplicationList)                                                              // 流程列表
		applications.POST("", middleware.RequirePermission("application:add"), handler.ApplicationCreate)          // 新建流程
		applications.GET("/by-code/:code", handler.ApplicationByCode)                                              // 按编码查询流程（申请/审批人读取）
		applications.GET("/:id", handler.ApplicationDetail)                                                        // 流程详情
		applications.PUT("/:id", middleware.RequirePermission("application:edit"), handler.ApplicationUpdate)      // 修改流程
		applications.DELETE("/:id", middleware.RequirePermission("application:delete"), handler.ApplicationDelete) // 删除流程
		// 表字段管理：表字段页改结构需 application:tables；元素页/设计页读取字段列表供下拉选择
		applications.GET("/:id/fields", middleware.RequirePermission("application:tables", "application:elements", "application:design"), handler.TableFieldList) // 表字段列表
		applications.POST("/:id/fields", middleware.RequirePermission("application:tables"), handler.TableFieldCreate)                                            // 新增表字段
		applications.PUT("/:id/fields/:fieldId", middleware.RequirePermission("application:tables"), handler.TableFieldUpdate)                                    // 修改表字段
		applications.DELETE("/:id/fields/:fieldId", middleware.RequirePermission("application:tables"), handler.TableFieldDelete)                                 // 删除表字段
		// 表单元素管理：元素页增删改需 application:elements；设计页读取元素列表组装布局
		applications.GET("/:id/element", middleware.RequirePermission("application:elements", "application:design"), handler.ApplicationElementList) // 表单元素列表
		applications.POST("/:id/element", middleware.RequirePermission("application:elements"), handler.ApplicationElementCreate)                    // 新增表单元素
		applications.PUT("/:id/element/:elementId", middleware.RequirePermission("application:elements"), handler.ApplicationElementUpdate)          // 修改表单元素
		applications.DELETE("/:id/element/:elementId", middleware.RequirePermission("application:elements"), handler.ApplicationElementDelete)       // 删除表单元素
		// 动态页面数据：数据列表页（application:list）的增删改查
		applications.POST("/:id/data", middleware.RequirePermission("application:list"), handler.ApplicationDataCreate)           // 新增流程数据
		applications.GET("/:id/data/:dataId", middleware.RequirePermission("application:list"), handler.ApplicationDataDetail)    // 流程数据详情
		applications.PUT("/:id/data/:dataId", middleware.RequirePermission("application:list"), handler.ApplicationDataUpdate)    // 修改流程数据
		applications.DELETE("/:id/data/:dataId", middleware.RequirePermission("application:list"), handler.ApplicationDataDelete) // 删除流程数据
		// 版本管理：设计页发布版本，流程管理页可查看/改生效时间/删除待生效版本（design 或 edit 任一）
		applications.GET("/:id/versions", middleware.RequirePermission("application:design", "application:edit"), handler.ApplicationVersionList)                              // 版本列表
		applications.POST("/:id/versions/publish", middleware.RequirePermission("application:design"), handler.ApplicationVersionPublish)                                      // 发布新版本
		applications.PUT("/:id/versions/:versionId/edit", middleware.RequirePermission("application:design", "application:edit"), handler.ApplicationVersionUpdateEffectiveAt) // 编辑待生效版本的生效时间和版本说明
		applications.PUT("/:id/versions/:versionId", middleware.RequirePermission("application:design"), handler.ApplicationVersionUpdate)                                     // 保存版本快照
		applications.PUT("/:id/versions/:versionId/publish", middleware.RequirePermission("application:design"), handler.ApplicationVersionRepublish)                          // 基于已有版本再次发布
		applications.DELETE("/:id/versions/:versionId", middleware.RequirePermission("application:design", "application:delete"), handler.ApplicationVersionDelete)            // 删除待生效版本
	}
}
