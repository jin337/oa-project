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

// NotificationList GET /{APIPrefix}/notifications
// 查询参数：page、size、keyword（标题/内容模糊）、type（1待办 2退回 3抄送 4结果）、
// status（unread/read，缺省返回全部）
func NotificationList(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	size, _ := strconv.Atoi(c.DefaultQuery("size", "10"))
	ntype, _ := strconv.Atoi(c.DefaultQuery("type", "0"))
	status := c.Query("status")
	if status != "unread" && status != "read" {
		status = "" // 非法值按"全部"处理，避免前端传参异常时返回空列表
	}
	list, total, err := service.NotificationList(middleware.CurrentUserID(c), service.NotificationQuery{
		Page:    page,
		Size:    size,
		Keyword: c.Query("keyword"),
		Type:    ntype,
		Status:  status,
	})
	if err != nil {
		respondServiceError(c, err)
		return
	}
	response.OK(c, gin.H{
		"list":  list,
		"total": total,
	})
}

// NotificationUnreadCount GET /{APIPrefix}/notifications/unread-count
func NotificationUnreadCount(c *gin.Context) {
	cnt, err := service.NotificationUnreadCount(middleware.CurrentUserID(c))
	if err != nil {
		respondServiceError(c, err)
		return
	}
	response.OK(c, gin.H{"count": cnt})
}

// NotificationReadAll PUT /{APIPrefix}/notifications/read-all
func NotificationReadAll(c *gin.Context) {
	if err := service.NotificationReadAll(middleware.CurrentUserID(c)); err != nil {
		respondServiceError(c, err)
		return
	}
	response.OK(c, nil)
}

// NotificationRead PUT /{APIPrefix}/notifications/:id/read
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

// notificationIDsRequest 批量操作请求体：通知 ID 列表
type notificationIDsRequest struct {
	IDs []uint `json:"ids"`
}

// NotificationReadBatch PUT /{APIPrefix}/notifications/read 批量标记已读
func NotificationReadBatch(c *gin.Context) {
	var req notificationIDsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, response.CodeParamError, "参数错误")
		return
	}
	ids := service.NormalizeNotificationIDs(req.IDs)
	if len(ids) == 0 {
		response.Fail(c, response.CodeParamError, "请选择要标记的通知")
		return
	}
	updated, err := service.NotificationReadBatch(middleware.CurrentUserID(c), ids)
	if err != nil {
		respondServiceError(c, err)
		return
	}
	response.OK(c, gin.H{"updated": updated})
}

// NotificationDelete DELETE /{APIPrefix}/notifications 批量删除通知
func NotificationDelete(c *gin.Context) {
	var req notificationIDsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, response.CodeParamError, "参数错误")
		return
	}
	ids := service.NormalizeNotificationIDs(req.IDs)
	if len(ids) == 0 {
		response.Fail(c, response.CodeParamError, "请选择要删除的通知")
		return
	}
	deleted, err := service.NotificationDelete(middleware.CurrentUserID(c), ids)
	if err != nil {
		respondServiceError(c, err)
		return
	}
	response.OK(c, gin.H{"deleted": deleted})
}

// NotificationStream GET /{APIPrefix}/notifications/stream SSE 实时推送
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
