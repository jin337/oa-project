package handler

import (
	"back-end/internal/middleware"
	"back-end/internal/model"
	"back-end/internal/pkg/response"
	"back-end/internal/pkg/vtrans"
	"back-end/internal/service"

	"github.com/gin-gonic/gin"
)

// UserList GET /api/v1/users 分页列表（数据范围过滤）
func UserList(c *gin.Context) {
	var req model.UserListReq
	if msg := vtrans.Validate(c, &req); msg != "" {
		response.Fail(c, response.CodeParamError, msg)
		return
	}
	list, total, err := service.UserList(middleware.CurrentUserID(c), &req)
	if err != nil {
		response.Fail(c, response.CodeServerError, "查询用户失败")
		return
	}
	response.OK(c, response.PageResult{List: list, Total: total, Page: req.Page, Size: req.Size})
}

// UserDetail GET /api/v1/users/:id
func UserDetail(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	user, err := service.UserDetail(id)
	if err != nil {
		response.Fail(c, response.CodeNotFound, err.Error())
		return
	}
	response.OK(c, user)
}

// UserCreate POST /api/v1/users
func UserCreate(c *gin.Context) {
	var req model.UserCreateReq
	if msg := vtrans.Validate(c, &req); msg != "" {
		response.Fail(c, response.CodeParamError, msg)
		return
	}
	user, err := service.UserCreate(middleware.CurrentUserID(c), &req)
	if err != nil {
		response.Fail(c, response.CodeServerError, err.Error())
		return
	}
	response.OK(c, user)
}

// UserUpdate PUT /api/v1/users/:id
func UserUpdate(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	var req model.UserUpdateReq
	if msg := vtrans.Validate(c, &req); msg != "" {
		response.Fail(c, response.CodeParamError, msg)
		return
	}
	user, err := service.UserUpdate(middleware.CurrentUserID(c), id, &req)
	if err != nil {
		response.Fail(c, response.CodeServerError, err.Error())
		return
	}
	response.OK(c, user)
}

// UserDelete DELETE /api/v1/users/:id
func UserDelete(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	if err := service.UserDelete(id); err != nil {
		response.Fail(c, response.CodeServerError, err.Error())
		return
	}
	response.OKMsg(c, "删除成功")
}

// UserAssignRoles PUT /api/v1/users/:id/roles
func UserAssignRoles(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	var req model.AssignRolesReq
	if msg := vtrans.Validate(c, &req); msg != "" {
		response.Fail(c, response.CodeParamError, msg)
		return
	}
	if err := service.UserAssignRoles(id, req.RoleIDs); err != nil {
		response.Fail(c, response.CodeServerError, err.Error())
		return
	}
	response.OKMsg(c, "分配角色成功")
}
