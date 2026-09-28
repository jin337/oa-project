package service

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"

	"back-end/internal/config"
	"back-end/internal/database"
	"back-end/internal/model"
)

// validateInternalPath 校验内部相对路径：拒绝绝对 URL（防 SSRF）与路径穿越
func validateInternalPath(path string) error {
	if !strings.HasPrefix(path, "/") {
		return errors.New("路径必须以 / 开头（仅支持内部相对路径）")
	}
	if strings.Contains(path, "://") {
		return errors.New("禁止使用绝对 URL，仅支持内部相对路径")
	}
	if strings.Contains(path, "..") {
		return errors.New("路径禁止包含 .. 路径穿越")
	}
	if strings.Contains(path, "?") {
		return errors.New("路径不能携带 query 参数，请在请求参数中配置")
	}
	return nil
}

// checkApiDefNameCodeExists 名称/标识唯一性校验：唯一索引覆盖软删除行，查重必须 Unscoped
func checkApiDefNameCodeExists(name, code string, excludeID uint) (nameExists, codeExists bool) {
	db := database.DB.Unscoped().Model(&model.ApiDefinition{})
	if excludeID > 0 {
		db = db.Where("id <> ?", excludeID)
	}
	var nameCount, codeCount int64
	db.Where("name = ?", name).Count(&nameCount)
	db.Where("code = ?", code).Count(&codeCount)
	return nameCount > 0, codeCount > 0
}

// ApiDefinitionList 接口定义分页列表
func ApiDefinitionList(req *model.ApiDefinitionListReq) ([]model.ApiDefinition, int64, error) {
	db := database.DB.Model(&model.ApiDefinition{})
	if req.Keyword != "" {
		kw := "%" + req.Keyword + "%"
		db = db.Where("(name LIKE ? OR code LIKE ?)", kw, kw)
	}
	if req.Method != "" {
		db = db.Where("method = ?", strings.ToUpper(req.Method))
	}
	var total int64
	if err := db.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var list []model.ApiDefinition
	err := db.Order("sort ASC, id ASC").Offset(req.Offset()).Limit(req.Limit()).Find(&list).Error
	if err != nil {
		return nil, 0, err
	}
	return list, total, nil
}

// ApiDefinitionDetail 接口定义详情
func ApiDefinitionDetail(id uint) (*model.ApiDefinition, error) {
	var def model.ApiDefinition
	if err := database.DB.First(&def, id).Error; err != nil {
		return nil, errors.New("接口不存在")
	}
	return &def, nil
}

// ApiDefinitionCreate 新增接口定义
func ApiDefinitionCreate(curUserID uint, req *model.ApiDefinitionCreateReq) (*model.ApiDefinition, error) {
	nameExists, codeExists := checkApiDefNameCodeExists(req.Name, req.Code, 0)
	if nameExists || codeExists {
		return nil, errors.New("接口名称或标识已存在")
	}
	// 创建弹窗仅提交基础字段（名称/标识/排序/状态/备注），method/path 等高级字段留待设置抽屉补全：
	// method 缺省默认 GET；path 为空跳过内部路径校验
	if req.Path != "" {
		if err := validateInternalPath(req.Path); err != nil {
			return nil, err
		}
	}
	method := strings.ToUpper(req.Method)
	if method == "" {
		method = "GET"
	}
	status := req.Status
	if status == 0 {
		status = 1
	}
	params := req.Params
	if params == nil {
		params = map[string]interface{}{}
	}
	def := model.ApiDefinition{
		Name:       req.Name,
		Code:       req.Code,
		Method:     method,
		Path:       req.Path,
		Params:     params,
		Label:      req.Label,
		ValueField: req.ValueField,
		Status:     status,
		Sort:       req.Sort,
		Remark:     req.Remark,
	}
	def.CreatedBy, def.UpdatedBy = curUserID, curUserID
	if err := database.DB.Create(&def).Error; err != nil {
		return nil, err
	}
	return ApiDefinitionDetail(def.ID)
}

// ApiDefinitionUpdate 修改接口定义（code 不可修改）
func ApiDefinitionUpdate(curUserID, id uint, req *model.ApiDefinitionUpdateReq) (*model.ApiDefinition, error) {
	var def model.ApiDefinition
	if err := database.DB.First(&def, id).Error; err != nil {
		return nil, errors.New("接口不存在")
	}
	if req.Name != "" && req.Name != def.Name {
		nameExists, _ := checkApiDefNameCodeExists(req.Name, def.Code, id)
		if nameExists {
			return nil, errors.New("接口名称已存在")
		}
		def.Name = req.Name
	}
	if req.Method != "" {
		def.Method = strings.ToUpper(req.Method)
	}
	if req.Path != "" {
		if err := validateInternalPath(req.Path); err != nil {
			return nil, err
		}
		def.Path = req.Path
	}
	if req.Params != nil {
		def.Params = req.Params
	}
	if req.Label != "" {
		def.Label = req.Label
	}
	if req.ValueField != "" {
		def.ValueField = req.ValueField
	}
	if req.Status == 0 || req.Status == 1 {
		def.Status = req.Status
	}
	if req.Sort > 0 {
		def.Sort = req.Sort
	}
	if req.Remark != "" {
		def.Remark = req.Remark
	}
	def.UpdatedBy = curUserID
	if err := database.DB.Save(&def).Error; err != nil {
		return nil, err
	}
	return ApiDefinitionDetail(id)
}

// ApiDefinitionDelete 删除接口定义（软删除）
func ApiDefinitionDelete(id uint) error {
	var def model.ApiDefinition
	if err := database.DB.First(&def, id).Error; err != nil {
		return errors.New("接口不存在")
	}
	return database.DB.Delete(&model.ApiDefinition{}, id).Error
}

// ============================================================
// 接口试调：以当前登录用户身份回环请求本服务内部接口
// ============================================================

var itemExprRe = regexp.MustCompile(`\$\{item\.([^}]+)\}`)

// evalItemExpr 求值 label 表达式：${item.xxx} 取列表项字段（支持点路径），纯文本原样返回
func evalItemExpr(expr string, item map[string]interface{}) string {
	if expr == "" {
		return ""
	}
	m := itemExprRe.FindStringSubmatch(expr)
	if m == nil {
		return expr
	}
	v := getDebugPath(item, m[1])
	if v == nil {
		return ""
	}
	return fmt.Sprint(v)
}

// getDebugPath 取嵌套字段值（点路径，如 dept.name）
func getDebugPath(obj map[string]interface{}, path string) interface{} {
	cur := interface{}(obj)
	for _, p := range strings.Split(path, ".") {
		m, ok := cur.(map[string]interface{})
		if !ok {
			return nil
		}
		cur = m[p]
	}
	return cur
}

// findDebugList 递归提取响应中的选项数组（对齐前端 findListData：深度上限 3）
func findDebugList(obj interface{}, depth int) []interface{} {
	if depth > 3 {
		return nil
	}
	switch v := obj.(type) {
	case []interface{}:
		return v
	case map[string]interface{}:
		for _, key := range []string{"list", "records", "rows", "items", "data", "content", "recordsList"} {
			if arr, ok := v[key].([]interface{}); ok {
				return arr
			}
		}
		for _, child := range v {
			if found := findDebugList(child, depth+1); found != nil {
				return found
			}
		}
	}
	return nil
}

func firstDebugVal(m map[string]interface{}, keys ...string) interface{} {
	for _, k := range keys {
		if v, ok := m[k]; ok && v != nil {
			return v
		}
	}
	return nil
}

// mapDebugItem 单条映射：label/value_field 取值 + children 递归（对齐前端 extractOptions 树形选项）
func mapDebugItem(m map[string]interface{}, labelExpr, valueField string) model.DebugOption {
	label := evalItemExpr(labelExpr, m)
	if label == "" {
		label = fmt.Sprint(firstDebugVal(m, "label", "name", "title"))
	}
	var value interface{}
	if strings.TrimSpace(valueField) != "" {
		value = m[strings.TrimSpace(valueField)]
	} else {
		value = firstDebugVal(m, "value", "id", "key", "code")
	}
	opt := model.DebugOption{Label: label, Value: value}
	if children, ok := m["children"].([]interface{}); ok && len(children) > 0 {
		opt.Children = make([]model.DebugOption, 0, len(children))
		for _, child := range children {
			if cm, ok := child.(map[string]interface{}); ok {
				opt.Children = append(opt.Children, mapDebugItem(cm, labelExpr, valueField))
			}
		}
	}
	return opt
}

// extractDebugOptions 按 label/value_field 配置把响应数组映射为选项列表（对齐前端 extractOptions）
func extractDebugOptions(data interface{}, labelExpr, valueField string) []model.DebugOption {
	list := findDebugList(data, 0)
	if len(list) == 0 {
		return nil
	}
	opts := make([]model.DebugOption, 0, len(list))
	for _, it := range list {
		m, ok := it.(map[string]interface{})
		if !ok {
			continue
		}
		label := evalItemExpr(labelExpr, m)
		if label == "" {
			label = fmt.Sprint(firstDebugVal(m, "label", "name", "title"))
		}
		if label == "" || label == "<nil>" {
			continue
		}
		opts = append(opts, mapDebugItem(m, labelExpr, valueField))
	}
	return opts
}

// ApiDefinitionDebug 接口试调：api_code（引用注册表）或 method/path（临时配置）二选一。
// 以当前登录用户 token 回环请求本服务，数据权限与鉴权自然生效。
func ApiDefinitionDebug(bearerToken string, req *model.ApiDefinitionDebugReq) (*model.ApiDefinitionDebugResult, error) {
	method, path := req.Method, req.Path
	label, valueField := "", ""
	params := req.Params

	if req.Code != "" {
		var def model.ApiDefinition
		if err := database.DB.Where("code = ?", req.Code).First(&def).Error; err != nil {
			return nil, errors.New("接口不存在")
		}
		if def.Status != 1 {
			return nil, errors.New("接口已停用，无法试调")
		}
		method, path = def.Method, def.Path
		label, valueField = def.Label, def.ValueField
		// 参数合并：试调传入优先，模板兜底
		if def.Params != nil {
			merged := make(map[string]interface{}, len(def.Params)+len(req.Params))
			for k, v := range def.Params {
				merged[k] = v
			}
			for k, v := range req.Params {
				merged[k] = v
			}
			params = merged
		}
	}
	if method == "" {
		method = http.MethodGet
	}
	method = strings.ToUpper(method)
	if err := validateInternalPath(path); err != nil {
		return nil, err
	}

	// 回环请求本服务（独立 context + 超时，避免被外部请求的 Timeout 中间件取消）
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	target := fmt.Sprintf("http://127.0.0.1:%d/api/v1%s", config.Cfg.Server.Port, path)

	var bodyReader io.Reader
	if method == http.MethodGet {
		q := url.Values{}
		for k, v := range params {
			if s, ok := v.(string); ok {
				q.Set(k, s)
			} else {
				b, _ := json.Marshal(v)
				q.Set(k, string(b))
			}
		}
		if len(q) > 0 {
			target += "?" + q.Encode()
		}
	} else if len(params) > 0 {
		buf := &bytes.Buffer{}
		_ = json.NewEncoder(buf).Encode(params)
		bodyReader = buf
	}

	httpReq, err := http.NewRequestWithContext(ctx, method, target, bodyReader)
	if err != nil {
		return nil, errors.New("构造试调请求失败")
	}
	if bearerToken != "" {
		httpReq.Header.Set("Authorization", "Bearer "+bearerToken)
	}
	if bodyReader != nil {
		httpReq.Header.Set("Content-Type", "application/json")
	}

	resp, err := http.DefaultClient.Do(httpReq)
	if err != nil {
		return nil, errors.New("试调请求失败: " + err.Error())
	}
	defer resp.Body.Close()

	rawBody, err := io.ReadAll(io.LimitReader(resp.Body, 8<<20))
	if err != nil {
		return nil, errors.New("读取试调响应失败")
	}
	var raw interface{}
	if len(rawBody) > 0 {
		if err := json.Unmarshal(rawBody, &raw); err != nil {
			raw = string(rawBody)
		}
	} else {
		raw = ""
	}

	result := &model.ApiDefinitionDebugResult{Raw: raw}
	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		result.Options = extractDebugOptions(raw, label, valueField)
	} else {
		result.Error = fmt.Sprintf("目标接口返回 HTTP %d", resp.StatusCode)
	}
	return result, nil
}
