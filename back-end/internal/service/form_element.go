package service

import (
	"errors"
	"strings"

	"back-end/internal/database"
	"back-end/internal/model"
)

// checkApplicationElementTableKey 校验 table_key 属于该页面配置（主表或子表）
func checkApplicationElementTableKey(appID uint, tableKey string) error {
	app, err := ApplicationDetail(appID)
	if err != nil {
		return err
	}
	if app.TableName != tableKey && !containsTable(app.SubTableName, tableKey) {
		return errors.New("分类表不属于该页面配置")
	}
	return nil
}

// checkApplicationElementUniqueField 同一页面配置下，同一字段分类(table_key)内字段标识(field_key)唯一
func checkApplicationElementUniqueField(appID uint, tableKey, fieldKey string, excludeID uint) error {
	if tableKey == "" || fieldKey == "" {
		return nil
	}
	q := database.DB.Model(&model.ApplicationElement{}).
		Where("app_id = ? AND table_key = ? AND field_key = ?", appID, tableKey, fieldKey)
	if excludeID > 0 {
		q = q.Where("id <> ?", excludeID)
	}
	var count int64
	if err := q.Count(&count).Error; err != nil {
		return err
	}
	if count > 0 {
		return errors.New("该分类下字段标识已存在：" + fieldKey)
	}
	return nil
}

// ApplicationElementList 表单元素分页列表：keyword 模糊匹配 label 或 field_key
// 返回 ApplicationElementListItem（不含 created_at/created_by/updated_at/updated_by 审计字段）
func ApplicationElementList(appID uint, req *model.ApplicationElementListReq) ([]model.ApplicationElementListItem, int64, error) {
	app, err := ApplicationDetail(appID)
	if err != nil {
		return nil, 0, err
	}
	db := database.DB.Model(&model.ApplicationElement{}).Where("app_id = ?", appID)
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
	var list []model.ApplicationElement
	err = db.Order(buildApplicationElementTableOrder(app.TableName, app.SubTableName)).
		Offset(req.Offset()).Limit(req.Limit()).Find(&list).Error
	if err != nil {
		return nil, 0, err
	}

	// 转换为列表 DTO，去除审计字段
	items := make([]model.ApplicationElementListItem, 0, len(list))
	for _, el := range list {
		items = append(items, model.ApplicationElementListItem{
			ID:             el.ID,
			AppID:          el.AppID,
			Label:          el.Label,
			FieldKey:       el.FieldKey,
			TableKey:       el.TableKey,
			ElementType:    el.ElementType,
			Placeholder:    el.Placeholder,
			Required:       el.Required,
			DefaultValue:   el.DefaultValue,
			ValidationRule: el.ValidationRule,
			Visibility:     el.Visibility,
			DynamicStates:  el.DynamicStates,
			DataSource:     el.DataSource,
			Actions:        el.Actions,
		})
	}
	return items, total, nil
}

// buildApplicationElementTableOrder 生成表单元素列表的表级排序表达式：
// ORDER BY FIELD(table_key, 主表名, 子表名1, 子表名2, ...) ASC, id ASC
// FIELD 未命中的 table_key 返回 0，因此主表(1)最前、子表(2..n)随后、其余排最后
func buildApplicationElementTableOrder(tableName, subTableName string) string {
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

// ApplicationElementCreate 新增表单元素
func ApplicationElementCreate(curUserID, appID uint, req *model.ApplicationElementCreateReq) (*model.ApplicationElement, error) {
	if err := checkApplicationElementTableKey(appID, req.TableKey); err != nil {
		return nil, err
	}
	if err := checkApplicationElementUniqueField(appID, req.TableKey, req.FieldKey, 0); err != nil {
		return nil, err
	}
	el := model.ApplicationElement{
		AppID:          appID,
		Label:          req.Label,
		FieldKey:       req.FieldKey,
		TableKey:       req.TableKey,
		ElementType:    req.ElementType,
		Placeholder:    req.Placeholder,
		Required:       req.Required,
		DefaultValue:   req.DefaultValue,
		ValidationRule: req.ValidationRule,
		Visibility:     req.Visibility,
		DynamicStates:  req.DynamicStates,
		DataSource:     req.DataSource,
		Actions:        req.Actions,
	}
	el.CreatedBy, el.UpdatedBy = curUserID, curUserID
	if err := database.DB.Create(&el).Error; err != nil {
		return nil, err
	}
	return &el, nil
}

// ApplicationElementUpdate 修改表单元素
func ApplicationElementUpdate(curUserID, appID, id uint, req *model.ApplicationElementUpdateReq) (*model.ApplicationElement, error) {
	var el model.ApplicationElement
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
		if err := checkApplicationElementTableKey(appID, req.TableKey); err != nil {
			return nil, err
		}
		el.TableKey = req.TableKey
	}
	if req.ElementType != "" {
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
	// field_key 或 table_key 变化时校验组合唯一（以变更后的最终值为准）
	finalFieldKey, finalTableKey := el.FieldKey, el.TableKey
	if req.FieldKey != "" {
		finalFieldKey = req.FieldKey
	}
	if req.TableKey != "" {
		finalTableKey = req.TableKey
	}
	if err := checkApplicationElementUniqueField(appID, finalTableKey, finalFieldKey, el.ID); err != nil {
		return nil, err
	}
	el.UpdatedBy = curUserID
	if err := database.DB.Save(&el).Error; err != nil {
		return nil, err
	}
	return &el, nil
}

// ApplicationElementDelete 删除表单元素（软删除）
func ApplicationElementDelete(appID, id uint) error {
	var el model.ApplicationElement
	if err := database.DB.Where("id = ? AND app_id = ?", id, appID).First(&el).Error; err != nil {
		return errors.New("表单元素不存在")
	}
	return database.DB.Delete(&el).Error
}
