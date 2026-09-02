package service

import (
	"errors"
	"fmt"
	"regexp"
	"strings"
	"time"

	"back-end/internal/config"
	"back-end/internal/database"
	"back-end/internal/model"
)

// bizTablePrefix 读取配置表前缀并规范化（确保以 _ 结尾，与系统表 oa_ 风格一致）
func bizTablePrefix() string {
	p := strings.TrimRight(config.Cfg.MySQL.TablePrefix, "_")
	if p == "" {
		return ""
	}
	return p + "_"
}

// bizTableName 给业务表名附加配置前缀
func bizTableName(raw string) string {
	return bizTablePrefix() + raw
}

// ApplicationList 页面配置分页列表：keyword 模糊匹配 name 或 code
func ApplicationList(req *model.ApplicationListReq) ([]model.Application, int64, error) {
	db := database.DB.Model(&model.Application{})
	if req.Keyword != "" {
		kw := "%" + req.Keyword + "%"
		db = db.Where("name LIKE ? OR code LIKE ?", kw, kw)
	}
	var total int64
	if err := db.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var list []model.Application
	err := db.Order("id ASC").Offset(req.Offset()).Limit(req.Limit()).Find(&list).Error
	return list, total, err
}

// ApplicationDetail 页面配置详情
func ApplicationDetail(id uint) (*model.Application, error) {
	var app model.Application
	if err := database.DB.First(&app, id).Error; err != nil {
		return nil, errors.New("页面配置不存在")
	}
	return &app, nil
}

// code 唯一性校验：GORM 软删除只加 deleted_at 条件，而数据库唯一索引覆盖全部行（含软删除），
// 因此查重必须 Unscoped 带上已删除记录，否则检查通过但入库仍撞唯一键报 Error 1062
func checkApplicationCodeExists(code string, excludeID uint) bool {
	var count int64
	db := database.DB.Unscoped().Model(&model.Application{}).Where("code = ?", code)
	if excludeID > 0 {
		db = db.Where("id <> ?", excludeID)
	}
	db.Count(&count)
	return count > 0
}

// tableNamePattern 表名合法性：字母/数字/下划线，首字符为字母或下划线，总长不超过 64，防 SQL 注入
var tableNamePattern = regexp.MustCompile(`^[a-zA-Z_][a-zA-Z0-9_]{0,63}$`)

func isValidTableName(name string) bool {
	return tableNamePattern.MatchString(name)
}

// createBizTable 动态创建业务数据表（应用配置的表前缀，基础结构：主键 + 审计字段 + 软删除标记）
func createBizTable(tableName string) error {
	if !isValidTableName(tableName) {
		return fmt.Errorf("非法的表名: %q", tableName)
	}
	real := bizTableName(tableName)
	if !isValidTableName(real) {
		return fmt.Errorf("表名附加前缀后不合法: %q", real)
	}
	createSQL := fmt.Sprintf(
		"CREATE TABLE IF NOT EXISTS `%s` ("+
			"`id` bigint unsigned NOT NULL AUTO_INCREMENT,"+
			"`created_at` datetime(3) DEFAULT NULL,"+
			"`updated_at` datetime(3) DEFAULT NULL,"+
			"`created_by` bigint unsigned DEFAULT NULL,"+
			"`updated_by` bigint unsigned DEFAULT NULL,"+
			"`deleted_at` datetime(3) DEFAULT NULL,"+
			"PRIMARY KEY (`id`),"+
			"KEY `idx_deleted_at` (`deleted_at`)"+
			") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
		real)
	return database.DB.Exec(createSQL).Error
}

// createBizTables 按逗号分隔的多个表名逐个建表（自动跳过空白项）
func createBizTables(tableName, subTableName string) error {
	if err := createBizTable(tableName); err != nil {
		return fmt.Errorf("创建业务表失败: %w", err)
	}
	for _, sub := range strings.Split(subTableName, ",") {
		sub = strings.TrimSpace(sub)
		if sub == "" {
			continue
		}
		if err := createBizTable(sub); err != nil {
			return fmt.Errorf("创建子表失败: %w", err)
		}
	}
	return nil
}

// ApplicationCreate 新增页面配置：
//  1. 根据 TableName/SubTableName（逗号分隔）动态创建业务数据表
//  2. 自动生成 code（app- + Unix 时间戳），忽略前端传入值
//  3. 持久化配置（含布局 JSON）
func ApplicationCreate(curUserID uint, req *model.ApplicationCreateReq) (*model.Application, error) {
	if err := createBizTables(req.TableName, req.SubTableName); err != nil {
		return nil, err
	}
	status := req.Status
	if status == 0 {
		status = 1
	}
	app := model.Application{
		Name:             req.Name,
		Code:             fmt.Sprintf("app-%d", time.Now().Unix()), // 自动生成，忽略前端传入
		TableName:        req.TableName,
		SubTableName:     req.SubTableName,
		Status:           status,
		FormLayoutJSON:   req.FormLayoutJSON,
		DetailLayoutJSON: req.DetailLayoutJSON,
	}
	app.CreatedBy, app.UpdatedBy = curUserID, curUserID
	if err := database.DB.Create(&app).Error; err != nil {
		return nil, err
	}
	return &app, nil
}

// ApplicationUpdate 修改页面配置
func ApplicationUpdate(curUserID, id uint, req *model.ApplicationUpdateReq) (*model.Application, error) {
	var app model.Application
	if err := database.DB.First(&app, id).Error; err != nil {
		return nil, errors.New("页面配置不存在")
	}
	if req.Code != "" && req.Code != app.Code {
		if checkApplicationCodeExists(req.Code, id) {
			return nil, errors.New("页面编码已存在")
		}
		app.Code = req.Code
	}
	if req.Name != "" {
		app.Name = req.Name
	}
	if req.TableName != "" {
		app.TableName = req.TableName
	}
	// 子表名与布局 JSON 允许清空
	app.SubTableName = req.SubTableName
	app.FormLayoutJSON = req.FormLayoutJSON
	app.DetailLayoutJSON = req.DetailLayoutJSON
	if req.Status == 1 || req.Status == 2 {
		app.Status = req.Status
	}
	app.UpdatedBy = curUserID
	if err := database.DB.Save(&app).Error; err != nil {
		return nil, err
	}
	return &app, nil
}

// ApplicationDelete 删除页面配置（软删除）
func ApplicationDelete(id uint) error {
	return database.DB.Delete(&model.Application{}, id).Error
}
