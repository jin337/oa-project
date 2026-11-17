package service

import (
	"encoding/json"
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

// appFieldSystemCols 物理业务表系统列：禁止通过字段管理接口增删改，也不作为业务字段对外展示
// 字段集合由 systemCols 派生（审计字段 + 主键 + 子表关联列），定义见 helper.go
var appFieldSystemCols = systemCols("id", "parent_id")

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
	app, _, err := ApplicationDetail(appID)
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

// columnDataExpr 返回判断单列是否存在“有业务含义的数据”的 SQL 条件。
// 字符串列排除 NULL 和纯空白；JSON/BLOB 排除 NULL 和空内容；其余类型只排除 NULL，
// 因此数字 0、布尔 false、日期值都算已有数据。
func columnDataExpr(col model.TableColumn) string {
	quoted := "`" + col.Name + "`"
	switch strings.ToLower(col.Type) {
	case "varchar", "char", "text":
		return fmt.Sprintf("(%s IS NOT NULL AND TRIM(%s) <> '')", quoted, quoted)
	case "json":
		return fmt.Sprintf("(%s IS NOT NULL AND JSON_LENGTH(%s) > 0)", quoted, quoted)
	case "blob":
		return fmt.Sprintf("(%s IS NOT NULL AND OCTET_LENGTH(%s) > 0)", quoted, quoted)
	default:
		return fmt.Sprintf("(%s IS NOT NULL)", quoted)
	}
}

// columnsHaveData 一次扫描物理表，按列统计是否存在数据。
// 口径包含软删除行：软删除行仍是已有数据，避免历史数据失去承载列。
func columnsHaveData(realTable string, cols []model.TableColumn) (map[string]bool, error) {
	result := make(map[string]bool, len(cols))
	if len(cols) == 0 {
		return result, nil
	}
	parts := make([]string, len(cols))
	for i, col := range cols {
		if !isValidFieldName(col.Name) {
			return nil, fmt.Errorf("非法的字段名称: %s", col.Name)
		}
		parts[i] = fmt.Sprintf("COUNT(CASE WHEN %s THEN 1 END) AS c%d", columnDataExpr(col), i)
	}
	query := fmt.Sprintf("SELECT %s FROM `%s`", strings.Join(parts, ", "), realTable)
	rows, err := database.DB.Raw(query).Rows()
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	values := make([]int64, len(cols))
	dest := make([]interface{}, len(cols))
	for i := range values {
		dest[i] = &values[i]
	}
	if !rows.Next() {
		return nil, errors.New("查询字段数据量失败: 结果集为空")
	}
	if err := rows.Scan(dest...); err != nil {
		return nil, err
	}
	for i, col := range cols {
		result[col.Name] = values[i] > 0
	}
	return result, nil
}

// columnHasData 判断指定列是否存在数据，口径同 columnsHaveData。
func columnHasData(realTable string, col *model.TableColumn) (bool, error) {
	if col == nil || !isValidFieldName(col.Name) {
		return false, errors.New("非法的字段名称")
	}
	var cnt int64
	query := fmt.Sprintf("SELECT COUNT(*) FROM `%s` WHERE %s", realTable, columnDataExpr(*col))
	if err := database.DB.Raw(query).Scan(&cnt).Error; err != nil {
		return false, err
	}
	return cnt > 0, nil
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

// queryColumnSet 查询业务表列名集合（用于动态字段校验，防 SQL 注入）
func queryColumnSet(tableName string) (map[string]bool, error) {
	cols, err := queryColumns(tableName)
	if err != nil {
		return nil, err
	}
	set := make(map[string]bool, len(cols))
	for _, c := range cols {
		set[c.Name] = true
	}
	return set, nil
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

// TableFieldList 查询物理业务表（主表或子表）实际存在的列，支持按字段名模糊匹配与分页。
// tableName 为空时返回该应用全部表（主表 + 各子表）字段，每条记录带所属业务表名 table_name。
func TableFieldList(appID uint, tableName string, req *model.TableFieldListReq) ([]model.TableColumn, int64, error) {
	all := make([]model.TableColumn, 0, 64)
	if tableName == "" {
		app, _, err := ApplicationDetail(appID)
		if err != nil {
			return nil, 0, err
		}
		names := []string{app.TableName}
		for _, sub := range strings.Split(app.SubTableName, ",") {
			if sub = strings.TrimSpace(sub); sub != "" {
				names = append(names, sub)
			}
		}
		for _, n := range names {
			real := bizTableName(n)
			cols, err := queryColumns(real)
			if err != nil {
				return nil, 0, err
			}
			hasDataMap, err := columnsHaveData(real, cols)
			if err != nil {
				return nil, 0, fmt.Errorf("检查字段数据量失败: %w", err)
			}
			for i := range cols {
				cols[i].TableName = n
				cols[i].HasData = hasDataMap[cols[i].Name]
			}
			all = append(all, cols...)
		}
	} else {
		real, err := getApplicationBizTableBy(appID, tableName)
		if err != nil {
			return nil, 0, err
		}
		cols, err := queryColumns(real)
		if err != nil {
			return nil, 0, err
		}
		hasDataMap, err := columnsHaveData(real, cols)
		if err != nil {
			return nil, 0, fmt.Errorf("检查字段数据量失败: %w", err)
		}
		for i := range cols {
			cols[i].TableName = tableName
			cols[i].HasData = hasDataMap[cols[i].Name]
		}
		all = append(all, cols...)
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
	if err := requireApplicationOffline(appID, "新增表字段"); err != nil {
		return nil, err
	}
	real, err := getApplicationBizTableBy(appID, tableName)
	if err != nil {
		return nil, err
	}
	if !isValidFieldName(req.Name) {
		return nil, errors.New("非法的字段名称")
	}
	if appFieldSystemCols[req.Name] {
		return nil, errors.New("系统字段不允许创建: " + req.Name)
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

// TableFieldUpdate 修改指定物理业务表（主表或子表）列定义（ALTER TABLE ... CHANGE/MODIFY COLUMN）。
// 该字段列已有数据时禁止修改；无数据时允许改名称、长度、可空、默认值、注释，字段类型不可修改。
func TableFieldUpdate(appID uint, tableName, oldName string, req *model.TableFieldUpdateReq) (*model.TableColumn, error) {
	if err := requireApplicationOffline(appID, "修改表字段"); err != nil {
		return nil, err
	}
	if !isValidFieldName(oldName) {
		return nil, errors.New("非法的字段名称")
	}
	real, err := getApplicationBizTableBy(appID, tableName)
	if err != nil {
		return nil, err
	}
	old, err := getTableColumn(real, oldName)
	if err != nil {
		return nil, err
	}
	if appFieldSystemCols[oldName] {
		return nil, errors.New("系统字段不允许修改: " + oldName)
	}
	hasData, err := columnHasData(real, old)
	if err != nil {
		return nil, fmt.Errorf("检查字段数据量失败: %w", err)
	}
	if hasData {
		return nil, errors.New("该字段已有数据，不允许修改字段；请先清空该字段数据后再修改")
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
		if !strings.EqualFold(req.Type, old.Type) {
			return nil, errors.New("字段类型不可修改")
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
	if col.Name != oldName {
		app, _, err := ApplicationDetail(appID)
		if err != nil {
			return nil, fmt.Errorf("字段已重命名，但读取应用配置失败: %w", err)
		}
		if err := renameFieldReferences(appID, tableName, oldName, col.Name, app.TableName); err != nil {
			return nil, fmt.Errorf("字段已重命名，但同步表单/布局/审批流引用失败: %w", err)
		}
	}
	return getTableColumn(real, col.Name)
}

// FieldReference 字段被表单元素引用的记录（用于删除拦截提示与级联结果）
type FieldReference struct {
	ElementID uint   `json:"element_id"`
	Label     string `json:"label"`
}

// TableFieldDelete 删除指定物理业务表（主表或子表）列（ALTER TABLE ... DROP COLUMN，不可逆）。
// 该字段列已有数据时禁止删除；无数据时级联删除表单元素、清理全部版本的表单/详情布局
// （含 move-form / move-detail 使用的同一份布局）和审批流中的字段引用，再删列。
func TableFieldDelete(appID uint, tableName, fieldName string) ([]FieldReference, error) {
	if err := requireApplicationOffline(appID, "删除表字段"); err != nil {
		return nil, err
	}
	if !isValidFieldName(fieldName) {
		return nil, errors.New("非法的字段名称")
	}
	real, err := getApplicationBizTableBy(appID, tableName)
	if err != nil {
		return nil, err
	}
	col, err := getTableColumn(real, fieldName)
	if err != nil {
		return nil, err
	}
	if appFieldSystemCols[fieldName] {
		return nil, errors.New("系统字段不允许删除: " + fieldName)
	}
	hasData, err := columnHasData(real, col)
	if err != nil {
		return nil, fmt.Errorf("检查字段数据量失败: %w", err)
	}
	if hasData {
		return nil, errors.New("该字段已有数据，不允许删除字段；请先清空该字段数据后再删除")
	}

	var refs []model.ApplicationElement
	if err := database.DB.Where("app_id = ? AND table_key = ? AND field_key = ?", appID, tableName, fieldName).
		Find(&refs).Error; err != nil {
		return nil, fmt.Errorf("检查字段引用失败: %w", err)
	}

	cleaned := make([]FieldReference, 0, len(refs))
	for i := range refs {
		el := &refs[i]
		if err := database.DB.Delete(el).Error; err != nil {
			return nil, fmt.Errorf("级联删除表单元素失败: %w", err)
		}
		cleaned = append(cleaned, FieldReference{ElementID: el.ID, Label: el.Label})
	}
	// 按字段引用清理全部版本布局，覆盖没有对应元素记录但布局中仍绑定了该字段的悬空引用。
	if _, err := removeFieldFromLayouts(appID, tableName, fieldName); err != nil {
		return nil, fmt.Errorf("级联清理表单/详情布局失败: %w", err)
	}
	app, _, err := ApplicationDetail(appID)
	if err != nil {
		return nil, fmt.Errorf("读取应用配置失败: %w", err)
	}
	if _, err := removeFieldFromApprovalFlows(appID, tableName, fieldName, app.TableName); err != nil {
		return nil, fmt.Errorf("级联清理审批流字段引用失败: %w", err)
	}

	if err := database.DB.Exec("ALTER TABLE `" + real + "` DROP COLUMN `" + fieldName + "`").Error; err != nil {
		return nil, fmt.Errorf("删除数据库字段失败: %w", err)
	}
	return cleaned, nil
}

// fieldRefMatches 判断审批流中的字段引用是否指向目标字段。
// table_key 为空时按主表处理：审批流早期数据可能只写了字段名，未写 table_key。
func fieldRefMatches(m map[string]interface{}, tableKey, fieldName, mainTable string) bool {
	f, _ := m["field"].(string)
	if f != fieldName {
		return false
	}
	tk, _ := m["table_key"].(string)
	if tk == "" {
		return tableKey == mainTable
	}
	return tk == tableKey
}

// normalizeJSONValue 把 GORM 读出的 JSON 值统一成 map/slice 结构，兼容历史数据中存成字符串的 JSON。
func normalizeJSONValue(v interface{}) (interface{}, error) {
	if s, ok := v.(string); ok {
		var out interface{}
		if err := json.Unmarshal([]byte(s), &out); err != nil {
			return nil, err
		}
		return out, nil
	}
	b, err := json.Marshal(v)
	if err != nil {
		return nil, err
	}
	var out interface{}
	if err := json.Unmarshal(b, &out); err != nil {
		return nil, err
	}
	return out, nil
}

// isDefaultBranch 判断审批条件分支是否为默认分支（兼容 bool 与数字两种历史写法）。
func isDefaultBranch(m map[string]interface{}) bool {
	switch v := m["isDefault"].(type) {
	case bool:
		return v
	case float64:
		return v != 0
	case int:
		return v != 0
	case json.Number:
		n, _ := v.Int64()
		return n != 0
	default:
		return false
	}
}

// pruneApprovalFlowValue 递归清理审批流中的规则与字段权限引用。
// 当非默认条件分支的规则因字段删除而清空时，该分支会退化为恒真分支，必须一并删除。
func pruneApprovalFlowValue(v interface{}, tableKey, fieldName, mainTable string) (interface{}, int) {
	switch x := v.(type) {
	case []interface{}:
		removed := 0
		for i := range x {
			next, n := pruneApprovalFlowValue(x[i], tableKey, fieldName, mainTable)
			x[i] = next
			removed += n
		}
		return x, removed
	case map[string]interface{}:
		return pruneApprovalNode(x, tableKey, fieldName, mainTable)
	default:
		return v, 0
	}
}

func pruneApprovalNode(node map[string]interface{}, tableKey, fieldName, mainTable string) (interface{}, int) {
	removed := 0
	for k, v := range node {
		switch k {
		case "rules", "fieldPerms":
			arr, ok := v.([]interface{})
			if !ok {
				next, n := pruneApprovalFlowValue(v, tableKey, fieldName, mainTable)
				node[k], removed = next, removed+n
				continue
			}
			keep := make([]interface{}, 0, len(arr))
			for _, item := range arr {
				m, ok := item.(map[string]interface{})
				if ok && fieldRefMatches(m, tableKey, fieldName, mainTable) {
					removed++
					continue
				}
				keep = append(keep, item)
			}
			node[k] = keep
		case "branches":
			arr, ok := v.([]interface{})
			if !ok {
				next, n := pruneApprovalFlowValue(v, tableKey, fieldName, mainTable)
				node[k], removed = next, removed+n
				continue
			}
			keep := make([]interface{}, 0, len(arr))
			for _, item := range arr {
				branch, ok := item.(map[string]interface{})
				if !ok {
					keep = append(keep, item)
					continue
				}
				ruleRemoved := 0
				for bk, bv := range branch {
					switch bk {
					case "rules":
						rules, ok := bv.([]interface{})
						if !ok {
							next, n := pruneApprovalFlowValue(bv, tableKey, fieldName, mainTable)
							branch[bk], ruleRemoved = next, ruleRemoved+n
							continue
						}
						nextRules := make([]interface{}, 0, len(rules))
						for _, r := range rules {
							rm, ok := r.(map[string]interface{})
							if ok && fieldRefMatches(rm, tableKey, fieldName, mainTable) {
								ruleRemoved++
								continue
							}
							nextRules = append(nextRules, r)
						}
						branch[bk] = nextRules
					case "fieldPerms":
						perms, ok := bv.([]interface{})
						if !ok {
							next, n := pruneApprovalFlowValue(bv, tableKey, fieldName, mainTable)
							branch[bk], removed = next, removed+n
							continue
						}
						nextPerms := make([]interface{}, 0, len(perms))
						for _, p := range perms {
							pm, ok := p.(map[string]interface{})
							if ok && fieldRefMatches(pm, tableKey, fieldName, mainTable) {
								removed++
								continue
							}
							nextPerms = append(nextPerms, p)
						}
						branch[bk] = nextPerms
					case "children":
						next, n := pruneApprovalFlowValue(bv, tableKey, fieldName, mainTable)
						branch[bk], removed = next, removed+n
					default:
						next, n := pruneApprovalFlowValue(bv, tableKey, fieldName, mainTable)
						branch[bk], removed = next, removed+n
					}
				}
				removed += ruleRemoved
				// 非默认分支的规则被删空后不再保留，避免 evaluateBranch 将其视为恒真条件。
				if ruleRemoved > 0 && !isDefaultBranch(branch) {
					if rules, ok := branch["rules"].([]interface{}); ok && len(rules) == 0 {
						continue
					}
				}
				keep = append(keep, branch)
			}
			node[k] = keep
		default:
			next, n := pruneApprovalFlowValue(v, tableKey, fieldName, mainTable)
			node[k], removed = next, removed+n
		}
	}
	return node, removed
}

// removeFieldFromApprovalFlows 从应用所有版本审批流中删除字段引用，返回删除的规则/权限条数。
func removeFieldFromApprovalFlows(appID uint, tableKey, fieldName, mainTable string) (int, error) {
	var versions []model.ApplicationVersion
	if err := database.DB.Where("application_id = ?", appID).Find(&versions).Error; err != nil {
		return 0, err
	}
	total := 0
	for i := range versions {
		if versions[i].ApprovalFlowJSON == nil {
			continue
		}
		root, err := normalizeJSONValue(versions[i].ApprovalFlowJSON)
		if err != nil {
			return total, fmt.Errorf("解析审批流失败: %w", err)
		}
		next, removed := pruneApprovalFlowValue(root, tableKey, fieldName, mainTable)
		if removed == 0 {
			continue
		}
		versions[i].ApprovalFlowJSON = next
		if err := database.DB.Model(&versions[i]).
			Select("approval_flow_json").Updates(&versions[i]).Error; err != nil {
			return total, err
		}
		total += removed
	}
	return total, nil
}

// renameFieldInJSON 递归同步 JSON 中的字段引用：
// 元素/列的 field_key、dataIndex，动作映射的 table_name+target，以及 ${form.x}/${item.x}/${row.x} 表达式。
func renameFieldInJSON(v interface{}, tableKey, oldName, newName, mainTable string) (interface{}, int) {
	switch x := v.(type) {
	case []interface{}:
		changed := 0
		for i := range x {
			next, n := renameFieldInJSON(x[i], tableKey, oldName, newName, mainTable)
			x[i] = next
			changed += n
		}
		return x, changed
	case map[string]interface{}:
		changed := 0
		tk, _ := x["table_key"].(string)
		tableMatched := tk == tableKey || (tk == "" && tableKey == mainTable)
		if tableMatched {
			if f, _ := x["field"].(string); f == oldName {
				x["field"] = newName
				changed++
			}
			if fk, _ := x["field_key"].(string); fk == oldName {
				x["field_key"] = newName
				changed++
			}
			if di, _ := x["dataIndex"].(string); di == oldName {
				x["dataIndex"] = newName
				changed++
			}
		}
		if target, _ := x["target"].(string); target == oldName {
			tn, _ := x["table_name"].(string)
			if tn == tableKey || (tn == "" && tableKey == mainTable) {
				x["target"] = newName
				changed++
			}
		}
		for k, val := range x {
			next, n := renameFieldInJSON(val, tableKey, oldName, newName, mainTable)
			x[k] = next
			changed += n
		}
		return x, changed
	case string:
		next := strings.ReplaceAll(x, "form."+oldName, "form."+newName)
		next = strings.ReplaceAll(next, "item."+oldName, "item."+newName)
		next = strings.ReplaceAll(next, "row."+oldName, "row."+newName)
		if next != x {
			return next, 1
		}
		return x, 0
	default:
		return v, 0
	}
}

// renameFieldReferences 同步字段改名后的元素、全部版本布局和审批流引用。
func renameFieldReferences(appID uint, tableKey, oldName, newName, mainTable string) error {
	var elements []model.ApplicationElement
	if err := database.DB.Where("app_id = ? AND table_key = ? AND field_key = ?", appID, tableKey, oldName).
		Find(&elements).Error; err != nil {
		return err
	}
	for i := range elements {
		el := &elements[i]
		el.FieldKey = newName
		if el.Actions != nil {
			next, _ := renameFieldInJSON(el.Actions, tableKey, oldName, newName, mainTable)
			el.Actions, _ = next.(map[string]interface{})
		}
		if el.DynamicStates != nil {
			next, _ := renameFieldInJSON(map[string]interface{}(el.DynamicStates), tableKey, oldName, newName, mainTable)
			if m, ok := next.(map[string]interface{}); ok {
				el.DynamicStates = model.JSONMap(m)
			}
		}
		if el.DataSource != nil {
			next, _ := renameFieldInJSON(el.DataSource, tableKey, oldName, newName, mainTable)
			el.DataSource, _ = next.(map[string]interface{})
		}
		if err := database.DB.Model(el).
			Select("field_key", "actions", "dynamic_states", "data_source").Updates(el).Error; err != nil {
			return err
		}
	}

	var versions []model.ApplicationVersion
	if err := database.DB.Where("application_id = ?", appID).Find(&versions).Error; err != nil {
		return err
	}
	for i := range versions {
		changed := false
		for _, lp := range []*map[string]interface{}{&versions[i].FormLayoutJSON, &versions[i].DetailLayoutJSON} {
			if *lp == nil {
				continue
			}
			next, n := renameFieldInJSON(*lp, tableKey, oldName, newName, mainTable)
			if n > 0 {
				if m, ok := next.(map[string]interface{}); ok {
					*lp = m
					changed = true
				}
			}
		}
		if versions[i].ApprovalFlowJSON != nil {
			root, err := normalizeJSONValue(versions[i].ApprovalFlowJSON)
			if err != nil {
				return fmt.Errorf("解析审批流失败: %w", err)
			}
			next, n := renameFieldInJSON(root, tableKey, oldName, newName, mainTable)
			if n > 0 {
				versions[i].ApprovalFlowJSON = next
				changed = true
			}
		}
		if changed {
			if err := database.DB.Model(&versions[i]).
				Select("form_layout_json", "detail_layout_json", "approval_flow_json").Updates(&versions[i]).Error; err != nil {
				return err
			}
		}
	}
	return nil
}
