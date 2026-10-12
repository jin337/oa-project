package service

// ============================================================
// 单号生成
// ============================================================
// 已确认规则：
//  1. 单号落在业务主表 bill_no 列（列上加唯一索引兜底），不落在审批实例表；
//  2. 格式：<前缀>-<YYYYMMDD>-<流水>，如 CG-20261012-001；
//     流水按「应用 + 日期」每日重置，最少 3 位；当日超过 999 顺延 4 位继续，不断号；
//  3. 生成时机：提交审核时（保存草稿不生成）；业务行已有单号则复用（撤回后再提交单号不变），
//     删除后重建视为新单，重新取号；
//  4. 应用未配置单号前缀（bill_prefix 为空）时不生成，bill_no 保持为空；
//  5. 取号：事务内对序列行（app_id + period 唯一）加锁自增，避免并发重号。
// ============================================================

import (
	"errors"
	"fmt"
	"strings"
	"time"

	"gorm.io/gorm"

	"back-end/internal/database"
	"back-end/internal/model"
)

// billNoColumn 业务主表承载单号的列名
const billNoColumn = "bill_no"

// billSequenceTable 单号序列表名（含配置的表前缀）
func billSequenceTable() string {
	return bizTablePrefix() + "bill_sequences"
}

// ensureBillNo 提交审核时为业务数据生成单号（幂等）：
//   - 应用未配置单号前缀 → 跳过，不生成
//   - 业务表缺少 bill_no 列（历史表未补列）→ 跳过，不阻断提交
//   - 业务行已有单号 → 复用，不重新取号
func ensureBillNo(appID uint, tableName string, dataID, curUserID uint) error {
	if appID == 0 || dataID == 0 || !isValidTableName(tableName) {
		return nil
	}

	// 1. 读取应用配置中的单号前缀
	var app model.Application
	if err := database.DB.Select("bill_prefix").First(&app, appID).Error; err != nil {
		return errors.New("页面配置不存在")
	}
	prefix := strings.TrimSpace(app.BillPrefix)
	if prefix == "" {
		return nil // 未配置前缀：不生成单号
	}

	// 2. 业务表必须存在 bill_no 列
	real := bizTableName(tableName)
	cols, err := queryColumnSet(real)
	if err != nil {
		return fmt.Errorf("查询表结构失败: %w", err)
	}
	if !cols[billNoColumn] {
		return nil // 历史表未补列：跳过，不阻断提交
	}

	// 3. 已有单号直接复用（幂等：重复提交、撤回后重新提交均不换号）
	var existed string
	if err := database.DB.
		Raw("SELECT IFNULL(`"+billNoColumn+"`, '') FROM `"+real+"` WHERE `id` = ?", dataID).
		Scan(&existed).Error; err != nil {
		return fmt.Errorf("读取单号失败: %w", err)
	}
	if existed != "" {
		return nil
	}

	// 4. 事务内取号并写入业务行（WHERE 再判一次空值，并发下不覆盖已有单号）
	period := time.Now().Format("20060102")
	return database.DB.Transaction(func(tx *gorm.DB) error {
		seq, err := nextBillSeq(tx, appID, period)
		if err != nil {
			return err
		}
		billNo := fmt.Sprintf("%s-%s-%03d", prefix, period, seq)
		if err := tx.Exec(
			"UPDATE `"+real+"` SET `"+billNoColumn+"` = ?, `updated_by` = ? WHERE `id` = ? AND (`"+billNoColumn+"` IS NULL OR `"+billNoColumn+"` = '')",
			billNo, curUserID, dataID,
		).Error; err != nil {
			return fmt.Errorf("写入单号失败: %w", err)
		}
		return nil
	})
}

// nextBillSeq 事务内取下一个流水号：先确保序列行存在（唯一键 app_id + period），再行锁读取并自增
func nextBillSeq(tx *gorm.DB, appID uint, period string) (int64, error) {
	table := billSequenceTable()
	if err := tx.Exec(
		"INSERT IGNORE INTO `"+table+"` (`app_id`, `period`, `seq`, `created_at`, `updated_at`) VALUES (?, ?, 0, NOW(3), NOW(3))",
		appID, period,
	).Error; err != nil {
		return 0, fmt.Errorf("初始化单据序列失败: %w", err)
	}
	var seq int64
	if err := tx.Raw(
		"SELECT `seq` FROM `"+table+"` WHERE `app_id` = ? AND `period` = ? FOR UPDATE",
		appID, period,
	).Scan(&seq).Error; err != nil {
		return 0, fmt.Errorf("读取单据序列失败: %w", err)
	}
	seq++
	if err := tx.Exec(
		"UPDATE `"+table+"` SET `seq` = ?, `updated_at` = NOW(3) WHERE `app_id` = ? AND `period` = ?",
		seq, appID, period,
	).Error; err != nil {
		return 0, fmt.Errorf("更新单据序列失败: %w", err)
	}
	return seq, nil
}
