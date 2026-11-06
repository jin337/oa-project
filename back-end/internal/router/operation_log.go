package router

import (
	"back-end/internal/handler"
	"back-end/internal/middleware"

	"github.com/gin-gonic/gin"
)

// registerOperationLogRoutes 操作审计日志路由（只读，页面权限 system:audit 控制）
func registerOperationLogRoutes(api *gin.RouterGroup) {
	logs := api.Group("/operation-logs")
	logs.Use(middleware.JWTAuth())
	{
		logs.GET("", middleware.RequirePermission("system:audit"), handler.OperationLogList)          // 日志列表
		logs.GET("/export", middleware.RequirePermission("system:audit"), handler.OperationLogExport) // 日志导出 xlsx
	}
}
