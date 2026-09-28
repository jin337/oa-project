package handler

import (
	"strings"

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
// 以当前登录用户身份回环请求目标内部接口，返回原始响应 + 映射后的选项列表
func ApiDefinitionDebug(c *gin.Context) {
	var req model.ApiDefinitionDebugReq
	if msg := vtrans.Validate(c, &req); msg != "" {
		response.Fail(c, response.CodeParamError, msg)
		return
	}
	// 透传当前用户 token（Authorization: Bearer xxx），保证试调走当前用户数据权限
	bearer := strings.TrimPrefix(c.GetHeader("Authorization"), "Bearer ")
	result, err := service.ApiDefinitionDebug(bearer, &req)
	if err != nil {
		response.Fail(c, response.CodeServerError, err.Error())
		return
	}
	response.OK(c, result)
}
