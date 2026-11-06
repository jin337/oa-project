package service

import (
	"fmt"
	"strconv"
	"time"

	"back-end/internal/config"
	"back-end/internal/database"
	"back-end/internal/model"

	"github.com/xuri/excelize/v2"
	"gorm.io/gorm"
)

// OperationLogList 操作审计日志分页查询：按操作人/方法/路径模糊与时间范围过滤
func OperationLogList(req *model.OperationLogListReq) ([]model.OperationLog, int64, error) {
	db := applyOperationLogFilter(database.DB.Model(&model.OperationLog{}), req)
	var total int64
	if err := db.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var list []model.OperationLog
	err := db.Order("id DESC").Offset(req.Offset()).Limit(req.Limit()).Find(&list).Error
	return list, total, err
}

// applyOperationLogFilter 追加审计日志筛选条件（列表与导出共用，保证两个入口口径一致）
func applyOperationLogFilter(db *gorm.DB, req *model.OperationLogListReq) *gorm.DB {
	if req.Username != "" {
		db = db.Where("username LIKE ?", "%"+req.Username+"%")
	}
	if req.Method != "" {
		db = db.Where("method = ?", req.Method)
	}
	if req.Path != "" {
		db = db.Where("path LIKE ?", "%"+req.Path+"%")
	}
	if req.Start != "" {
		db = db.Where("created_at >= ?", req.Start+" 00:00:00")
	}
	if req.End != "" {
		db = db.Where("created_at <= ?", req.End+" 23:59:59")
	}
	return db
}

// OperationLogCleanup 清理超过配置保留天数的审计日志（物理删除，日志表无业务软删语义）。
// RetainDays<=0 表示永久保留（直接跳过）。分批删除避免一次锁大量行。
func OperationLogCleanup() (int64, error) {
	retain := config.Cfg.Server.OperationLog.RetainDays
	if retain <= 0 {
		return 0, nil
	}
	// 表名按模型解析（含配置表前缀），避免硬编码随环境漂移
	stmt := &gorm.Statement{DB: database.DB}
	if err := stmt.Parse(&model.OperationLog{}); err != nil {
		return 0, err
	}
	table := stmt.Table

	deadline := time.Now().AddDate(0, 0, -retain)
	var affected int64
	for {
		res := database.DB.Exec("DELETE FROM `"+table+"` WHERE created_at < ? LIMIT 5000", deadline)
		if res.Error != nil {
			return affected, res.Error
		}
		affected += res.RowsAffected
		if res.RowsAffected < 5000 {
			return affected, nil
		}
	}
}

// operationLogExportLimit 导出行数上限：防止超大结果集撑爆内存，前端需靠筛选收敛范围
const operationLogExportLimit = 50000

// OperationLogExport 按筛选条件导出审计日志为 xlsx，返回文件字节流。
// 凭据类请求体在入库时已脱敏，导出内容与列表可见口径一致。
func OperationLogExport(req *model.OperationLogListReq) ([]byte, error) {
	var list []model.OperationLog
	err := applyOperationLogFilter(database.DB.Model(&model.OperationLog{}), req).
		Order("id DESC").Limit(operationLogExportLimit).Find(&list).Error
	if err != nil {
		return nil, err
	}

	f := excelize.NewFile()
	defer func() { _ = f.Close() }()
	const sheet = "Sheet1"

	headers := []string{"操作时间", "操作人", "方法", "路径", "查询参数", "请求体", "状态", "IP", "耗时(ms)"}
	cell := make([]string, len(headers))
	for i, h := range headers {
		cell[i] = h
	}
	if err := f.SetSheetRow(sheet, "A1", &cell); err != nil {
		return nil, fmt.Errorf("写表头: %w", err)
	}
	// 表头加粗（默认样式仅改字体属性即可）
	if style, err := f.NewStyle(&excelize.Style{Font: &excelize.Font{Bold: true}}); err == nil {
		_ = f.SetRowStyle(sheet, 1, 1, style)
	}

	for i, l := range list {
		row := []string{
			l.CreatedAt.Format("2006-01-02 15:04:05"),
			l.Username,
			l.Method,
			l.Path,
			l.Query,
			l.Body,
			strconv.Itoa(l.Status),
			l.IP,
			strconv.FormatInt(l.ElapsedMs, 10),
		}
		if err := f.SetSheetRow(sheet, "A"+strconv.Itoa(i+2), &row); err != nil {
			return nil, fmt.Errorf("写第%d行: %w", i+2, err)
		}
	}
	// 列宽按内容量给固定值，避免 Excel 打开后全部挤在一列
	widths := []struct {
		col string
		w   float64
	}{
		{"A", 20}, {"B", 14}, {"C", 9}, {"D", 42}, {"E", 30}, {"F", 60}, {"G", 8}, {"H", 15}, {"I", 10},
	}
	for _, cw := range widths {
		_ = f.SetColWidth(sheet, cw.col, cw.col, cw.w)
	}

	buf, err := f.WriteToBuffer()
	if err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}
