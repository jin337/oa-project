package handler

import (
	"back-end/internal/middleware"
	"back-end/internal/model"
	"back-end/internal/pkg/response"
	"back-end/internal/pkg/vtrans"
	"back-end/internal/service"

	"github.com/gin-gonic/gin"
)

// DeptTree GET /{APIPrefix}/depts 部门树
func DeptTree(c *gin.Context) {
	var req model.DeptListReq
	if msg := vtrans.Validate(c, &req); msg != "" {
		response.Fail(c, response.CodeParamError, msg)
		return
	}
	tree, err := service.DeptTree(middleware.CurrentUserID(c), &req)
	if err != nil {
		response.Fail(c, response.CodeServerError, "查询部门失败")
		return
	}
	response.OK(c, tree)
}

// DeptUsers GET /{APIPrefix}/depts/users 所有部门树 + 每个部门下的用户列表
// 带 ?status=1 时仅返回启用的部门与用户（选人弹窗数据源）
func DeptUsers(c *gin.Context) {
	onlyEnabled := c.Query("status") == "1"
	tree, err := service.DeptUsers(onlyEnabled)
	if err != nil {
		response.Fail(c, response.CodeServerError, "查询部门及用户失败")
		return
	}
	response.OK(c, tree)
}

// DeptDetail GET /{APIPrefix}/depts/:id
func DeptDetail(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	dept, err := service.DeptDetail(id)
	if err != nil {
		response.Fail(c, response.CodeNotFound, err.Error())
		return
	}
	response.OK(c, dept)
}

// DeptCreate POST /{APIPrefix}/depts
func DeptCreate(c *gin.Context) {
	var req model.DeptCreateReq
	if msg := vtrans.Validate(c, &req); msg != "" {
		response.Fail(c, response.CodeParamError, msg)
		return
	}
	dept, err := service.DeptCreate(middleware.CurrentUserID(c), &req)
	if err != nil {
		response.Fail(c, response.CodeServerError, err.Error())
		return
	}
	response.OK(c, dept)
}

// DeptUpdate PUT /{APIPrefix}/depts/:id
func DeptUpdate(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	var req model.DeptUpdateReq
	if msg := vtrans.Validate(c, &req); msg != "" {
		response.Fail(c, response.CodeParamError, msg)
		return
	}
	dept, err := service.DeptUpdate(middleware.CurrentUserID(c), id, &req)
	if err != nil {
		response.Fail(c, response.CodeServerError, err.Error())
		return
	}
	response.OK(c, dept)
}

// DeptDelete DELETE /{APIPrefix}/depts/:id
func DeptDelete(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	if err := service.DeptDelete(id); err != nil {
		response.Fail(c, response.CodeServerError, err.Error())
		return
	}
	response.OKMsg(c, "删除成功")
}
