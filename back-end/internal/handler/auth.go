package handler

import (
	"back-end/internal/middleware"
	"back-end/internal/model"
	"back-end/internal/pkg/response"
	"back-end/internal/pkg/vtrans"
	"back-end/internal/service"

	"github.com/gin-gonic/gin"
)

// Login POST /v1/api/auth/login
func Login(c *gin.Context) {
	var req model.LoginReq
	if msg := vtrans.Validate(c, &req); msg != "" {
		response.Fail(c, response.CodeParamError, msg)
		return
	}
	res, err := service.Login(&req)
	if err != nil {
		response.Fail(c, response.CodeServerError, err.Error())
		return
	}
	response.OK(c, res)
}

// Profile GET /v1/api/auth/profile 当前用户资料+菜单树+权限标识
func Profile(c *gin.Context) {
	res, err := service.Profile(middleware.CurrentUserID(c))
	if err != nil {
		response.Fail(c, response.CodeNotFound, err.Error())
		return
	}
	response.OK(c, res)
}

// UserMenus GET /v1/api/auth/menus 当前用户菜单树
func UserMenus(c *gin.Context) {
	menus, perms := service.UserMenus(middleware.CurrentUserID(c))
	response.OK(c, gin.H{"menus": menus, "perms": perms})
}
