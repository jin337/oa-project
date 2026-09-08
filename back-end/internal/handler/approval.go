package handler

import (
	"back-end/internal/middleware"
	"back-end/internal/model"
	"back-end/internal/pkg/response"
	"back-end/internal/pkg/vtrans"
	"back-end/internal/service"

	"github.com/gin-gonic/gin"
)

// ==================== 审批分类 ====================

// ApprovalCategoryList GET /api/v1/approval/category
func ApprovalCategoryList(c *gin.Context) {
	var req model.ApprovalCategoryListReq
	if msg := vtrans.Validate(c, &req); msg != "" {
		response.Fail(c, response.CodeParamError, msg)
		return
	}
	list, total, err := service.ApprovalCategoryList(&req)
	if err != nil {
		response.Fail(c, response.CodeServerError, "查询审批分类失败")
		return
	}
	response.OK(c, response.PageResult{List: list, Total: total, Page: req.Page, Size: req.Size})
}

// ApprovalCategoryCreate POST /api/v1/approval/category
func ApprovalCategoryCreate(c *gin.Context) {
	var req model.ApprovalCategoryCreateReq
	if msg := vtrans.Validate(c, &req); msg != "" {
		response.Fail(c, response.CodeParamError, msg)
		return
	}
	cat, err := service.ApprovalCategoryCreate(middleware.CurrentUserID(c), &req)
	if err != nil {
		response.Fail(c, response.CodeServerError, err.Error())
		return
	}
	response.OK(c, cat)
}

// ApprovalCategoryUpdate PUT /api/v1/approval/category/:id
func ApprovalCategoryUpdate(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	var req model.ApprovalCategoryUpdateReq
	if msg := vtrans.Validate(c, &req); msg != "" {
		response.Fail(c, response.CodeParamError, msg)
		return
	}
	cat, err := service.ApprovalCategoryUpdate(middleware.CurrentUserID(c), id, &req)
	if err != nil {
		response.Fail(c, response.CodeServerError, err.Error())
		return
	}
	response.OK(c, cat)
}

// ApprovalCategoryDelete DELETE /api/v1/approval/category/:id
func ApprovalCategoryDelete(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	if err := service.ApprovalCategoryDelete(id); err != nil {
		response.Fail(c, response.CodeServerError, err.Error())
		return
	}
	response.OKMsg(c, "删除成功")
}

// ==================== 申请项 ====================

// ApprovalItemList GET /api/v1/approval/item
func ApprovalItemList(c *gin.Context) {
	var req model.ApprovalItemListReq
	if msg := vtrans.Validate(c, &req); msg != "" {
		response.Fail(c, response.CodeParamError, msg)
		return
	}
	list, total, err := service.ApprovalItemList(&req)
	if err != nil {
		response.Fail(c, response.CodeServerError, "查询申请项失败")
		return
	}
	response.OK(c, response.PageResult{List: list, Total: total, Page: req.Page, Size: req.Size})
}

// ApprovalItemCreate POST /api/v1/approval/item
func ApprovalItemCreate(c *gin.Context) {
	var req model.ApprovalItemCreateReq
	if msg := vtrans.Validate(c, &req); msg != "" {
		response.Fail(c, response.CodeParamError, msg)
		return
	}
	item, err := service.ApprovalItemCreate(middleware.CurrentUserID(c), &req)
	if err != nil {
		response.Fail(c, response.CodeServerError, err.Error())
		return
	}
	response.OK(c, item)
}

// ApprovalItemUpdate PUT /api/v1/approval/item/:id
func ApprovalItemUpdate(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	var req model.ApprovalItemUpdateReq
	if msg := vtrans.Validate(c, &req); msg != "" {
		response.Fail(c, response.CodeParamError, msg)
		return
	}
	item, err := service.ApprovalItemUpdate(middleware.CurrentUserID(c), id, &req)
	if err != nil {
		response.Fail(c, response.CodeServerError, err.Error())
		return
	}
	response.OK(c, item)
}

// ApprovalItemDelete DELETE /api/v1/approval/item/:id
func ApprovalItemDelete(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	if err := service.ApprovalItemDelete(id); err != nil {
		response.Fail(c, response.CodeServerError, err.Error())
		return
	}
	response.OKMsg(c, "删除成功")
}
