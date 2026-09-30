package handler

import (
	"back-end/internal/middleware"
	"back-end/internal/model"
	"back-end/internal/pkg/response"
	"back-end/internal/pkg/vtrans"
	"back-end/internal/service"

	"github.com/gin-gonic/gin"
)

// UserList GET /v1/api/users 分页列表（数据范围过滤）
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

// UserDetail GET /v1/api/users/:id
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

// UserCreate POST /v1/api/users
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

// UserUpdate PUT /v1/api/users/:id
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

// UserDelete DELETE /v1/api/users/:id
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

// UserAssignRoles PUT /v1/api/users/:id/roles
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

// UserUpdatePassword PUT /v1/api/users/:id/password 修改密码（仅限本人）
func UserUpdatePassword(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	var req model.UpdatePasswordReq
	if msg := vtrans.Validate(c, &req); msg != "" {
		response.Fail(c, response.CodeParamError, msg)
		return
	}
	err := service.UserUpdatePassword(middleware.CurrentUserID(c), id, &req)
	if err != nil {
		code := response.CodeServerError
		switch err.Error() {
		case "无权修改他人密码":
			code = response.CodeForbidden
		case "用户不存在":
			code = response.CodeNotFound
		case "旧密码错误":
			code = response.CodeParamError
		}
		response.Fail(c, code, err.Error())
		return
	}
	response.OKMsg(c, "修改密码成功")
}

// UserProfileGet GET /v1/api/users/:id/profile 获取员工档案
func UserProfileGet(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	profile, err := service.UserProfileGet(id)
	if err != nil {
		response.Fail(c, response.CodeNotFound, err.Error())
		return
	}
	response.OK(c, profile)
}

// UserProfileUpdate PUT /v1/api/users/:id/profile 更新员工档案（仅本人或管理员）
func UserProfileUpdate(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	var req model.UpdateProfileReq
	if msg := vtrans.Validate(c, &req); msg != "" {
		response.Fail(c, response.CodeParamError, msg)
		return
	}
	profile, err := service.UserProfileUpdate(middleware.CurrentUserID(c), id, &req)
	if err != nil {
		code := response.CodeServerError
		switch err.Error() {
		case "无权更新他人档案":
			code = response.CodeForbidden
		case "用户不存在":
			code = response.CodeNotFound
		}
		response.Fail(c, code, err.Error())
		return
	}
	response.OK(c, profile)
}

// UserSwitchDept PUT /v1/api/users/switch-dept 切换当前部门（目标必须属于多部门归属列表）
func UserSwitchDept(c *gin.Context) {
	var req model.SwitchDeptReq
	if msg := vtrans.Validate(c, &req); msg != "" {
		response.Fail(c, response.CodeParamError, msg)
		return
	}
	if err := service.UserSwitchDept(middleware.CurrentUserID(c), req.DeptID); err != nil {
		code := response.CodeServerError
		switch err.Error() {
		case "目标部门不在用户的归属部门列表中":
			code = response.CodeParamError
		case "用户不存在":
			code = response.CodeNotFound
		}
		response.Fail(c, code, err.Error())
		return
	}
	response.OKMsg(c, "切换部门成功")
}

// UserResetPassword PUT /v1/api/users/:id/reset-password 重置密码（管理员操作）
func UserResetPassword(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	var req model.ResetPasswordReq
	if msg := vtrans.Validate(c, &req); msg != "" {
		response.Fail(c, response.CodeParamError, msg)
		return
	}
	err := service.UserResetPassword(middleware.CurrentUserID(c), id, &req)
	if err != nil {
		code := response.CodeServerError
		if err.Error() == "无权限：仅管理员可重置密码" {
			code = response.CodeForbidden
		} else if err.Error() == "用户不存在" {
			code = response.CodeNotFound
		}
		response.Fail(c, code, err.Error())
		return
	}
	response.OKMsg(c, "重置密码成功")
}
