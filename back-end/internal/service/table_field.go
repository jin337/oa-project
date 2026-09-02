package service

import (
	"errors"
	"fmt"
	"strings"

	"back-end/internal/database"
	"back-end/internal/model"
)

// validFieldTypes 允许的字段类型白名单（与前端 TableManage.jsx FIELD_TYPES 一致）
var validFieldTypes = map[string]bool{
	"varchar": true, "char": true, "text": true,
	"int": true, "bigint": true, "tinyint": true, "smallint": true,
	"decimal": true, "float": true, "double": true,
	"date": true, "datetime": true, "timestamp": true, "time": true,
	"boolean": true, "json": true, "blob": true,
}

// columnTypeSQL 根据类型与长度生成 MySQL 列类型定义（长度仅对 varchar/char/decimal 生效）
func columnTypeSQL(typ string, length int) string {
	lower := strings.ToLower(typ)
	switch lower {
	case "varchar", "char":
		l := length
		if l <= 0 {
			l = 255
		}
		return fmt.Sprintf("%s(%d)", lower, l)
	case "decimal":
		if length > 0 {
			return fmt.Sprintf("decimal(%d,2)", length)
		}
		return "decimal(10,2)"
	case "boolean":
		return "tinyint(1)"
	case "int", "bigint", "tinyint", "smallint", "float", "double",
		"date", "datetime", "timestamp", "time", "text", "json", "blob":
		return lower
	default:
		return ""
	}
}

// isValidFieldName 字段名校验（复用表名规则：字母/数字/下划线，首字符字母或下划线，限长 64）
func isValidFieldName(name string) bool {
	return isValidTableName(name)
}

// containsTable 判断 tableName 是否在逗号分隔的表名列表中
func containsTable(subTableName, tableName string) bool {
	for _, s := range strings.Split(subTableName, ",") {
		if strings.TrimSpace(s) == tableName {
			return true
		}
	}
	return false
}

// getApplicationBizTableBy 校验 tableName 属于该页面配置（主表或子表），返回带前缀物理表名
func getApplicationBizTableBy(appID uint, tableName string) (string, error) {
	if !isValidTableName(tableName) {
		return "", errors.New("非法的表名")
	}
	app, err := ApplicationDetail(appID)
	if err != nil {
		return "", err
	}
	if app.TableName != tableName && !containsTable(app.SubTableName, tableName) {
		return "", errors.New("表不属于该页面配置")
	}
	return bizTableName(tableName), nil
}

// columnExists 检查业务表列是否存在
func columnExists(tableName, columnName string) bool {
	var cnt int64
	database.DB.Raw(
		"SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?",
		tableName, columnName).Scan(&cnt)
	return cnt > 0
}

// columnSelectSQL 查询物理业务表列定义（来源：information_schema.columns）
var columnSelectSQL = `SELECT
	COLUMN_NAME AS id,
	COLUMN_NAME AS name,
	DATA_TYPE AS type,
	COALESCE(CHARACTER_MAXIMUM_LENGTH, NUMERIC_PRECISION, 0) AS length,
	IF(IS_NULLABLE = 'NO', 1, 0) AS not_null,
	COALESCE(COLUMN_DEFAULT, '') AS default_value,
	COALESCE(COLUMN_COMMENT, '') AS comment
FROM information_schema.columns
WHERE table_schema = DATABASE() AND table_name = ?`

// queryColumns 查询业务表全部列（按物理顺序）
func queryColumns(tableName string) ([]model.TableColumn, error) {
	var cols []model.TableColumn
	if err := database.DB.Raw(columnSelectSQL+" ORDER BY ORDINAL_POSITION", tableName).Scan(&cols).Error; err != nil {
		return nil, err
	}
	return cols, nil
}

// getTableColumn 查询业务表单列定义
func getTableColumn(tableName, columnName string) (*model.TableColumn, error) {
	var col model.TableColumn
	if err := database.DB.Raw(columnSelectSQL+" AND column_name = ?", tableName, columnName).Scan(&col).Error; err != nil {
		return nil, err
	}
	if col.Name == "" {
		return nil, errors.New("字段不存在")
	}
	return &col, nil
}

// escapeDDLStr 转义 DDL 字面量中的单引号（用于 DEFAULT/COMMENT），防 SQL 注入
func escapeDDLStr(s string) string {
	return strings.ReplaceAll(s, "'", "\\'")
}

// columnDefSQL 生成列定义子句：`name` colType [NOT NULL] [DEFAULT 'x'] [COMMENT 'x']
func columnDefSQL(col *model.TableColumn) string {
	colType := columnTypeSQL(col.Type, col.Length)
	if colType == "" {
		return ""
	}
	parts := []string{"`" + col.Name + "`", colType}
	if col.NotNull == 1 {
		parts = append(parts, "NOT NULL")
	}
	if col.DefaultValue != "" {
		parts = append(parts, "DEFAULT '"+escapeDDLStr(col.DefaultValue)+"'")
	}
	if col.Comment != "" {
		parts = append(parts, "COMMENT '"+escapeDDLStr(col.Comment)+"'")
	}
	return strings.Join(parts, " ")
}

// TableFieldList 查询指定物理业务表（主表或子表）实际存在的列，支持按字段名模糊匹配与分页
func TableFieldList(appID uint, tableName string, req *model.TableFieldListReq) ([]model.TableColumn, int64, error) {
	real, err := getApplicationBizTableBy(appID, tableName)
	if err != nil {
		return nil, 0, err
	}
	all, err := queryColumns(real)
	if err != nil {
		return nil, 0, err
	}
	filtered := make([]model.TableColumn, 0, len(all))
	for _, c := range all {
		if req.Name == "" || strings.Contains(c.Name, req.Name) {
			filtered = append(filtered, c)
		}
	}
	total := int64(len(filtered))
	offset, limit := req.Offset(), req.Limit()
	if offset >= len(filtered) {
		return []model.TableColumn{}, total, nil
	}
	end := offset + limit
	if end > len(filtered) {
		end = len(filtered)
	}
	return filtered[offset:end], total, nil
}

// TableFieldCreate 在指定物理业务表（主表或子表）中新增列（ALTER TABLE ... ADD COLUMN）
func TableFieldCreate(appID uint, tableName string, req *model.TableFieldCreateReq) (*model.TableColumn, error) {
	real, err := getApplicationBizTableBy(appID, tableName)
	if err != nil {
		return nil, err
	}
	if !isValidFieldName(req.Name) {
		return nil, errors.New("非法的字段名称")
	}
	if !validFieldTypes[strings.ToLower(req.Type)] {
		return nil, errors.New("不支持的字段类型: " + req.Type)
	}
	if columnExists(real, req.Name) {
		return nil, errors.New("字段已存在")
	}
	colDef := columnDefSQL(&model.TableColumn{
		Name: req.Name, Type: req.Type, Length: req.Length,
		NotNull: req.NotNull, DefaultValue: req.DefaultValue, Comment: req.Comment,
	})
	if colDef == "" {
		return nil, errors.New("不支持的字段类型: " + req.Type)
	}
	if err := database.DB.Exec("ALTER TABLE `" + real + "` ADD COLUMN " + colDef).Error; err != nil {
		return nil, fmt.Errorf("创建数据库字段失败: %w", err)
	}
	return getTableColumn(real, req.Name)
}

// TableFieldUpdate 修改指定物理业务表（主表或子表）列定义（ALTER TABLE ... CHANGE/MODIFY COLUMN）
func TableFieldUpdate(appID uint, tableName, oldName string, req *model.TableFieldUpdateReq) (*model.TableColumn, error) {
	real, err := getApplicationBizTableBy(appID, tableName)
	if err != nil {
		return nil, err
	}
	old, err := getTableColumn(real, oldName)
	if err != nil {
		return nil, err
	}
	// 合并请求字段与现有列定义
	col := *old
	if req.Name != "" {
		if !isValidFieldName(req.Name) {
			return nil, errors.New("非法的字段名称")
		}
		if req.Name != oldName {
			if columnExists(real, req.Name) {
				return nil, errors.New("字段已存在")
			}
		}
		col.Name = req.Name
	}
	if req.Type != "" {
		if !validFieldTypes[strings.ToLower(req.Type)] {
			return nil, errors.New("不支持的字段类型: " + req.Type)
		}
		col.Type = req.Type
	}
	if req.Length > 0 {
		col.Length = req.Length
	}
	if req.NotNull != nil {
		col.NotNull = *req.NotNull
	}
	// 默认值与注释允许清空（前端表单总传完整值）
	col.DefaultValue = req.DefaultValue
	col.Comment = req.Comment

	colDef := columnDefSQL(&col)
	if colDef == "" {
		return nil, errors.New("不支持的字段类型: " + col.Type)
	}
	var ddl string
	if col.Name != oldName {
		ddl = fmt.Sprintf("ALTER TABLE `%s` CHANGE COLUMN `%s` %s", real, oldName, colDef)
	} else {
		ddl = fmt.Sprintf("ALTER TABLE `%s` MODIFY COLUMN %s", real, colDef)
	}
	if err := database.DB.Exec(ddl).Error; err != nil {
		return nil, fmt.Errorf("修改数据库字段失败: %w", err)
	}
	return getTableColumn(real, col.Name)
}

// TableFieldDelete 删除指定物理业务表（主表或子表）列（ALTER TABLE ... DROP COLUMN，不可逆）
func TableFieldDelete(appID uint, tableName, fieldName string) error {
	real, err := getApplicationBizTableBy(appID, tableName)
	if err != nil {
		return err
	}
	if !columnExists(real, fieldName) {
		return errors.New("字段不存在")
	}
	if err := database.DB.Exec("ALTER TABLE `" + real + "` DROP COLUMN `" + fieldName + "`").Error; err != nil {
		return fmt.Errorf("删除数据库字段失败: %w", err)
	}
	return nil
}
