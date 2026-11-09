package service

import (
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"back-end/internal/database"
	"back-end/internal/model"

	"gorm.io/gorm"
)

// 待办超时提醒规则：
//   - 超时时长取自实例提交时冻结的其他设置快照 approval_other_json.taskTimeout = { value, unit }；
//     未配置 / 0 表示不限时、不提醒（历史实例天然不触发）。
//   - 起算点为任务自身 created_at：任务在流程推进到该节点时才创建，依次审批的后续节点尚无任务，不会被误判。
//   - 只发站内通知，不改变任何审批状态（不做自动通过/驳回）。
const (
	// overdueRemindLimit 同一待办任务最多发送的超时提醒条数
	overdueRemindLimit = 3
	// overdueRemindInterval 同一待办任务两次超时提醒的最小间隔
	overdueRemindInterval = 24 * time.Hour
	// overdueScanBatch 单次扫描的任务条数上限，避免一次性拉起过多任务
	overdueScanBatch = 500
	// urgeInterval 同一实例两次发起人催办的最小间隔
	urgeInterval = 30 * time.Minute
)

// parseTaskTimeout 从审批其他设置快照解析「待办超时提醒」时长。
// 结构与其他时间窗一致：taskTimeout = { value, unit }，unit 支持 minute/hour/day，value 必须为正数。
// 快照可能是已反序列化的 map，也可能是 JSON 字符串（旧数据），两种都兼容。
func parseTaskTimeout(otherConfig any) (time.Duration, bool) {
	if s, ok := otherConfig.(string); ok && s != "" {
		var m map[string]interface{}
		if err := json.Unmarshal([]byte(s), &m); err != nil {
			return 0, false
		}
		otherConfig = m
	}
	return parseWindowDurationByKey(otherConfig, "taskTimeout")
}

// parseTaskAdvance 从审批其他设置快照解析「待办到期预警」的提前时长。
// 结构同 taskTimeout：taskAdvance = { value, unit }，0 / 缺失表示不预警。
func parseTaskAdvance(otherConfig any) (time.Duration, bool) {
	if s, ok := otherConfig.(string); ok && s != "" {
		var m map[string]interface{}
		if err := json.Unmarshal([]byte(s), &m); err != nil {
			return 0, false
		}
		otherConfig = m
	}
	return parseWindowDurationByKey(otherConfig, "taskAdvance")
}

// humanDuration 把时长转成便于阅读的中文描述（只用于通知文案）
func humanDuration(d time.Duration) string {
	if d < 0 {
		d = 0
	}
	if d < time.Minute {
		return "不到 1 分钟"
	}
	days := int(d / (24 * time.Hour))
	d -= time.Duration(days) * 24 * time.Hour
	hours := int(d / time.Hour)
	d -= time.Duration(hours) * time.Hour
	mins := int(d / time.Minute)
	switch {
	case days > 0 && hours > 0:
		return fmt.Sprintf("%d 天 %d 小时", days, hours)
	case days > 0:
		return fmt.Sprintf("%d 天", days)
	case hours > 0 && mins > 0:
		return fmt.Sprintf("%d 小时 %d 分钟", hours, mins)
	case hours > 0:
		return fmt.Sprintf("%d 小时", hours)
	default:
		return fmt.Sprintf("%d 分钟", mins)
	}
}

// OverdueNotificationScan 扫描待办任务并发送站内提醒，返回 (超时提醒条数, 到期预警条数)。
// 超时规则：任务 created_at + 超时时长 <= 现在；同一任务最多提醒 3 次、两次提醒间隔不少于 24 小时。
// 预警规则：尚未超时、距截止不足提前时长且从未预警时，发送一次到期提醒；
// 提前时长不短于超时时长视为未配置（否则任务一创建就会命中）。
// 只发通知，不改变审批流转。
func OverdueNotificationScan() (int, int, error) {
	now := time.Now()

	var tasks []model.ApprovalInstanceTask
	if err := database.DB.
		Where("status = ? AND operated_at IS NULL AND remind_count < ?", model.TaskStatusPending, overdueRemindLimit).
		Order("id ASC").
		Limit(overdueScanBatch).
		Find(&tasks).Error; err != nil {
		return 0, 0, err
	}
	if len(tasks) == 0 {
		return 0, 0, nil
	}

	type instanceConf struct {
		timeout time.Duration
		advance time.Duration
		enabled bool
		appName string
	}
	cache := make(map[uint]instanceConf, 8)
	reminded, advanced := 0, 0

	for _, t := range tasks {
		conf, cached := cache[t.InstanceID]
		if !cached {
			var inst model.ApprovalInstance
			if err := database.DB.First(&inst, t.InstanceID).Error; err != nil {
				cache[t.InstanceID] = instanceConf{}
				continue
			}
			timeout, hasTimeout := parseTaskTimeout(inst.ApprovalOtherJSON)
			advance, _ := parseTaskAdvance(inst.ApprovalOtherJSON)
			// 提前时长必须短于超时时长，否则任务创建即满足预警条件，按未配置处理
			if advance >= timeout {
				advance = 0
			}
			conf = instanceConf{
				timeout: timeout,
				advance: advance,
				enabled: hasTimeout && timeout > 0 && inst.Status == model.InstanceStatusRunning,
				appName: getInstanceAppName(&inst),
			}
			cache[t.InstanceID] = conf
		}
		if !conf.enabled {
			continue
		}

		deadline := t.CreatedAt.Add(conf.timeout)

		// 尚未超时：距截止不足提前时长时发一次到期预警，同一任务只发一次
		if now.Before(deadline) {
			if conf.advance <= 0 || t.AdvanceRemindedAt != nil {
				continue
			}
			if deadline.Sub(now) > conf.advance {
				continue
			}
			// 预警文案固定，不随扫描时点的剩余时长变化，同一类提醒措辞一致
			msg := "待办即将超时，请尽快处理"
			err := withNotify(func(tx *gorm.DB) error {
				// 条件更新：只有任务仍处于待处理且从未预警过才写入，
				// 并发扫描或用户刚处理完时不会重复发送。
				res := tx.Model(&model.ApprovalInstanceTask{}).
					Where("id = ? AND status = ? AND advance_reminded_at IS NULL", t.ID, model.TaskStatusPending).
					Update("advance_reminded_at", now)
				if res.Error != nil {
					return res.Error
				}
				if res.RowsAffected == 0 {
					return nil
				}
				notifyCreate(tx, model.Notification{
					UserID:     t.AssigneeID,
					Type:       model.NotificationTypeAdvance,
					Title:      conf.appName,
					Msg:        msg,
					InstanceID: t.InstanceID,
				})
				advanced++
				return nil
			})
			if err != nil {
				return reminded, advanced, err
			}
			continue
		}

		// 已超时：首次立即提醒；之后每满 24 小时续催一次，直到达到上限
		if t.RemindedAt != nil && now.Sub(*t.RemindedAt) < overdueRemindInterval {
			continue
		}

		msg := fmt.Sprintf("待办已超时 %s未处理，请尽快处理", humanDuration(now.Sub(deadline)))
		if len([]rune(msg)) > 200 {
			msg = "待办已超时未处理，请尽快处理"
		}

		err := withNotify(func(tx *gorm.DB) error {
			// 条件更新：只有任务仍处于待处理且次数未达上限时才累加，
			// 并发扫描或用户刚处理完时不会重复发送。
			res := tx.Model(&model.ApprovalInstanceTask{}).
				Where("id = ? AND status = ? AND remind_count < ?", t.ID, model.TaskStatusPending, overdueRemindLimit).
				Updates(map[string]interface{}{
					"reminded_at":  now,
					"remind_count": gorm.Expr("remind_count + 1"),
				})
			if res.Error != nil {
				return res.Error
			}
			if res.RowsAffected == 0 {
				return nil
			}
			notifyCreate(tx, model.Notification{
				UserID:     t.AssigneeID,
				Type:       model.NotificationTypeOverdue,
				Title:      conf.appName,
				Msg:        msg,
				InstanceID: t.InstanceID,
			})
			reminded++
			return nil
		})
		if err != nil {
			return reminded, advanced, err
		}
	}

	return reminded, advanced, nil
}

// UrgeApprovalInstance 发起人手动催办：给当前待处理任务的审批人发送站内催办通知。
// 权限：仅实例发起人；状态：仅进行中；限频：同一实例 30 分钟内只能催办一次。
// 返回本次实际催办的待办人数。只发通知，不改变审批流转。
func UrgeApprovalInstance(curUserID, instanceID uint) (int, error) {
	var inst model.ApprovalInstance
	if err := database.DB.First(&inst, instanceID).Error; err != nil {
		return 0, errors.New("审批实例不存在")
	}
	if inst.DeletedAt.Valid {
		return 0, errors.New("审批实例不存在")
	}
	if inst.CreatedBy != curUserID {
		return 0, errors.New("只有发起人可以催办")
	}
	if inst.Status != model.InstanceStatusRunning {
		return 0, errors.New("该申请已结束，无需催办")
	}

	var tasks []model.ApprovalInstanceTask
	if err := database.DB.
		Where("instance_id = ? AND status = ?", instanceID, model.TaskStatusPending).
		Find(&tasks).Error; err != nil {
		return 0, err
	}
	if len(tasks) == 0 {
		return 0, errors.New("当前没有待处理的审批人")
	}

	now := time.Now()
	for _, t := range tasks {
		if t.UrgedAt != nil && now.Sub(*t.UrgedAt) < urgeInterval {
			return 0, fmt.Errorf("催办过于频繁，请 %d 分钟后再试", int(urgeInterval/time.Minute))
		}
	}

	appName := getInstanceAppName(&inst)
	count := 0
	err := withNotify(func(tx *gorm.DB) error {
		for _, t := range tasks {
			// 发起人自己也在待办中时跳过，避免给自己发催办
			if t.AssigneeID == curUserID {
				continue
			}
			if err := tx.Model(&model.ApprovalInstanceTask{}).
				Where("id = ?", t.ID).
				Update("urged_at", now).Error; err != nil {
				continue
			}
			notifyCreate(tx, model.Notification{
				UserID:     t.AssigneeID,
				Type:       model.NotificationTypeOverdue,
				Title:      appName,
				Msg:        "发起人催办：您有审批待办待处理，请尽快处理",
				InstanceID: inst.ID,
			})
			count++
		}
		return nil
	})
	if err != nil {
		return 0, err
	}
	if count == 0 {
		return 0, errors.New("当前待办人无需催办")
	}
	return count, nil
}
