package handler

import (
	"back-end/internal/middleware"
	"back-end/internal/model"
	"back-end/internal/pkg/response"
	"back-end/internal/pkg/vtrans"
	"back-end/internal/service"

	"github.com/gin-gonic/gin"
)

// RoleList GET /api/v1/roles
func RoleList(c *gin.Context) {
	var req model.RoleListReq
	if msg := vtrans.Validate(c, &req); msg != "" {
		response.Fail(c, response.CodeParamError, msg)
		return
	}
	list, total, err := service.RoleList(&req)
	if err != nil {
		response.Fail(c, response.CodeServerError, "查询角色失败")
		return
	}
	response.OK(c, response.PageResult{List: list, Total: total, Page: req.Page, Size: req.Size})
}

// RoleDetail GET /api/v1/roles/:id
func RoleDetail(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	role, err := service.RoleDetail(id)
	if err != nil {
		response.Fail(c, response.CodeNotFound, err.Error())
		return
	}
	response.OK(c, role)
}

// RoleCreate POST /api/v1/roles
func RoleCreate(c *gin.Context) {
	var req model.RoleCreateReq
	if msg := vtrans.Validate(c, &req); msg != "" {
		response.Fail(c, response.CodeParamError, msg)
		return
	}
	role, err := service.RoleCreate(middleware.CurrentUserID(c), &req)
	if err != nil {
		response.Fail(c, response.CodeServerError, err.Error())
		return
	}
	response.OK(c, role)
}

// RoleUpdate PUT /api/v1/roles/:id
func RoleUpdate(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	var req model.RoleUpdateReq
	if msg := vtrans.Validate(c, &req); msg != "" {
		response.Fail(c, response.CodeParamError, msg)
		return
	}
	role, err := service.RoleUpdate(middleware.CurrentUserID(c), id, &req)
	if err != nil {
		response.Fail(c, response.CodeServerError, err.Error())
		return
	}
	response.OK(c, role)
}

// RoleDelete DELETE /api/v1/roles/:id
func RoleDelete(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	if err := service.RoleDelete(id); err != nil {
		response.Fail(c, response.CodeServerError, err.Error())
		return
	}
	response.OKMsg(c, "删除成功")
}

// RoleAssignMenus PUT /api/v1/roles/:id/menus
func RoleAssignMenus(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	var req model.AssignMenusReq
	if msg := vtrans.Validate(c, &req); msg != "" {
		response.Fail(c, response.CodeParamError, msg)
		return
	}
	if err := service.RoleAssignMenus(id, req.MenuIDs); err != nil {
		response.Fail(c, response.CodeServerError, err.Error())
		return
	}
	response.OKMsg(c, "分配菜单成功")
}

// RoleAssignDepts PUT /api/v1/roles/:id/depts 自定义数据范围绑定部门
func RoleAssignDepts(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	var req model.AssignDeptsReq
	if msg := vtrans.Validate(c, &req); msg != "" {
		response.Fail(c, response.CodeParamError, msg)
		return
	}
	if err := service.RoleAssignDepts(id, req.DeptIDs); err != nil {
		response.Fail(c, response.CodeServerError, err.Error())
		return
	}
	response.OKMsg(c, "设置数据范围成功")
}
