package handler

import (
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"time"

	"back-end/internal/config"
	"back-end/internal/middleware"
	"back-end/internal/model"
	"back-end/internal/pkg/response"
	"back-end/internal/pkg/vtrans"
	"back-end/internal/service"

	"github.com/gin-gonic/gin"
)

// ApiDefinitionList GET /{APIPrefix}/api-definitions
func ApiDefinitionList(c *gin.Context) {
	var req model.ApiDefinitionListReq
	if msg := vtrans.Validate(c, &req); msg != "" {
		response.Fail(c, response.CodeParamError, msg)
		return
	}
	list, total, err := service.ApiDefinitionList(&req)
	if err != nil {
		response.Fail(c, response.CodeServerError, "查询接口失败")
		return
	}
	response.OK(c, response.PageResult{List: list, Total: total, Page: req.Page, Size: req.Size})
}

// ApiDefinitionDetail GET /{APIPrefix}/api-definitions/:id
func ApiDefinitionDetail(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	def, err := service.ApiDefinitionDetail(id)
	if err != nil {
		response.Fail(c, response.CodeNotFound, err.Error())
		return
	}
	response.OK(c, def)
}

// ApiDefinitionCreate POST /{APIPrefix}/api-definitions
func ApiDefinitionCreate(c *gin.Context) {
	var req model.ApiDefinitionCreateReq
	if msg := vtrans.Validate(c, &req); msg != "" {
		response.Fail(c, response.CodeParamError, msg)
		return
	}
	def, err := service.ApiDefinitionCreate(middleware.CurrentUserID(c), &req)
	if err != nil {
		response.Fail(c, response.CodeServerError, err.Error())
		return
	}
	response.OK(c, def)
}

// ApiDefinitionUpdate PUT /{APIPrefix}/api-definitions/:id
func ApiDefinitionUpdate(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	var req model.ApiDefinitionUpdateReq
	if msg := vtrans.Validate(c, &req); msg != "" {
		response.Fail(c, response.CodeParamError, msg)
		return
	}
	def, err := service.ApiDefinitionUpdate(middleware.CurrentUserID(c), id, &req)
	if err != nil {
		response.Fail(c, response.CodeServerError, err.Error())
		return
	}
	response.OK(c, def)
}

// ApiDefinitionDelete DELETE /{APIPrefix}/api-definitions/:id
func ApiDefinitionDelete(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	if err := service.ApiDefinitionDelete(id); err != nil {
		response.Fail(c, response.CodeServerError, err.Error())
		return
	}
	response.OKMsg(c, "删除成功")
}

// ApiDefinitionUpdateStatus PATCH /{APIPrefix}/api-definitions/:id/status
// 列表页 Switch 切换启用状态：只改 status，不动名称/模板等其它字段
func ApiDefinitionUpdateStatus(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	var req struct {
		Status int `json:"status"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, response.CodeParamError, "状态参数错误")
		return
	}
	if err := service.ApiDefinitionUpdateStatus(middleware.CurrentUserID(c), id, req.Status); err != nil {
		response.Fail(c, response.CodeServerError, err.Error())
		return
	}
	response.OKMsg(c, "状态已更新")
}

// ApiDefinitionDebug POST /{APIPrefix}/api-definitions/debug
// 按接口 ID 加载定义执行（SQL 直查 / HTTP 转发），透传当前用户 token
func ApiDefinitionDebug(c *gin.Context) {
	var req model.ApiDefinitionDebugReq
	if msg := vtrans.Validate(c, &req); msg != "" {
		response.Fail(c, response.CodeParamError, msg)
		return
	}
	// 透传当前用户 token（Authorization: Bearer xxx）
	bearer := strings.TrimPrefix(c.GetHeader("Authorization"), "Bearer ")
	result, err := service.ApiDefinitionDebug(bearer, &req)
	if err != nil {
		// 试调失败属业务结果型错误：返回 code=1，前端拦截器静默放行，由页面展示
		response.Fail(c, response.CodeBusinessError, err.Error())
		return
	}
	response.OK(c, result)
}

// ApiDefinitionDispatch GET/POST/PUT/DELETE /{APIPrefix}/interfaces/*path
// 统一分发：按 method+path 查表执行（type=sql 直查数据库 / type=http 转发内部接口）。
// 未命中或停用返回 404，转发目标返回非 2xx 时返回 502。
func ApiDefinitionDispatch(c *gin.Context) {
	path := c.Param("path")
	if path == "" {
		c.JSON(http.StatusNotFound, gin.H{"code": response.CodeNotFound, "msg": "接口不存在或已停用", "data": nil, "timestamp": time.Now().Unix()})
		return
	}
	method := strings.ToUpper(c.Request.Method)
	var params map[string]interface{}
	if method == http.MethodGet {
		params = map[string]interface{}{}
		for k, vs := range c.Request.URL.Query() {
			if len(vs) > 0 {
				params[k] = vs[0]
			}
		}
	} else if c.Request.Body != nil {
		body, _ := io.ReadAll(io.LimitReader(c.Request.Body, 1<<20))
		if len(body) > 0 {
			_ = json.Unmarshal(body, &params)
		}
	}
	if params == nil {
		params = map[string]interface{}{}
	}
	bearer := strings.TrimPrefix(c.GetHeader("Authorization"), "Bearer ")
	result, status, err := service.ApiDefinitionExecute(bearer, method, path, params)
	if err != nil {
		c.JSON(status, gin.H{"code": response.CodeNotFound, "msg": err.Error(), "data": nil, "timestamp": time.Now().Unix()})
		return
	}
	if result.Error != "" {
		c.JSON(http.StatusBadGateway, gin.H{"code": response.CodeServerError, "msg": result.Error, "data": nil, "timestamp": time.Now().Unix()})
		return
	}
	// HTTP 转发：原样透传目标接口响应体（与直连结构一致，调用方无需额外剥壳）
	if result.Forwarded {
		c.JSON(status, result.Raw)
		return
	}
	response.OK(c, result.Raw)
}

// ApiDefinitionListRoutes GET /{APIPrefix}/api-definitions/backend/routes
// 返回后端全部业务路由（method + path + handler），供前端预览 / 一键导入
func ApiDefinitionListRoutes(c *gin.Context) {
	response.OK(c, filterBackendRoutes())
}

// ApiDefinitionCategories GET /{APIPrefix}/api-definitions/categories
// 返回接口分类候选项（已有定义出现过的分类 + router 注册行注释定义的模块分类），
// 供列表筛选下拉与抽屉分类下拉使用
func ApiDefinitionCategories(c *gin.Context) {
	response.OK(c, service.ApiDefinitionCategories())
}

// ApiDefinitionImportRoutes POST /{APIPrefix}/api-definitions/backend/import
// 一键导入后端全部业务路由为 HTTP 转发定义，返回本次导入数量
func ApiDefinitionImportRoutes(c *gin.Context) {
	dtos := filterBackendRoutes()
	defs := make([]service.RouteDef, 0, len(dtos))
	for _, d := range dtos {
		defs = append(defs, service.RouteDef{Method: d.Method, Path: d.Path})
	}
	count, err := service.ImportBackendRoutes(middleware.CurrentUserID(c), defs)
	if err != nil {
		response.Fail(c, response.CodeServerError, err.Error())
		return
	}
	response.OK(c, gin.H{"imported": count})
}

// BackendRouteDTO 后端路由 DTO：gin.RouteInfo 含 HandlerFunc 无法 JSON 序列化，仅暴露可序列化字段
type BackendRouteDTO struct {
	Method  string `json:"method"`
	Path    string `json:"path"`
	Handler string `json:"handler"`
}

// filterBackendRoutes 枚举运行时路由表并过滤出可导入的业务路由
func filterBackendRoutes() []BackendRouteDTO {
	routes := middleware.RouteSnapshot()
	out := make([]BackendRouteDTO, 0, len(routes))
	for _, r := range routes {
		if !strings.HasPrefix(r.Path, config.Cfg.Server.APIPrefix) {
			continue
		}
		if service.IsExcludedBackendRoute(r.Method, r.Path) {
			continue
		}
		out = append(out, BackendRouteDTO{Method: r.Method, Path: r.Path, Handler: r.Handler})
	}
	return out
}
