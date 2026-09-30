package router

import (
	"back-end/internal/handler"
	"back-end/internal/middleware"

	"github.com/gin-gonic/gin"
)

// registerNotificationRoutes 站内通知路由
func registerNotificationRoutes(api *gin.RouterGroup) {
	notifications := api.Group("/notifications")
	notifications.Use(middleware.JWTAuth())
	{
		notifications.GET("", handler.NotificationList)          // 通知列表
		notifications.GET("/stream", handler.NotificationStream) // 通知实时推送(SSE)
		notifications.GET("/unread-count", handler.NotificationUnreadCount) // 未读通知数
		notifications.PUT("/read-all", handler.NotificationReadAll) // 全部标记已读
		notifications.PUT("/:id/read", handler.NotificationRead) // 单条标记已读
	}
}
