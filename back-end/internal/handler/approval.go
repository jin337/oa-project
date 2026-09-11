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

// ==================== 审批列表（跨应用聚合） ====================

// approvalListHandler 审批列表通用处理：按 scope 调 service 聚合查询
func approvalListHandler(c *gin.Context, scope string) {
	var req model.ApprovalListReq
	if msg := vtrans.Validate(c, &req); msg != "" {
		response.Fail(c, response.CodeParamError, msg)
		return
	}
	list, total, err := service.ApprovalList(middleware.CurrentUserID(c), scope, &req)
	if err != nil {
		response.Fail(c, response.CodeServerError, err.Error())
		return
	}
	response.OK(c, response.PageResult{List: list, Total: total, Page: req.Page, Size: req.Size})
}

// ApprovalInitiated GET /api/v1/approval/initiated 我的发起（排除草稿）
func ApprovalInitiated(c *gin.Context) {
	approvalListHandler(c, "initiated")
}

// ApprovalTodo GET /api/v1/approval/todo 我的待办（待审核/审核中）
func ApprovalTodo(c *gin.Context) {
	approvalListHandler(c, "todo")
}

// ApprovalApproved GET /api/v1/approval/approved 我审批的（已通过/不通过/已驳回/已作废）
func ApprovalApproved(c *gin.Context) {
	approvalListHandler(c, "approved")
}

// ApprovalCc GET /api/v1/approval/cc 抄送我的（暂无抄送人字段，返回空）
func ApprovalCc(c *gin.Context) {
	approvalListHandler(c, "cc")
}

// ApprovalDrafts GET /api/v1/approval/drafts 草稿箱（草稿）
func ApprovalDrafts(c *gin.Context) {
	approvalListHandler(c, "drafts")
}
