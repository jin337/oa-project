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

// createBizTable 动态创建业务数据表（应用配置的表前缀）。
// 基础结构：主键 + 审计字段 + 软删除标记；withParent 为 true（子表）时额外添加 parent_id 关联主表。
func createBizTable(tableName string, withParent bool) error {
	if !isValidTableName(tableName) {
		return fmt.Errorf("非法的表名: %q", tableName)
	}
	real := bizTableName(tableName)
	if !isValidTableName(real) {
		return fmt.Errorf("表名附加前缀后不合法: %q", real)
	}
	var b strings.Builder
	b.WriteString("CREATE TABLE IF NOT EXISTS `")
	b.WriteString(real)
	b.WriteString("` (")
	b.WriteString("`id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '主键ID',")
	b.WriteString("`created_at` datetime(3) DEFAULT NULL COMMENT '创建时间',")
	b.WriteString("`updated_at` datetime(3) DEFAULT NULL COMMENT '更新时间',")
	b.WriteString("`created_by` bigint unsigned DEFAULT NULL COMMENT '创建人',")
	b.WriteString("`updated_by` bigint unsigned DEFAULT NULL COMMENT '更新人',")
	b.WriteString("`deleted_at` datetime(3) DEFAULT NULL COMMENT '删除时间',")
	if withParent {
		// 子表：额外添加关联主表的外键字段
		b.WriteString("`parent_id` bigint unsigned DEFAULT NULL COMMENT '关联主表ID',")
	}
	b.WriteString("PRIMARY KEY (`id`),")
	b.WriteString("KEY `idx_deleted_at` (`deleted_at`)")
	b.WriteString(") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4")
	return database.DB.Exec(b.String()).Error
}

// createBizTables 按逗号分隔的多个表名逐个建表（自动跳过空白项）：
// 主表不添加 parent_id，子表添加 parent_id 关联主表
func createBizTables(tableName, subTableName string) error {
	if err := createBizTable(tableName, false); err != nil {
		return fmt.Errorf("创建业务表失败: %w", err)
	}
	for _, sub := range strings.Split(subTableName, ",") {
		sub = strings.TrimSpace(sub)
		if sub == "" {
			continue
		}
		if err := createBizTable(sub, true); err != nil {
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
		Code:             fmt.Sprintf("app_%d", time.Now().Unix()), // 自动生成，忽略前端传入
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
	if req.Name != nil {
		app.Name = *req.Name
	}
	if req.TableName != nil {
		app.TableName = *req.TableName
	}
	// 以下字段使用指针，区分“未传递”（保持原值）与“主动清空”（传空串）
	if req.SubTableName != nil {
		app.SubTableName = *req.SubTableName
	}
	if req.FormLayoutJSON != nil {
		app.FormLayoutJSON = *req.FormLayoutJSON
	}
	if req.DetailLayoutJSON != nil {
		app.DetailLayoutJSON = *req.DetailLayoutJSON
	}
	if req.Status == 1 || req.Status == 2 {
		app.Status = req.Status
	}
	app.UpdatedBy = curUserID
	if err := database.DB.Save(&app).Error; err != nil {
		return nil, err
	}
	return &app, nil
}

// ApplicationDelete 删除页面配置（软删除），并级联物理删除关联的业务数据表：
//  1. 先按 id 查询配置记录，获取主表 TableName 与子表 SubTableName（逗号分隔多个）
//  2. 提取主表与拆分后的所有子表，经 bizTableName 拼接前缀，并经 isValidTableName 校验合法性（防 SQL 注入）
//  3. 遍历所有合法表名执行 DROP TABLE IF EXISTS 物理删除
//  4. 所有关联物理表删除成功后再软删除配置记录
//  5. 查询不到配置记录或物理删表失败均中断并返回错误
func ApplicationDelete(id uint) error {
	var app model.Application
	if err := database.DB.First(&app, id).Error; err != nil {
		return errors.New("页面配置不存在")
	}

	// 收集主表 + 子表（逗号分隔，去空白、跳过空项）待删除的表名
	names := []string{app.TableName}
	for _, sub := range strings.Split(app.SubTableName, ",") {
		if sub = strings.TrimSpace(sub); sub != "" {
			names = append(names, sub)
		}
	}

	// 拼接配置前缀并校验表名合法性，仅收集合法表名执行删除（非法表名视为脏配置跳过）
	var realNames []string
	for _, name := range names {
		if !isValidTableName(name) {
			continue
		}
		real := bizTableName(name)
		if !isValidTableName(real) {
			continue
		}
		realNames = append(realNames, real)
	}

	// 物理删除所有关联业务数据表
	for _, real := range realNames {
		if err := database.DB.Exec("DROP TABLE IF EXISTS `" + real + "`").Error; err != nil {
			return fmt.Errorf("删除业务数据表 %s 失败: %w", real, err)
		}
	}

	// 物理表全部删除成功后，再软删除配置记录
	return database.DB.Delete(&model.Application{}, id).Error
}
