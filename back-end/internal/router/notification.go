package router

import (
	"back-end/internal/handler"
	"back-end/internal/middleware"

	"github.com/gin-gonic/gin"
)

// registerNotificationRoutes 站内通知路由
func registerNotificationRoutes(v1 *gin.RouterGroup) {
	notifications := v1.Group("/notifications")
	notifications.Use(middleware.JWTAuth())
	{
		notifications.GET("", handler.NotificationList)
		notifications.GET("/stream", handler.NotificationStream)
		notifications.GET("/unread-count", handler.NotificationUnreadCount)
		notifications.PUT("/read-all", handler.NotificationReadAll)
		notifications.PUT("/:id/read", handler.NotificationRead)
	}
}
