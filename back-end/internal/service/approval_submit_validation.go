package service

// ============================================================
// 提交前表单校验（服务端）
// ============================================================
// 前端 DynamicForm 在提交前会执行 required / validation_rule 校验，
// 并在发起人节点执行 onSubmitBefore JS 事件；直接调用审批接口可以跳过这些前端步骤。
//
// 这里把「可由服务端确定性执行」的表单校验下沉到后端：
//   - 必填（required）：主表字段 + 子表必填列
//   - 格式（validation_rule 中的正则规则）
//   - 子表至少一行（表格整体必填或存在必填列时）
//
// onSubmitBefore 是管理员编写的任意 JS（可调用 request 访问接口），不具备在服务端安全执行的条件，
// 仍由前端执行；后端只负责上述可声明、可复现的表单约束，避免接口直调绕过基础校验。
// ============================================================

import (
	"fmt"
	"regexp"
	"strings"

	"back-end/internal/database"
	"back-end/internal/model"
)

// submitElementRef 表单布局中实际放置的元素引用。
// 布局快照里的元素可能只保留 element_id（紧凑布局），也可能只有 field_key/table_key（历史布局），
// 两种都要能匹配到 oa_application_elements 中的元数据。
type submitElementRef struct {
	id       uint
	fieldKey string
	tableKey string
}

// collectSubmitElementRefs 收集表单布局中实际渲染的元素（含表格列），
// 未放入布局的元素不参与提交校验，避免误伤历史残留配置。
func submitLayoutElements(layout map[string]interface{}) []interface{} {
	if layout == nil {
		return nil
	}
	if raw, ok := layout["elements"].([]interface{}); ok {
		return raw
	}
	return nil
}

func collectSubmitElementRefs(layout map[string]interface{}) []submitElementRef {
	raw := submitLayoutElements(layout)
	if len(raw) == 0 {
		return nil
	}
	refs := make([]submitElementRef, 0, len(raw))
	for _, item := range raw {
		el, ok := item.(map[string]interface{})
		if !ok {
			continue
		}
		ref := submitElementRef{
			id:       toUint(el["element_id"]),
			fieldKey: toString(el["field_key"]),
			tableKey: toString(el["table_key"]),
		}
		if ref.id > 0 || ref.fieldKey != "" {
			refs = append(refs, ref)
		}
		// 表格容器：列定义在 columns 中，列元素通常没有 element_id，只能按 field_key/table_key 匹配
		if toString(el["element_type"]) == "table" {
			cols, _ := el["columns"].([]interface{})
			for _, c := range cols {
				col, ok := c.(map[string]interface{})
				if !ok {
					continue
				}
				ck := toString(col["field_key"])
				tk := toString(col["table_key"])
				if ck == "" {
					continue
				}
				refs = append(refs, submitElementRef{fieldKey: ck, tableKey: tk})
			}
		}
	}
	return refs
}

// isSubmitRefPlaced 判断元素元数据是否被布局引用。
func isSubmitRefPlaced(refs []submitElementRef, el *model.ApplicationElement) bool {
	for _, ref := range refs {
		if ref.id > 0 && ref.id == el.ID {
			return true
		}
		if ref.fieldKey != "" && ref.fieldKey == el.FieldKey && ref.tableKey == el.TableKey {
			return true
		}
	}
	return false
}

// submitDynamicVisible 判断元素在当前数据下是否可见。
// 只处理可以确定求值的字面量；遇到无法安全求值的表达式时按可见处理，
// 由前端事件负责复杂联动，后端不擅自跳过必填。
func submitDynamicVisible(states model.JSONMap) bool {
	if len(states) == 0 {
		return true
	}
	raw, ok := states["visible_if"]
	if !ok {
		return true
	}
	s := strings.ToLower(strings.TrimSpace(fmt.Sprint(raw)))
	switch s {
	case "", "1", "true", "${true}":
		return true
	case "0", "false", "${false}", "null", "undefined":
		return false
	}
	return true
}

// submitValueEmpty 与前端必填语义保持一致：nil、空白字符串、空数组/空对象视为空；
// 数字 0、布尔 false 是有效值。
func submitValueEmpty(v interface{}) bool {
	switch val := v.(type) {
	case nil:
		return true
	case string:
		return strings.TrimSpace(val) == ""
	case []interface{}:
		return len(val) == 0
	case []map[string]interface{}:
		return len(val) == 0
	case map[string]interface{}:
		return len(val) == 0
	default:
		return false
	}
}

func submitTableRows(v interface{}) []map[string]interface{} {
	switch rows := v.(type) {
	case []interface{}:
		out := make([]map[string]interface{}, 0, len(rows))
		for _, r := range rows {
			if m, ok := r.(map[string]interface{}); ok {
				out = append(out, m)
			}
		}
		return out
	case []map[string]interface{}:
		return rows
	default:
		return nil
	}
}

// submitRegexRule 将前端 validation_rule 的正则写法（/pattern/flags）转换为 Go 正则。
// 只支持 i/m/s 三个对校验语义有影响的 flag；非法正则返回 nil，与前端「非法正则忽略」一致。
func submitRegexRule(rule string) *regexp.Regexp {
	s := strings.TrimSpace(rule)
	if !strings.HasPrefix(s, "/") {
		return nil
	}
	m := regexp.MustCompile(`^/(.*)/([a-zA-Z]*)$`).FindStringSubmatch(s)
	if len(m) != 3 {
		return nil
	}
	prefix := ""
	flags := strings.ToLower(m[2])
	if strings.Contains(flags, "i") {
		prefix += "i"
	}
	if strings.Contains(flags, "m") {
		prefix += "m"
	}
	if strings.Contains(flags, "s") {
		prefix += "s"
	}
	pattern := m[1]
	if prefix != "" {
		pattern = "(?" + prefix + ")" + pattern
	}
	re, err := regexp.Compile(pattern)
	if err != nil {
		return nil
	}
	return re
}

func submitRuleMessage(el *model.ApplicationElement) string {
	if strings.TrimSpace(el.ValidationMessage) != "" {
		return el.ValidationMessage
	}
	label := el.Label
	if label == "" {
		label = el.FieldKey
	}
	return label + "格式不正确"
}

// validateSubmitPayloadBeforeWrite 在业务数据落库前校验候选数据。
// 新建（BusinessDataID=0）直接用请求体；更新已有数据时用「库内现值 + 本次提交值」合并后的候选值，
// 避免不完整提交先写入业务表、再在创建实例阶段失败，留下脏数据。
func validateSubmitPayloadBeforeWrite(req *model.ApprovalInstanceCreateReq) error {
	if req == nil {
		return nil
	}
	if req.BusinessDataID == 0 && len(req.BusinessData) == 0 {
		return nil // 交由 resolveBusinessDataID 报「必须提供其一」
	}
	return validateSubmitCandidate(req.AppID, req.BusinessDataID, req.BusinessData, req.ApprovalDraftMembers)
}

// validateSubmitCandidate 校验「已有数据 + 本次提交补丁」合并后的表单值。
// businessDataID=0 时只校验提交体本身；已有数据时先读库内现值再覆盖本次字段。
// 同时在写库前校验发起人自选审批人，避免业务数据先落库、后续审批人校验失败留下孤儿数据。
func validateSubmitCandidate(appID, businessDataID uint, payload map[string]interface{}, selfSelectMembers map[string][]uint) error {
	app, _, err := ApplicationDetail(appID)
	if err != nil {
		return err
	}
	ApplyActiveVersionSnapshot(app)

	candidate := payload
	if businessDataID > 0 {
		existing, err := ApplicationDataDetail(appID, businessDataID, &model.ApplicationDataDetailReq{})
		if err != nil {
			return err
		}
		for k, v := range payload {
			existing[k] = v
		}
		candidate = existing
	}
	if err := validateSubmitFormData(app, candidate); err != nil {
		return err
	}
	return validateSelfSelectBeforeWrite(app, candidate, selfSelectMembers)
}

// validateSelfSelectBeforeWrite 在业务数据落库前，按请求中的候选表单值和自选成员评估执行路径，
// 校验路径上的发起人自选节点已选择审批人。这样校验失败时不会产生任何业务数据。
func validateSelfSelectBeforeWrite(app *model.Application, formData map[string]interface{}, selfSelectMembers map[string][]uint) error {
	if app == nil || app.ApprovalFlowJSON == nil {
		return nil
	}
	nodes, err := parseFlowNodes(app.ApprovalFlowJSON)
	if err != nil {
		return fmt.Errorf("解析审批流配置失败: %w", err)
	}
	if len(nodes) == 0 {
		return nil
	}
	injected := injectSelfSelectIntoNodes(nodes, selfSelectMembers)
	execPath := flattenExecutionPath(nodes, formData)
	return validateSelfSelectApprovers(&approvalContext{
		nodes:         nodes,
		injectedNodes: injected,
		execPath:      execPath,
	})
}

// isSubmitSystemField 后端自动维护的审计字段。
// 例如差旅报销的 created_at 同时承担「申请日期」，前端只读、由后端落库时生成；
// ApplicationDataDetail 会统一剥离审计字段，不能把它们当作缺失的必填业务值。
func isSubmitSystemField(fieldKey string) bool {
	switch fieldKey {
	case "id", "created_at", "updated_at", "created_by", "updated_by", "deleted_at":
		return true
	}
	return false
}

// validateSubmitFormData 对当前生效版本表单做提交前校验。
// app.FormLayoutJSON 为当前 active 版本快照；formData 为业务数据详情（主表字段 + 子表数组）。
func validateSubmitFormData(app *model.Application, formData map[string]interface{}) error {
	if app == nil || len(app.FormLayoutJSON) == 0 {
		return nil
	}
	refs := collectSubmitElementRefs(app.FormLayoutJSON)
	if len(refs) == 0 {
		return nil
	}
	var elements []model.ApplicationElement
	if err := database.DB.Where("app_id = ?", app.ID).Order("id ASC").Find(&elements).Error; err != nil {
		return fmt.Errorf("读取表单校验配置失败: %w", err)
	}

	// 表格容器：子表必填列 & 至少一行
	for _, item := range submitLayoutElements(app.FormLayoutJSON) {
		el, ok := item.(map[string]interface{})
		if !ok || toString(el["element_type"]) != "table" {
			continue
		}
		tableKey := toString(el["table_key"])
		if tableKey == "" || tableKey == app.TableName {
			continue
		}
		tableLabel := toString(el["label"])
		if tableLabel == "" {
			tableLabel = tableKey
		}
		tableRequired := toBool(el["required"])
		var requiredCols []model.ApplicationElement
		for i := range elements {
			meta := &elements[i]
			if meta.TableKey != tableKey || !isSubmitRefPlaced(refs, meta) {
				continue
			}
			if meta.Required == 1 && submitDynamicVisible(meta.DynamicStates) {
				requiredCols = append(requiredCols, *meta)
			}
		}
		rows := submitTableRows(formData[tableKey])
		if len(rows) == 0 {
			if tableRequired || len(requiredCols) > 0 {
				return fmt.Errorf("提交前校验未通过：%s至少需要添加一行数据", tableLabel)
			}
			continue
		}
		for rowIdx, row := range rows {
			for _, col := range requiredCols {
				if submitValueEmpty(row[col.FieldKey]) {
					return fmt.Errorf("提交前校验未通过：第 %d 行的 %s 不能为空", rowIdx+1, col.Label)
				}
			}
		}
	}

	// 主表字段：必填 + 正则格式
	for i := range elements {
		meta := &elements[i]
		if meta.FieldKey == "" || meta.TableKey == "" || meta.TableKey != app.TableName {
			continue
		}
		if !isSubmitRefPlaced(refs, meta) {
			continue
		}
		if !submitDynamicVisible(meta.DynamicStates) {
			continue
		}
		value := formData[meta.FieldKey]
		if meta.Required == 1 && !isSubmitSystemField(meta.FieldKey) && submitValueEmpty(value) {
			return fmt.Errorf("提交前校验未通过：%s不能为空", meta.Label)
		}
		if re := submitRegexRule(meta.ValidationRule); re != nil && !isSubmitSystemField(meta.FieldKey) && !submitValueEmpty(value) {
			if !re.MatchString(fmt.Sprint(value)) {
				return fmt.Errorf("提交前校验未通过：%s", submitRuleMessage(meta))
			}
		}
	}
	return nil
}

func toString(v interface{}) string {
	if v == nil {
		return ""
	}
	if s, ok := v.(string); ok {
		return s
	}
	return fmt.Sprint(v)
}

func toUint(v interface{}) uint {
	switch n := v.(type) {
	case float64:
		if n > 0 {
			return uint(n)
		}
	case int:
		if n > 0 {
			return uint(n)
		}
	case int64:
		if n > 0 {
			return uint(n)
		}
	case uint:
		return n
	case string:
		var out uint
		_, _ = fmt.Sscan(n, &out)
		return out
	}
	return 0
}

func toBool(v interface{}) bool {
	switch b := v.(type) {
	case bool:
		return b
	case float64:
		return b != 0
	case int:
		return b != 0
	case string:
		s := strings.ToLower(strings.TrimSpace(b))
		return s == "1" || s == "true"
	}
	return false
}
