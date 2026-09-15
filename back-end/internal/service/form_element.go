package service

import (
	"errors"
	"strings"

	"back-end/internal/database"
	"back-end/internal/model"
)

// validElementTypes 允许的表单元素类型白名单（与前端 FormElementManage.jsx ELEMENT_TYPES 一致）
var validElementTypes = map[string]bool{
	"input": true, "textarea": true, "number": true, "select": true,
	"radio": true, "checkbox": true, "datepicker": true, "timepicker": true,
	"switch": true, "upload": true,
}

// checkFormElementTableKey 校验 table_key 属于该页面配置（主表或子表）
func checkFormElementTableKey(appID uint, tableKey string) error {
	app, err := ApplicationDetail(appID)
	if err != nil {
		return err
	}
	if app.TableName != tableKey && !containsTable(app.SubTableName, tableKey) {
		return errors.New("分类表不属于该页面配置")
	}
	return nil
}

// FormElementList 表单元素分页列表：keyword 模糊匹配 label 或 field_key
func FormElementList(appID uint, req *model.FormElementListReq) ([]model.FormElement, int64, error) {
	app, err := ApplicationDetail(appID)
	if err != nil {
		return nil, 0, err
	}
	db := database.DB.Model(&model.FormElement{}).Where("app_id = ?", appID)
	if req.Keyword != "" {
		kw := "%" + req.Keyword + "%"
		db = db.Where("(label LIKE ? OR field_key LIKE ?)", kw, kw)
	}
	var total int64
	if err := db.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	// SQL 层表级排序：主表元素优先，各子表元素随后，未匹配业务表的记录排最后；表内按 id ASC
	// 仅影响 Find 的 ORDER BY，Count 总数统计不受影响，Offset/Limit 分页照常生效
	var list []model.FormElement
	err = db.Order(buildFormElementTableOrder(app.TableName, app.SubTableName)).
		Offset(req.Offset()).Limit(req.Limit()).Find(&list).Error
	return list, total, err
}

// buildFormElementTableOrder 生成表单元素列表的表级排序表达式：
// ORDER BY FIELD(table_key, 主表名, 子表名1, 子表名2, ...) ASC, id ASC
// FIELD 未命中的 table_key 返回 0，因此主表(1)最前、子表(2..n)随后、其余排最后
func buildFormElementTableOrder(tableName, subTableName string) string {
	keys := make([]string, 0, 4)
	seen := map[string]bool{}
	add := func(name string) {
		name = strings.TrimSpace(name)
		// 只允许合法的物理表名参与拼接，防止非法字符破坏 SQL
		if name != "" && isValidTableName(name) && !seen[name] {
			seen[name] = true
			keys = append(keys, name)
		}
	}
	add(tableName)
	if subTableName != "" {
		for _, s := range strings.Split(subTableName, ",") {
			add(s)
		}
	}
	if len(keys) == 0 {
		return "id ASC"
	}
	return "FIELD(table_key, '" + strings.Join(keys, "', '") + "') ASC, id ASC"
}

// FormElementCreate 新增表单元素
func FormElementCreate(curUserID, appID uint, req *model.FormElementCreateReq) (*model.FormElement, error) {
	if err := checkFormElementTableKey(appID, req.TableKey); err != nil {
		return nil, err
	}
	if !validElementTypes[req.ElementType] {
		return nil, errors.New("不支持的字段类型: " + req.ElementType)
	}
	el := model.FormElement{
		AppID: appID,
		Label:         req.Label,
		FieldKey:      req.FieldKey,
		TableKey:      req.TableKey,
		ElementType:   req.ElementType,
		Placeholder:   req.Placeholder,
		Required:      req.Required,
		DefaultValue:  req.DefaultValue,
		ValidationRule: req.ValidationRule,
		Visibility:    req.Visibility,
		DynamicStates: req.DynamicStates,
		DataSource:    req.DataSource,
		Actions:       req.Actions,
	}
	el.CreatedBy, el.UpdatedBy = curUserID, curUserID
	if err := database.DB.Create(&el).Error; err != nil {
		return nil, err
	}
	return &el, nil
}

// FormElementUpdate 修改表单元素
func FormElementUpdate(curUserID, appID, id uint, req *model.FormElementUpdateReq) (*model.FormElement, error) {
	var el model.FormElement
	if err := database.DB.Where("id = ? AND app_id = ?", id, appID).First(&el).Error; err != nil {
		return nil, errors.New("表单元素不存在")
	}
	if req.Label != "" {
		el.Label = req.Label
	}
	if req.FieldKey != "" {
		el.FieldKey = req.FieldKey
	}
	if req.TableKey != "" {
		if err := checkFormElementTableKey(appID, req.TableKey); err != nil {
			return nil, err
		}
		el.TableKey = req.TableKey
	}
	if req.ElementType != "" {
		if !validElementTypes[req.ElementType] {
			return nil, errors.New("不支持的字段类型: " + req.ElementType)
		}
		el.ElementType = req.ElementType
	}
	el.Placeholder = req.Placeholder
	if req.Required != nil {
		el.Required = *req.Required
	}
	el.DefaultValue = req.DefaultValue
	el.ValidationRule = req.ValidationRule
	// JSON 配置对象仅在传入（非 nil）时覆盖
	if req.Visibility != nil {
		el.Visibility = req.Visibility
	}
	if req.DynamicStates != nil {
		el.DynamicStates = req.DynamicStates
	}
	if req.DataSource != nil {
		el.DataSource = req.DataSource
	}
	if req.Actions != nil {
		el.Actions = req.Actions
	}
	el.UpdatedBy = curUserID
	if err := database.DB.Save(&el).Error; err != nil {
		return nil, err
	}
	return &el, nil
}

// FormElementDelete 删除表单元素（软删除）
func FormElementDelete(appID, id uint) error {
	var el model.FormElement
	if err := database.DB.Where("id = ? AND app_id = ?", id, appID).First(&el).Error; err != nil {
		return errors.New("表单元素不存在")
	}
	return database.DB.Delete(&el).Error
}
