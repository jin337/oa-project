package service

import (
	"errors"

	"back-end/internal/database"
	"back-end/internal/model"

	"gorm.io/gorm"
)

// NotificationCreate 写入站内通知（幂等：同实例同类型同接收人不重复写）
func NotificationCreate(userID uint, nType int, title, content string, instanceID uint) error {
	if userID == 0 {
		return nil
	}
	var cnt int64
	database.DB.Model(&model.Notification{}).
		Where("user_id = ? AND type = ? AND instance_id = ?", userID, nType, instanceID).
		Count(&cnt)
	if cnt > 0 {
		return nil
	}
	n := model.Notification{
		UserID:     userID,
		Type:       nType,
		Title:      title,
		Content:    content,
		InstanceID: instanceID,
	}
	return database.DB.Create(&n).Error
}

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
