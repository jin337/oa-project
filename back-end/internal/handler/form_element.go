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

// ApplicationElementList GET /api/v1/application/:id/element 表单元素分页列表
func ApplicationElementList(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	var req model.ApplicationElementListReq
	if msg := vtrans.Validate(c, &req); msg != "" {
		response.Fail(c, response.CodeParamError, msg)
		return
	}
	list, total, err := service.ApplicationElementList(id, &req)
	if err != nil {
		response.Fail(c, response.CodeServerError, err.Error())
		return
	}
	response.OK(c, response.PageResult{List: list, Total: total, Page: req.Page, Size: req.Size})
}

// ApplicationElementCreate POST /api/v1/application/:id/element 新增表单元素
func ApplicationElementCreate(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	var req model.ApplicationElementCreateReq
	if msg := vtrans.Validate(c, &req); msg != "" {
		response.Fail(c, response.CodeParamError, msg)
		return
	}
	el, err := service.ApplicationElementCreate(middleware.CurrentUserID(c), id, &req)
	if err != nil {
		response.Fail(c, response.CodeServerError, err.Error())
		return
	}
	response.OK(c, el)
}

// ApplicationElementUpdate PUT /api/v1/application/:id/element/:elementId 修改表单元素
func ApplicationElementUpdate(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	elementID, ok := parseElementID(c)
	if !ok {
		return
	}
	var req model.ApplicationElementUpdateReq
	if msg := vtrans.Validate(c, &req); msg != "" {
		response.Fail(c, response.CodeParamError, msg)
		return
	}
	el, err := service.ApplicationElementUpdate(middleware.CurrentUserID(c), id, elementID, &req)
	if err != nil {
		response.Fail(c, response.CodeServerError, err.Error())
		return
	}
	response.OK(c, el)
}

// ApplicationElementDelete DELETE /api/v1/application/:id/element/:elementId 删除表单元素
func ApplicationElementDelete(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	elementID, ok := parseElementID(c)
	if !ok {
		return
	}
	if err := service.ApplicationElementDelete(id, elementID); err != nil {
		response.Fail(c, response.CodeServerError, err.Error())
		return
	}
	response.OKMsg(c, "删除成功")
}
