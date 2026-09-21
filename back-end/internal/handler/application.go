package handler

import (
	"strconv"
	"strings"

	"back-end/internal/middleware"
	"back-end/internal/model"
	"back-end/internal/pkg/response"
	"back-end/internal/pkg/vtrans"
	"back-end/internal/service"

	"github.com/gin-gonic/gin"
)

// ApplicationList GET /api/v1/application 分页列表
func ApplicationList(c *gin.Context) {
	var req model.ApplicationListReq
	if msg := vtrans.Validate(c, &req); msg != "" {
		response.Fail(c, response.CodeParamError, msg)
		return
	}
	list, total, err := service.ApplicationList(&req)
	if err != nil {
		response.Fail(c, response.CodeServerError, "查询页面配置失败")
		return
	}
	response.OK(c, response.PageResult{List: list, Total: total, Page: req.Page, Size: req.Size})
}

// ApplicationDetail GET /api/v1/application/:id
func ApplicationDetail(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	app, err := service.ApplicationDetail(id)
	if err != nil {
		response.Fail(c, response.CodeNotFound, err.Error())
		return
	}
	response.OK(c, app)
}

// ApplicationByCode GET /api/v1/application/by-code/:code 按页面编码查询详情
// Query 参数 state 控制返回内容：list / form / detail；不传或未知时返回完整配置
func ApplicationByCode(c *gin.Context) {
	code := strings.TrimSpace(c.Param("code"))
	if code == "" {
		response.Fail(c, response.CodeParamError, "页面编码不能为空")
		return
	}
	state := strings.TrimSpace(c.DefaultQuery("state", ""))
	if state != "" && state != "list" && state != "form" && state != "detail" {
		response.Fail(c, response.CodeParamError, "state 参数非法，仅支持 list/form/detail")
		return
	}
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	size, _ := strconv.Atoi(c.DefaultQuery("size", "10"))
	// 动态搜索字段：query 中除 state/page/size 等系统保留参数之外的参数（field_key → 值）
	filters := make(map[string]string)
	for k, vs := range c.Request.URL.Query() {
		if k == "state" || k == "page" || k == "size" {
			continue
		}
		if len(vs) > 0 && vs[0] != "" {
			filters[k] = vs[0]
		}
	}
	result, err := service.ApplicationByCode(code, state, page, size, filters, middleware.CurrentUserID(c))
	if err != nil {
		response.Fail(c, response.CodeNotFound, err.Error())
		return
	}
	response.OK(c, result)
}

// ApplicationDataDetail GET /api/v1/application/:id/data/:dataId 动态数据详情（含子表数据）
func ApplicationDataDetail(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	dataID, err := strconv.ParseUint(c.Param("dataId"), 10, 64)
	if err != nil || dataID == 0 {
		response.Fail(c, response.CodeParamError, "数据 ID 参数非法")
		return
	}
	var req model.ApplicationDataDetailReq
	if msg := vtrans.Validate(c, &req); msg != "" {
		response.Fail(c, response.CodeParamError, msg)
		return
	}
	data, err := service.ApplicationDataDetail(id, uint(dataID), &req)
	if err != nil {
		response.Fail(c, response.CodeNotFound, err.Error())
		return
	}
	response.OK(c, data)
}

// ApplicationDataCreate POST /api/v1/application/:id/data 动态业务数据新增（提交申请表单）
func ApplicationDataCreate(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	var data map[string]interface{}
	if err := c.ShouldBindJSON(&data); err != nil || len(data) == 0 {
		response.Fail(c, response.CodeParamError, "请求体不能为空")
		return
	}
	newID, err := service.ApplicationDataCreate(id, middleware.CurrentUserID(c), data)
	if err != nil {
		response.Fail(c, response.CodeServerError, err.Error())
		return
	}
	response.OK(c, gin.H{"id": newID})
}

// ApplicationDataDelete DELETE /api/v1/application/:id/data/:dataId 动态业务数据删除（列表页删除行）
func ApplicationDataDelete(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	dataID, err := strconv.ParseUint(c.Param("dataId"), 10, 64)
	if err != nil || dataID == 0 {
		response.Fail(c, response.CodeParamError, "数据 ID 参数非法")
		return
	}
	if err := service.ApplicationDataDelete(id, uint(dataID)); err != nil {
		response.Fail(c, response.CodeServerError, err.Error())
		return
	}
	response.OKMsg(c, "删除成功")
}

// ApplicationDataUpdate PUT /api/v1/application/:id/data/:dataId 动态业务数据更新（编辑表单提交）
func ApplicationDataUpdate(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	dataID, err := strconv.ParseUint(c.Param("dataId"), 10, 64)
	if err != nil || dataID == 0 {
		response.Fail(c, response.CodeParamError, "数据 ID 参数非法")
		return
	}
	var data map[string]interface{}
	if err := c.ShouldBindJSON(&data); err != nil || len(data) == 0 {
		response.Fail(c, response.CodeParamError, "请求体不能为空")
		return
	}
	if err := service.ApplicationDataUpdate(id, uint(dataID), middleware.CurrentUserID(c), data); err != nil {
		response.Fail(c, response.CodeServerError, err.Error())
		return
	}
	response.OKMsg(c, "更新成功")
}

// ApplicationCreate POST /api/v1/application
func ApplicationCreate(c *gin.Context) {
	var req model.ApplicationCreateReq
	if msg := vtrans.Validate(c, &req); msg != "" {
		response.Fail(c, response.CodeParamError, msg)
		return
	}
	app, err := service.ApplicationCreate(middleware.CurrentUserID(c), &req)
	if err != nil {
		response.Fail(c, response.CodeServerError, err.Error())
		return
	}
	response.OK(c, app)
}

// ApplicationUpdate PUT /api/v1/application/:id
func ApplicationUpdate(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	var req model.ApplicationUpdateReq
	if msg := vtrans.Validate(c, &req); msg != "" {
		response.Fail(c, response.CodeParamError, msg)
		return
	}
	app, err := service.ApplicationUpdate(middleware.CurrentUserID(c), id, &req)
	if err != nil {
		response.Fail(c, response.CodeServerError, err.Error())
		return
	}
	response.OK(c, app)
}

// ApplicationDelete DELETE /api/v1/application/:id
func ApplicationDelete(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	if err := service.ApplicationDelete(id); err != nil {
		response.Fail(c, response.CodeServerError, err.Error())
		return
	}
	response.OKMsg(c, "删除成功")
}
