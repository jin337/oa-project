package service

import (
	"back-end/internal/database"
	"back-end/internal/model"
)

// OperationLogList 操作审计日志分页查询：按操作人/方法/路径模糊与时间范围过滤
func OperationLogList(req *model.OperationLogListReq) ([]model.OperationLog, int64, error) {
	db := database.DB.Model(&model.OperationLog{})
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
	var total int64
	if err := db.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var list []model.OperationLog
	err := db.Order("id DESC").Offset(req.Offset()).Limit(req.Limit()).Find(&list).Error
	return list, total, err
}
