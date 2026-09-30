package handler

import (
	"back-end/internal/middleware"
	"back-end/internal/pkg/response"
	"back-end/internal/service"
	"encoding/json"
	"fmt"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
)

// NotificationList GET /v1/api/notifications
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

// NotificationUnreadCount GET /v1/api/notifications/unread-count
func NotificationUnreadCount(c *gin.Context) {
	cnt, err := service.NotificationUnreadCount(middleware.CurrentUserID(c))
	if err != nil {
		respondServiceError(c, err)
		return
	}
	response.OK(c, gin.H{"count": cnt})
}

// NotificationReadAll PUT /v1/api/notifications/read-all
func NotificationReadAll(c *gin.Context) {
	if err := service.NotificationReadAll(middleware.CurrentUserID(c)); err != nil {
		respondServiceError(c, err)
		return
	}
	response.OK(c, nil)
}

// NotificationRead PUT /v1/api/notifications/:id/read
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

// NotificationStream GET /v1/api/notifications/stream SSE 实时推送
func NotificationStream(c *gin.Context) {
	userID := middleware.CurrentUserID(c)
	if userID == 0 {
		c.Status(401)
		return
	}

	// SSE 响应头
	c.Writer.Header().Set("Content-Type", "text/event-stream")
	c.Writer.Header().Set("Cache-Control", "no-cache")
	c.Writer.Header().Set("Connection", "keep-alive")
	c.Writer.Header().Set("X-Accel-Buffering", "no")

	// 注册连接
	ch := service.RegisterNotification(userID)
	defer service.UnregisterNotification(userID, ch)

	// 心跳
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	// 初始连接成功事件 + 未读数
	count, _ := service.NotificationUnreadCount(userID)
	initData, _ := json.Marshal(gin.H{"count": count})
	fmt.Fprintf(c.Writer, "event: connected\ndata: %s\n\n", initData)
	c.Writer.Flush()

	// 监听客户端断开
	notify := c.Request.Context().Done()

	for {
		select {
		case <-notify:
			return
		case n, ok := <-ch:
			if !ok {
				return
			}
			data, _ := json.Marshal(n)
			fmt.Fprintf(c.Writer, "event: notification\ndata: %s\n\n", data)
			c.Writer.Flush()
		case <-ticker.C:
			fmt.Fprintf(c.Writer, "event: ping\ndata: {}\n\n")
			c.Writer.Flush()
		}
	}
}
