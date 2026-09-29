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

// ============================================================
// 基础校验与查重
// ============================================================

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

// checkApiDefNamePathExists 名称 / method+path 联合唯一性校验：唯一索引覆盖软删除行，查重必须 Unscoped
func checkApiDefNamePathExists(name, method, path string, excludeID uint) (nameExists, pathExists bool) {
	db := database.DB.Unscoped().Model(&model.ApiDefinition{})
	if excludeID > 0 {
		db = db.Where("id <> ?", excludeID)
	}
	var nameCount, pathCount int64
	if name != "" {
		db.Where("name = ?", name).Count(&nameCount)
	}
	if method != "" && path != "" {
		db.Where("method = ? AND path = ?", method, path).Count(&pathCount)
	}
	return nameCount > 0, pathCount > 0
}

// ============================================================
// CRUD
// ============================================================

// ApiDefinitionList 接口定义分页列表（keyword 匹配名称/路径，method/type 精确过滤）
func ApiDefinitionList(req *model.ApiDefinitionListReq) ([]model.ApiDefinition, int64, error) {
	db := database.DB.Model(&model.ApiDefinition{})
	if req.Keyword != "" {
		kw := "%" + req.Keyword + "%"
		db = db.Where("(name LIKE ? OR path LIKE ?)", kw, kw)
	}
	if req.Method != "" {
		db = db.Where("method = ?", strings.ToUpper(req.Method))
	}
	if req.Type != "" {
		db = db.Where("type = ?", req.Type)
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

// validateDefinitionPayload 按定义方式做字段级强约束校验
func validateDefinitionPayload(method, path, defType, sqlTemplate, targetPath string) error {
	if err := validateInternalPath(path); err != nil {
		return err
	}
	switch defType {
	case "sql":
		if strings.TrimSpace(sqlTemplate) == "" {
			return errors.New("定义方式为 SQL 时，SQL 模板不能为空")
		}
		if err := validateSQLTemplate(sqlTemplate); err != nil {
			return err
		}
	case "http":
		if strings.TrimSpace(targetPath) == "" {
			return errors.New("定义方式为 HTTP 时，转发目标路径不能为空")
		}
		if err := validateInternalPath(targetPath); err != nil {
			return err
		}
	default:
		return errors.New("定义方式仅支持 sql|http")
	}
	return nil
}

// ApiDefinitionCreate 新增接口定义
func ApiDefinitionCreate(curUserID uint, req *model.ApiDefinitionCreateReq) (*model.ApiDefinition, error) {
	method := strings.ToUpper(req.Method)
	if method == "" {
		method = http.MethodGet
	}
	defType := req.Type
	if defType == "" {
		defType = "sql"
	}
	if err := validateDefinitionPayload(method, req.Path, defType, req.SQLTemplate, req.TargetPath); err != nil {
		return nil, err
	}
	nameExists, pathExists := checkApiDefNamePathExists(req.Name, method, req.Path, 0)
	if nameExists || pathExists {
		return nil, errors.New("接口名称已存在，或该请求方法+路径已被占用")
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
		Name:         req.Name,
		Method:       method,
		Path:         req.Path,
		Type:         defType,
		SQLTemplate:  req.SQLTemplate,
		TargetPath:   req.TargetPath,
		Params:       params,
		Status:       status,
		Sort:         req.Sort,
		Remark:       req.Remark,
	}
	def.CreatedBy, def.UpdatedBy = curUserID, curUserID
	if err := database.DB.Create(&def).Error; err != nil {
		return nil, err
	}
	return ApiDefinitionDetail(def.ID)
}

// ApiDefinitionUpdate 修改接口定义：全字段覆盖（前端单一 Drawer 全字段提交，空串可清空旧值）。
// 合并校验仍基于提交值，未提交的字段按零值/空串写入（唯一调用方为前端全量提交，语义为"提交即覆盖"）。
func ApiDefinitionUpdate(curUserID, id uint, req *model.ApiDefinitionUpdateReq) (*model.ApiDefinition, error) {
	var def model.ApiDefinition
	if err := database.DB.First(&def, id).Error; err != nil {
		return nil, errors.New("接口不存在")
	}
	method := strings.ToUpper(req.Method)
	if method == "" {
		method = def.Method
	}
	path := req.Path
	if path == "" {
		path = def.Path
	}
	defType := req.Type
	if defType == "" {
		defType = def.Type
	}
	sqlTemplate := req.SQLTemplate
	if sqlTemplate == "" {
		sqlTemplate = def.SQLTemplate
	}
	targetPath := req.TargetPath
	if targetPath == "" {
		targetPath = def.TargetPath
	}
	if err := validateDefinitionPayload(method, path, defType, sqlTemplate, targetPath); err != nil {
		return nil, err
	}
	// 名称/端点变更时查重
	if req.Name != "" && req.Name != def.Name {
		nameExists, _ := checkApiDefNamePathExists(req.Name, method, path, id)
		if nameExists {
			return nil, errors.New("接口名称已存在")
		}
		def.Name = req.Name
	}
	if req.Method != "" || req.Path != "" {
		_, pathExists := checkApiDefNamePathExists("", method, path, id)
		if pathExists {
			return nil, errors.New("该请求方法+路径已被其他接口占用")
		}
	}
	def.Name = req.Name
	if def.Name == "" {
		def.Name = "未命名接口"
	}
	def.Method = method
	def.Path = path
	def.Type = defType
	def.SQLTemplate = req.SQLTemplate
	def.TargetPath = req.TargetPath
	if req.Params != nil {
		def.Params = req.Params
	}
	def.Status = req.Status
	if def.Status != 0 && def.Status != 1 {
		def.Status = 1
	}
	def.Sort = req.Sort
	def.Remark = req.Remark
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
// SQL 模板解析与强约束校验
// ============================================================

// formExprRe 占位符表达式语法：仅允许 form.xxx 点路径（强约束，禁止任意表达式注入）
var formExprRe = regexp.MustCompile(`^form(\.[A-Za-z0-9_]+)+$`)

// placeholderExprRe 占位符白名单：仅允许 ${form.xxx}（数据权限条件由作者在模板内静态写死）
var placeholderExprRe = regexp.MustCompile(`^form(\.[A-Za-z0-9_]+)+$`)

// sqlFirstWordRe SQL 首关键字
var sqlFirstWordRe = regexp.MustCompile(`(?i)^\s*(SELECT|INSERT|UPDATE|DELETE)\b`)

// sqlWhereRe 写操作必须带 WHERE
var sqlWhereRe = regexp.MustCompile(`(?i)\bWHERE\b`)

// validateSQLTemplate SQL 模板强约束：
// 1. 必须以 SELECT/INSERT/UPDATE/DELETE 开头（不做只读限制，但写操作必须带 WHERE）
// 2. 禁止分号（不支持多条语句）、注释符（防注释绕过参数化）
// 3. 禁止危险函数/关键字（文件读写、延迟、报错注入等）
// 4. 占位符仅允许 ${form.xxx} 形式
func validateSQLTemplate(tpl string) error {
	tpl = strings.TrimSpace(tpl)
	if tpl == "" {
		return errors.New("SQL 模板不能为空")
	}
	m := sqlFirstWordRe.FindStringSubmatch(tpl)
	if m == nil {
		return errors.New("SQL 模板必须以 SELECT/INSERT/UPDATE/DELETE 开头")
	}
	first := strings.ToUpper(m[1])
	if strings.Contains(tpl, ";") {
		return errors.New("SQL 模板禁止包含分号（不支持多条语句）")
	}
	for _, bad := range []string{"--", "/*", "*/", "#"} {
		if strings.Contains(tpl, bad) {
			return errors.New("SQL 模板禁止包含注释符 " + bad)
		}
	}
	lower := strings.ToLower(tpl)
	for _, kw := range []string{"into outfile", "into dumpfile", "load_file", "sleep(", "benchmark(", "sys_eval", "updatexml", "extractvalue", "get_lock", "release_lock"} {
		if strings.Contains(lower, kw) {
			return errors.New("SQL 模板包含危险函数/关键字：" + kw)
		}
	}
	// 占位符语法强约束：仅允许 ${form.xxx}
	anyPhRe := regexp.MustCompile(`\$\{[^}]+\}`)
	for _, ph := range anyPhRe.FindAllString(tpl, -1) {
		if !placeholderExprRe.MatchString(ph[2:len(ph)-1]) {
			return errors.New("占位符仅支持 ${form.xxx} 形式：" + ph)
		}
	}
	if first != "SELECT" && !sqlWhereRe.MatchString(tpl) {
		return errors.New(first + " 语句必须包含 WHERE 条件，禁止全表操作")
	}
	return nil
}

// resolveSQLPlaceholders 统一替换模板占位符，返回参数化骨架与参数（按占位符出现顺序）：
// - ${form.xxx}：求值 form 上下文，参数化（? + 值）
// 数据权限由作者在 SQL 模板内静态写死（静态权限为主），引擎不做任何动态注入
func resolveSQLPlaceholders(tpl string, vars map[string]interface{}) (string, []interface{}, error) {
	var sb strings.Builder
	args := make([]interface{}, 0, 4)
	anyPhRe := regexp.MustCompile(`\$\{[^}]+\}`)
	last := 0
	for _, loc := range anyPhRe.FindAllStringIndex(tpl, -1) {
		sb.WriteString(tpl[last:loc[0]])
		ph := tpl[loc[0]:loc[1]]
		inner := ph[2 : len(ph)-1]
		v, err := evalFormExpr(inner, vars)
		if err != nil {
			return "", nil, err
		}
		sb.WriteString("?")
		args = append(args, v)
		last = loc[1]
	}
	sb.WriteString(tpl[last:])
	return sb.String(), args, nil
}

// evalFormExpr 求值 form 上下文点路径表达式（form.xxx.yyy），vars 形如 {"form": {...}}
func evalFormExpr(expr string, vars map[string]interface{}) (interface{}, error) {
	if !formExprRe.MatchString(expr) {
		return nil, errors.New("仅支持 form.xxx 点路径表达式")
	}
	root, ok := vars["form"]
	if !ok || root == nil {
		return nil, errors.New("缺少 form 上下文")
	}
	cur := root
	for _, p := range strings.Split(strings.TrimPrefix(expr, "form."), ".") {
		switch m := cur.(type) {
		case map[string]interface{}:
			cur = m[p]
		case map[string]string:
			cur = m[p]
		default:
			return nil, fmt.Errorf("字段 %s 不存在或类型不支持", p)
		}
		if cur == nil {
			return nil, fmt.Errorf("字段 %s 不存在", p)
		}
	}
	return cur, nil
}

// ============================================================
// SQL 执行引擎
// ============================================================

// executeSQL 执行 SQL 接口：占位符求值（${form.xxx}）→ 参数化执行（8s 超时）；
// 数据权限由模板内静态条件决定（静态权限为主，引擎不做动态注入）
func executeSQL(def *model.ApiDefinition, vars map[string]interface{}) (*model.ApiDefinitionDebugResult, error) {
	finalSQL, args, err := resolveSQLPlaceholders(def.SQLTemplate, vars)
	if err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	first := strings.ToUpper(strings.Fields(finalSQL)[0])
	if first == "SELECT" {
		rows := []map[string]interface{}{}
		if err := database.DB.WithContext(ctx).Raw(finalSQL, args...).Scan(&rows).Error; err != nil {
			return nil, errors.New("SQL 执行失败: " + err.Error())
		}
		return &model.ApiDefinitionDebugResult{Raw: rows}, nil
	}
	res := database.DB.WithContext(ctx).Exec(finalSQL, args...)
	if res.Error != nil {
		return nil, errors.New("SQL 执行失败: " + res.Error.Error())
	}
	return &model.ApiDefinitionDebugResult{Raw: map[string]interface{}{"affected": res.RowsAffected}}, nil
}

// ============================================================
// HTTP 转发
// ============================================================

// evalParamValue 递归求值参数模板：字符串整体为 ${form.xxx} 时替换为上下文值，map/数组递归处理
func evalParamValue(v interface{}, vars map[string]interface{}) interface{} {
	switch t := v.(type) {
	case string:
		if strings.HasPrefix(t, "${form.") && strings.HasSuffix(t, "}") {
			if val, err := evalFormExpr(t[2:len(t)-1], vars); err == nil {
				return val
			}
		}
		return t
	case map[string]interface{}:
		return evalParamsTemplate(t, vars)
	case []interface{}:
		out := make([]interface{}, len(t))
		for i, item := range t {
			out[i] = evalParamValue(item, vars)
		}
		return out
	default:
		return v
	}
}

func evalParamsTemplate(params map[string]interface{}, vars map[string]interface{}) map[string]interface{} {
	out := make(map[string]interface{}, len(params))
	for k, v := range params {
		out[k] = evalParamValue(v, vars)
	}
	return out
}

// forwardHTTP 转发内部接口：method（与对外方法一致）+ target_path + params 模板（独立 context 8s 超时）
func forwardHTTP(bearerToken string, def *model.ApiDefinition, vars map[string]interface{}) (*model.ApiDefinitionDebugResult, error) {
	method := strings.ToUpper(def.Method)
	if method == "" {
		method = http.MethodGet
	}
	if err := validateInternalPath(def.TargetPath); err != nil {
		return nil, err
	}
	params := evalParamsTemplate(def.Params, vars)
	if len(params) == 0 && len(def.Params) == 0 {
		// 未配置参数模板：原样透传外部请求参数
		if form, ok := vars["form"].(map[string]interface{}); ok {
			params = form
		}
	}

	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	target := fmt.Sprintf("http://127.0.0.1:%d/api/v1%s", config.Cfg.Server.Port, def.TargetPath)

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
		return nil, errors.New("构造转发请求失败")
	}
	if bearerToken != "" {
		httpReq.Header.Set("Authorization", "Bearer "+bearerToken)
	}
	if bodyReader != nil {
		httpReq.Header.Set("Content-Type", "application/json")
	}

	resp, err := http.DefaultClient.Do(httpReq)
	if err != nil {
		return nil, errors.New("转发请求失败: " + err.Error())
	}
	defer resp.Body.Close()

	rawBody, err := io.ReadAll(io.LimitReader(resp.Body, 8<<20))
	if err != nil {
		return nil, errors.New("读取转发响应失败")
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
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		result.Error = fmt.Sprintf("目标接口返回 HTTP %d", resp.StatusCode)
	}
	return result, nil
}

// ============================================================
// 试调与统一分发
// ============================================================

// ApiDefinitionDebug 接口试调：按接口 ID 加载定义执行
func ApiDefinitionDebug(bearerToken string, req *model.ApiDefinitionDebugReq) (*model.ApiDefinitionDebugResult, error) {
	var def model.ApiDefinition
	if err := database.DB.First(&def, req.ID).Error; err != nil {
		return nil, errors.New("接口不存在")
	}
	if def.Status != 1 {
		return nil, errors.New("接口已停用，无法试调")
	}
	vars := map[string]interface{}{"form": req.Params}
	if vars["form"] == nil {
		vars["form"] = map[string]interface{}{}
	}
	if def.Type == "http" {
		return forwardHTTP(bearerToken, &def, vars)
	}
	return executeSQL(&def, vars)
}

// ApiDefinitionExecute 统一分发：按 method+path 查表（status=1），命中执行 SQL / 转发
func ApiDefinitionExecute(bearerToken, method, path string, params map[string]interface{}) (*model.ApiDefinitionDebugResult, int, error) {
	method = strings.ToUpper(method)
	var def model.ApiDefinition
	if err := database.DB.Where("method = ? AND path = ? AND status = 1", method, path).First(&def).Error; err != nil {
		// 未精确命中：尝试段模板匹配（支持 /system/user/:id 等动态路径）
		var candidates []model.ApiDefinition
		if database.DB.Where("method = ? AND status = 1 AND path LIKE ?", method, "%:%").Find(&candidates).Error == nil {
			for _, d := range candidates {
				if pathParams, ok := matchTemplatePath(d.Path, path); ok {
					def = d
					// 用提取的路径参数渲染目标路径（:id → 实际值）
					def.TargetPath = renderPathTemplate(def.TargetPath, pathParams)
					for k, v := range pathParams {
						params[k] = v
					}
					break
				}
			}
		}
		if def.ID == 0 {
			return nil, http.StatusNotFound, errors.New("接口不存在或已停用")
		}
	}
	vars := map[string]interface{}{"form": params}
	if vars["form"] == nil {
		vars["form"] = map[string]interface{}{}
	}
	if def.Type == "http" {
		result, err := forwardHTTP(bearerToken, &def, vars)
		return result, http.StatusOK, err
	}
	result, err := executeSQL(&def, vars)
	return result, http.StatusOK, err
}

// ============================================================
// 后端路由一键导入
// ============================================================

// IsExcludedBackendRoute 导入时排除的路由：接口管理自身、分发端点、登录、SSE 长连接
func IsExcludedBackendRoute(method, path string) bool {
	if strings.HasPrefix(path, "/api/v1/api-definitions") {
		return true
	}
	if strings.HasPrefix(path, "/api/v1/interfaces") {
		return true
	}
	if path == "/api/v1/auth/login" {
		return true
	}
	if path == "/api/v1/notifications/stream" {
		return true
	}
	return false
}

// RouteDef 后端路由导入输入（method + path，由 handler 从运行时路由表转换而来）
type RouteDef struct {
	Method string
	Path   string
}

// ImportBackendRoutes 批量把后端业务路由导入为 HTTP 转发定义：
// name=method+path，target 指向内部同路径接口，已存在的 method+path 跳过
func ImportBackendRoutes(curUserID uint, routes []RouteDef) (int, error) {
	imported := 0
	for _, r := range routes {
		if !strings.HasPrefix(r.Path, "/api/v1") {
			continue
		}
		if IsExcludedBackendRoute(r.Method, r.Path) {
			continue
		}
		method := strings.ToUpper(r.Method)
		path := "/" + strings.Trim(strings.TrimPrefix(r.Path, "/api/v1"), "/")
		var cnt int64
		if err := database.DB.Model(&model.ApiDefinition{}).Where("method = ? AND path = ?", method, path).Count(&cnt).Error; err != nil {
			return imported, err
		}
		if cnt > 0 {
			continue
		}
		def := model.ApiDefinition{
			Name:         method + " " + path,
			Method:       method,
			Path:         path,
			Type:         "http",
			TargetPath:   path,
			Status:       1,
			Sort:         0,
			Remark:       "后端路由自动导入",
		}
		def.CreatedBy = curUserID
		if err := database.DB.Create(&def).Error; err != nil {
			return imported, err
		}
		imported++
	}
	return imported, nil
}

// renderPathTemplate 将目标路径模板中的 :x 段替换为实际路径参数值
func renderPathTemplate(tpl string, params map[string]interface{}) string {
	parts := strings.Split(strings.Trim(tpl, "/"), "/")
	for i, p := range parts {
		if strings.HasPrefix(p, ":") {
			if v, ok := params[strings.TrimPrefix(p, ":")]; ok {
				parts[i] = fmt.Sprintf("%v", v)
			}
		}
	}
	return "/" + strings.Join(parts, "/")
}

// matchTemplatePath 段模板匹配：模板 :x 段匹配实际路径任意单段，返回路径参数
func matchTemplatePath(tpl, actual string) (map[string]interface{}, bool) {
	if !strings.Contains(tpl, ":") {
		return nil, false
	}
	tParts := strings.Split(strings.Trim(tpl, "/"), "/")
	aParts := strings.Split(strings.Trim(actual, "/"), "/")
	if len(tParts) != len(aParts) {
		return nil, false
	}
	params := map[string]interface{}{}
	for i := range tParts {
		if strings.HasPrefix(tParts[i], ":") {
			params[strings.TrimPrefix(tParts[i], ":")] = aParts[i]
		} else if tParts[i] != aParts[i] {
			return nil, false
		}
	}
	return params, true
}
