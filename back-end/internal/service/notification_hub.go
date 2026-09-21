package service

import (
	"sync"

	"back-end/internal/model"
)

// NotificationHub 管理用户的 SSE 连接，用于实时推送通知
type NotificationHub struct {
	mu      sync.RWMutex
	clients map[uint]map[chan *model.Notification]struct{}
}

var globalHub = &NotificationHub{
	clients: make(map[uint]map[chan *model.Notification]struct{}),
}

// Register 注册一个用户的 SSE 连接，返回接收通知的 channel
func (h *NotificationHub) Register(userID uint) chan *model.Notification {
	ch := make(chan *model.Notification, 16)
	h.mu.Lock()
	if h.clients[userID] == nil {
		h.clients[userID] = make(map[chan *model.Notification]struct{})
	}
	h.clients[userID][ch] = struct{}{}
	h.mu.Unlock()
	return ch
}

// Unregister 注销一个用户的 SSE 连接
func (h *NotificationHub) Unregister(userID uint, ch chan *model.Notification) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if chans, ok := h.clients[userID]; ok {
		if _, exists := chans[ch]; exists {
			delete(chans, ch)
			close(ch)
			if len(chans) == 0 {
				delete(h.clients, userID)
			}
		}
	}
}

// Push 向指定用户的所有在线连接推送通知
func (h *NotificationHub) Push(userID uint, n *model.Notification) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	if chans, ok := h.clients[userID]; ok {
		for ch := range chans {
			select {
			case ch <- n:
			default:
				// channel 满则丢弃，避免阻塞
			}
		}
	}
}

// PushNotification 向指定用户推送一条通知（对外接口）
func PushNotification(userID uint, n *model.Notification) {
	if userID == 0 || n == nil {
		return
	}
	globalHub.Push(userID, n)
}

// RegisterNotification 注册 SSE 连接（对外接口）
func RegisterNotification(userID uint) chan *model.Notification {
	return globalHub.Register(userID)
}

// UnregisterNotification 注销 SSE 连接（对外接口）
func UnregisterNotification(userID uint, ch chan *model.Notification) {
	globalHub.Unregister(userID, ch)
}
