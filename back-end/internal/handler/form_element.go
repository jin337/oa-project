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

// parseElementID 解析路径中的 :elementId 参数，非法时直接拦截
func parseElementID(c *gin.Context) (uint, bool) {
	id, err := strconv.ParseUint(c.Param("elementId"), 10, 64)
	if err != nil || id == 0 {
		response.Fail(c, response.CodeParamError, "元素 ID 参数非法")
		return 0, false
	}
	return uint(id), true
}

// FormElementList GET /api/v1/application/:id/formelement 表单元素分页列表
func FormElementList(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	var req model.FormElementListReq
	if msg := vtrans.Validate(c, &req); msg != "" {
		response.Fail(c, response.CodeParamError, msg)
		return
	}
	list, total, err := service.FormElementList(id, &req)
	if err != nil {
		response.Fail(c, response.CodeServerError, err.Error())
		return
	}
	response.OK(c, response.PageResult{List: list, Total: total, Page: req.Page, Size: req.Size})
}

// FormElementCreate POST /api/v1/application/:id/formelement 新增表单元素
func FormElementCreate(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	var req model.FormElementCreateReq
	if msg := vtrans.Validate(c, &req); msg != "" {
		response.Fail(c, response.CodeParamError, msg)
		return
	}
	el, err := service.FormElementCreate(middleware.CurrentUserID(c), id, &req)
	if err != nil {
		response.Fail(c, response.CodeServerError, err.Error())
		return
	}
	response.OK(c, el)
}

// FormElementUpdate PUT /api/v1/application/:id/formelement/:elementId 修改表单元素
func FormElementUpdate(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	elementID, ok := parseElementID(c)
	if !ok {
		return
	}
	var req model.FormElementUpdateReq
	if msg := vtrans.Validate(c, &req); msg != "" {
		response.Fail(c, response.CodeParamError, msg)
		return
	}
	el, err := service.FormElementUpdate(middleware.CurrentUserID(c), id, elementID, &req)
	if err != nil {
		response.Fail(c, response.CodeServerError, err.Error())
		return
	}
	response.OK(c, el)
}

// FormElementDelete DELETE /api/v1/application/:id/formelement/:elementId 删除表单元素
func FormElementDelete(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	elementID, ok := parseElementID(c)
	if !ok {
		return
	}
	if err := service.FormElementDelete(id, elementID); err != nil {
		response.Fail(c, response.CodeServerError, err.Error())
		return
	}
	response.OKMsg(c, "删除成功")
}
