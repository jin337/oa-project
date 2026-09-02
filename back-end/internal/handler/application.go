package handler

import (
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
