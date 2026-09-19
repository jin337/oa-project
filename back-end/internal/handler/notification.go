package handler

import (
	"back-end/internal/middleware"
	"back-end/internal/pkg/response"
	"back-end/internal/service"
	"strconv"

	"github.com/gin-gonic/gin"
)

// NotificationList GET /api/v1/notifications
func NotificationList(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	size, _ := strconv.Atoi(c.DefaultQuery("size", "10"))
	list, total, err := service.NotificationList(middleware.CurrentUserID(c), page, size)
	if err != nil {
		respondServiceError(c, err)
		return
	}
	response.OK(c, gin.H{
		"list":  list,
		"total": total,
	})
}

// NotificationUnreadCount GET /api/v1/notifications/unread-count
func NotificationUnreadCount(c *gin.Context) {
	cnt, err := service.NotificationUnreadCount(middleware.CurrentUserID(c))
	if err != nil {
		respondServiceError(c, err)
		return
	}
	response.OK(c, gin.H{"count": cnt})
}

// NotificationReadAll PUT /api/v1/notifications/read-all
func NotificationReadAll(c *gin.Context) {
	if err := service.NotificationReadAll(middleware.CurrentUserID(c)); err != nil {
		respondServiceError(c, err)
		return
	}
	response.OK(c, nil)
}

// NotificationRead PUT /api/v1/notifications/:id/read
func NotificationRead(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	if err := service.NotificationRead(middleware.CurrentUserID(c), id); err != nil {
		respondServiceError(c, err)
		return
	}
	response.OK(c, nil)
}
