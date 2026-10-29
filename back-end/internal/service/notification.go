package service

import (
	"context"
	"errors"
	"sync"

	"back-end/internal/database"
	"back-end/internal/model"

	"gorm.io/gorm"
)

// NotificationList 我的通知列表
func NotificationList(userID uint, page, size int) ([]model.Notification, int64, error) {
	if page <= 0 {
		page = 1
	}
	if size <= 0 {
		size = 10
	}
	var list []model.Notification
	var total int64
	db := database.DB.Model(&model.Notification{}).Where("user_id = ? AND read_at IS NULL", userID)
	db.Count(&total)
	err := db.Order("created_at DESC").Offset((page - 1) * size).Limit(size).Find(&list).Error
	return list, total, err
}

// NotificationUnreadCount 未读数
func NotificationUnreadCount(userID uint) (int64, error) {
	var cnt int64
	err := database.DB.Model(&model.Notification{}).
		Where("user_id = ? AND read_at IS NULL", userID).
		Count(&cnt).Error
	return cnt, err
}

// NotificationReadAll 全部已读
func NotificationReadAll(userID uint) error {
	return database.DB.Model(&model.Notification{}).
		Where("user_id = ? AND read_at IS NULL", userID).
		Update("read_at", gorm.Expr("NOW()")).Error
}

// NotificationRead 单条已读
func NotificationRead(userID, id uint) error {
	res := database.DB.Model(&model.Notification{}).
		Where("id = ? AND user_id = ? AND read_at IS NULL", id, userID).
		Update("read_at", gorm.Expr("NOW()"))
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return errors.New("通知不存在或已读")
	}
	return nil
}

// NotificationCleanup 清理已读超过30天的通知
func NotificationCleanup() error {
	return database.DB.Unscoped().
		Where("read_at IS NOT NULL AND read_at < DATE_SUB(NOW(), INTERVAL 30 DAY)").
		Delete(&model.Notification{}).Error
}

// ============================================================
// 事务内通知 + 提交后实时推送
// ============================================================
// 通知行必须在业务事务内写入（与实例/任务状态保持一致），但推送到 SSE 必须发生在
// 事务提交成功之后——否则事务回滚会向用户推出「幽灵通知」。
//
// 约定：
//   - 事务内写通知用 notifyCreate(tx, n) 代替 tx.Create(&model.Notification{})
//   - 事务入口用 withNotify(fn) 代替 database.DB.Transaction(fn)
//   - 提交成功后由 withNotify 统一 flush 到 SSE；事务回滚则整队列丢弃
//
// 漏用 notifyCreate 只会导致该条通知不推送（不报错、不影响业务），不会造成数据不一致。

type notifyQueueKey struct{}

// notifyQueue 收集事务内产生的通知，待事务提交成功后统一推送。
type notifyQueue struct {
	items []model.Notification
}

// withNotify 在事务中执行 fn，并在事务提交成功后把事务内产生的通知推送到 SSE。
func withNotify(fn func(tx *gorm.DB) error) error {
	q := &notifyQueue{}
	ctx := context.WithValue(context.Background(), notifyQueueKey{}, q)
	if err := database.DB.WithContext(ctx).Transaction(fn); err != nil {
		return err // 事务回滚：队列整体丢弃，不推送
	}
	q.flush()
	return nil
}

// notifyCreate 在事务内写入站内通知，并登记为「提交后推送」。
// 写库失败只跳过推送登记，不影响业务流程。
func notifyCreate(tx *gorm.DB, n model.Notification) {
	if err := tx.Create(&n).Error; err != nil {
		return
	}
	q, _ := tx.Statement.Context.Value(notifyQueueKey{}).(*notifyQueue)
	if q == nil {
		return
	}
	q.items = append(q.items, n)
}

// flush 把队列中的通知推送给在线用户（调用时事务已提交）。
func (q *notifyQueue) flush() {
	for i := range q.items {
		n := q.items[i]
		PushNotification(n.UserID, &n)
	}
}

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
	globalHub.mu.RLock()
	globalHub.mu.RUnlock()
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
