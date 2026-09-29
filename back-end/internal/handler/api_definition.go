package handler

import (
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"time"

	"back-end/internal/middleware"
	"back-end/internal/model"
	"back-end/internal/pkg/response"
	"back-end/internal/pkg/vtrans"
	"back-end/internal/service"

	"github.com/gin-gonic/gin"
)

// ApiDefinitionList GET /api/v1/api-definitions
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

// ApiDefinitionDetail GET /api/v1/api-definitions/:id
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

// ApiDefinitionCreate POST /api/v1/api-definitions
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

// ApiDefinitionUpdate PUT /api/v1/api-definitions/:id
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

// ApiDefinitionDelete DELETE /api/v1/api-definitions/:id
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

// ApiDefinitionDebug POST /api/v1/api-definitions/debug
// 按接口 ID 加载定义执行（SQL 直查 / HTTP 转发），透传当前用户 token 与数据权限
func ApiDefinitionDebug(c *gin.Context) {
	var req model.ApiDefinitionDebugReq
	if msg := vtrans.Validate(c, &req); msg != "" {
		response.Fail(c, response.CodeParamError, msg)
		return
	}
	// 透传当前用户 token（Authorization: Bearer xxx），保证试调走当前用户数据权限
	bearer := strings.TrimPrefix(c.GetHeader("Authorization"), "Bearer ")
	result, err := service.ApiDefinitionDebug(middleware.CurrentUserID(c), bearer, &req)
	if err != nil {
		response.Fail(c, response.CodeServerError, err.Error())
		return
	}
	response.OK(c, result)
}

// ApiDefinitionDispatch GET/POST/PUT/DELETE /api/v1/interfaces/*path
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
	result, status, err := service.ApiDefinitionExecute(middleware.CurrentUserID(c), bearer, method, path, params)
	if err != nil {
		c.JSON(status, gin.H{"code": response.CodeNotFound, "msg": err.Error(), "data": nil, "timestamp": time.Now().Unix()})
		return
	}
	if result.Error != "" {
		c.JSON(http.StatusBadGateway, gin.H{"code": response.CodeServerError, "msg": result.Error, "data": nil, "timestamp": time.Now().Unix()})
		return
	}
	response.OK(c, result.Raw)
}
