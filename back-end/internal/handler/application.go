package handler

import (
	"strconv"

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
func ApplicationByCode(c *gin.Context) {
	code := c.Param("code")
	if code == "" {
		response.Fail(c, response.CodeParamError, "页面编码不能为空")
		return
	}
	app, err := service.ApplicationByCode(code)
	if err != nil {
		response.Fail(c, response.CodeNotFound, err.Error())
		return
	}
	response.OK(c, app)
}

// ApplicationDataList GET /api/v1/application/:id/data 动态数据列表查询
// 参数：page、size、table_name，以及动态搜索字段（以 field_key 作为 Query 参数名）
func ApplicationDataList(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	var req model.ApplicationDataListReq
	if msg := vtrans.Validate(c, &req); msg != "" {
		response.Fail(c, response.CodeParamError, msg)
		return
	}
	// 动态搜索字段：query 中除 page/size/table_name 之外的参数（field_key → 值）
	filters := make(map[string]string)
	for k, vs := range c.Request.URL.Query() {
		if k == "page" || k == "size" || k == "table_name" {
			continue
		}
		if len(vs) > 0 && vs[0] != "" {
			filters[k] = vs[0]
		}
	}
	req.Filters = filters
	list, total, err := service.ApplicationDataList(id, &req)
	if err != nil {
		response.Fail(c, response.CodeServerError, err.Error())
		return
	}
	response.OK(c, response.PageResult{List: list, Total: total, Page: req.Page, Size: req.Size})
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
