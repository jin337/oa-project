package handler

// ============================================================
// 审批分类、申请项、审批列表
// ============================================================
// 流程实例相关的 handler 已拆分至 approval_instance.go。
// 所有 handler 保持薄封装：参数校验 -> 调用 service -> 统一响应。
// ============================================================

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
		respondServiceError(c, err)
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
		respondServiceError(c, err)
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
		respondServiceError(c, err)
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
		respondServiceError(c, err)
		return
	}
	response.OKMsg(c, "删除成功")
}

// ==================== 申请项 ====================

// ApprovalCategoryItemList GET /api/v1/approval/category/item
func ApprovalCategoryItemList(c *gin.Context) {
	var req model.ApprovalCategoryItemListReq
	if msg := vtrans.Validate(c, &req); msg != "" {
		response.Fail(c, response.CodeParamError, msg)
		return
	}
	list, total, err := service.ApprovalCategoryItemList(&req)
	if err != nil {
		respondServiceError(c, err)
		return
	}
	response.OK(c, response.PageResult{List: list, Total: total, Page: req.Page, Size: req.Size})
}

// ApprovalCategoryItemCreate POST /api/v1/approval/item
func ApprovalCategoryItemCreate(c *gin.Context) {
	var req model.ApprovalCategoryItemCreateReq
	if msg := vtrans.Validate(c, &req); msg != "" {
		response.Fail(c, response.CodeParamError, msg)
		return
	}
	item, err := service.ApprovalCategoryItemCreate(middleware.CurrentUserID(c), &req)
	if err != nil {
		respondServiceError(c, err)
		return
	}
	response.OK(c, item)
}

// ApprovalCategoryItemUpdate PUT /api/v1/approval/item/:id
func ApprovalCategoryItemUpdate(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	var req model.ApprovalCategoryItemUpdateReq
	if msg := vtrans.Validate(c, &req); msg != "" {
		response.Fail(c, response.CodeParamError, msg)
		return
	}
	item, err := service.ApprovalCategoryItemUpdate(middleware.CurrentUserID(c), id, &req)
	if err != nil {
		respondServiceError(c, err)
		return
	}
	response.OK(c, item)
}

// ApprovalCategoryItemDelete DELETE /api/v1/approval/item/:id
func ApprovalCategoryItemDelete(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	if err := service.ApprovalCategoryItemDelete(id); err != nil {
		respondServiceError(c, err)
		return
	}
	response.OKMsg(c, "删除成功")
}

// ==================== 审批列表（跨应用聚合） ====================

// ApprovalList GET /api/v1/approval/list
func ApprovalList(c *gin.Context) {
	var req model.ApprovalListReq
	if msg := vtrans.Validate(c, &req); msg != "" {
		response.Fail(c, response.CodeParamError, msg)
		return
	}
	list, total, err := service.ApprovalList(middleware.CurrentUserID(c), &req)
	if err != nil {
		response.Fail(c, response.CodeServerError, err.Error())
		return
	}
	response.OK(c, response.PageResult{List: list, Total: total, Page: req.Page, Size: req.Size})
}
