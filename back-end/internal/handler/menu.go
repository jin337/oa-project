package handler

import (
	"back-end/internal/middleware"
	"back-end/internal/model"
	"back-end/internal/pkg/response"
	"back-end/internal/pkg/vtrans"
	"back-end/internal/service"

	"github.com/gin-gonic/gin"
)

// MenuTree GET /api/v1/menus 菜单树
func MenuTree(c *gin.Context) {
	var req model.DeptListReq
	if msg := vtrans.Validate(c, &req); msg != "" {
		response.Fail(c, response.CodeParamError, msg)
		return
	}
	tree, err := service.MenuTree(&req)
	if err != nil {
		response.Fail(c, response.CodeServerError, "查询菜单失败")
		return
	}
	response.OK(c, tree)
}

// MenuDetail GET /api/v1/menus/:id
func MenuDetail(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	menu, err := service.MenuDetail(id)
	if err != nil {
		response.Fail(c, response.CodeNotFound, err.Error())
		return
	}
	response.OK(c, menu)
}

// MenuCreate POST /api/v1/menus
func MenuCreate(c *gin.Context) {
	var req model.MenuCreateReq
	if msg := vtrans.Validate(c, &req); msg != "" {
		response.Fail(c, response.CodeParamError, msg)
		return
	}
	menu, err := service.MenuCreate(middleware.CurrentUserID(c), &req)
	if err != nil {
		response.Fail(c, response.CodeServerError, err.Error())
		return
	}
	response.OK(c, menu)
}

// MenuUpdate PUT /api/v1/menus/:id
func MenuUpdate(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	var req model.MenuUpdateReq
	if msg := vtrans.Validate(c, &req); msg != "" {
		response.Fail(c, response.CodeParamError, msg)
		return
	}
	menu, err := service.MenuUpdate(middleware.CurrentUserID(c), id, &req)
	if err != nil {
		response.Fail(c, response.CodeServerError, err.Error())
		return
	}
	response.OK(c, menu)
}

// MenuDelete DELETE /api/v1/menus/:id
func MenuDelete(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	if err := service.MenuDelete(id); err != nil {
		response.Fail(c, response.CodeServerError, err.Error())
		return
	}
	response.OKMsg(c, "删除成功")
}
