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

// ApprovalCategoryItemList GET /api/v1/approval/item
func ApprovalCategoryItemList(c *gin.Context) {
	var req model.ApprovalCategoryItemListReq
	if msg := vtrans.Validate(c, &req); msg != "" {
		response.Fail(c, response.CodeParamError, msg)
		return
	}
	list, total, err := service.ApprovalCategoryItemList(&req)
	if err != nil {
		response.Fail(c, response.CodeServerError, "查询申请项失败")
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
		response.Fail(c, response.CodeServerError, err.Error())
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
		response.Fail(c, response.CodeServerError, err.Error())
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
		response.Fail(c, response.CodeServerError, err.Error())
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

// ==================== 流程实例 ====================

// ApprovalInstanceCreate POST /api/v1/approval/instance
func ApprovalInstanceCreate(c *gin.Context) {
	var req model.ApprovalInstanceCreateReq
	if msg := vtrans.Validate(c, &req); msg != "" {
		response.Fail(c, response.CodeParamError, msg)
		return
	}
	instance, err := service.ApprovalInstanceCreate(middleware.CurrentUserID(c), &req)
	if err != nil {
		response.Fail(c, response.CodeServerError, err.Error())
		return
	}
	response.OK(c, instance)
}

// ApprovalInstanceSaveDraft POST /api/v1/approval/instance/draft
func ApprovalInstanceSaveDraft(c *gin.Context) {
	var req model.ApprovalInstanceCreateReq
	if msg := vtrans.Validate(c, &req); msg != "" {
		response.Fail(c, response.CodeParamError, msg)
		return
	}
	instance, err := service.ApprovalInstanceSaveDraft(middleware.CurrentUserID(c), &req)
	if err != nil {
		response.Fail(c, response.CodeServerError, err.Error())
		return
	}
	response.OK(c, instance)
}

// ApprovalInstanceSubmitDraft PUT /api/v1/approval/instance/:id/submit
func ApprovalInstanceSubmitDraft(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	var req model.ApprovalInstanceSubmitDraftReq
	if msg := vtrans.Validate(c, &req); msg != "" {
		response.Fail(c, response.CodeParamError, msg)
		return
	}
	instance, err := service.ApprovalInstanceSubmitDraft(middleware.CurrentUserID(c), id, &req)
	if err != nil {
		response.Fail(c, response.CodeServerError, err.Error())
		return
	}
	response.OK(c, instance)
}

// ApprovalInstanceDetail GET /api/v1/approval/instance/:id
func ApprovalInstanceDetail(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	result, err := service.ApprovalInstanceDetail(middleware.CurrentUserID(c), id)
	if err != nil {
		response.Fail(c, response.CodeServerError, err.Error())
		return
	}
	response.OK(c, result)
}

// ApprovalInstanceWithdraw PUT /api/v1/approval/instance/:id/withdraw
func ApprovalInstanceWithdraw(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	if err := service.ApprovalInstanceWithdraw(middleware.CurrentUserID(c), id); err != nil {
		response.Fail(c, response.CodeServerError, err.Error())
		return
	}
	response.OKMsg(c, "撤回成功")
}

// ApprovalInstanceDelete DELETE /api/v1/approval/instance/:id
func ApprovalInstanceDelete(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	if err := service.ApprovalInstanceDelete(middleware.CurrentUserID(c), id); err != nil {
		response.Fail(c, response.CodeServerError, err.Error())
		return
	}
	response.OKMsg(c, "删除成功")
}

// parseTaskID 解析路径中的 :taskId 参数
func parseTaskID(c *gin.Context) (uint, bool) {
	id, err := strconv.ParseUint(c.Param("taskId"), 10, 64)
	if err != nil || id == 0 {
		response.Fail(c, response.CodeParamError, "taskId 参数非法")
		return 0, false
	}
	return uint(id), true
}

// ApprovalInstanceTaskApprove PUT /api/v1/approval/instance/:id/task/:taskId/approve
func ApprovalInstanceTaskApprove(c *gin.Context) {
	instanceID, ok := parseID(c)
	if !ok {
		return
	}
	taskID, ok := parseTaskID(c)
	if !ok {
		return
	}
	var req model.ApprovalInstanceTaskApproveReq
	if msg := vtrans.Validate(c, &req); msg != "" {
		response.Fail(c, response.CodeParamError, msg)
		return
	}
	if err := service.ApprovalTaskApprove(middleware.CurrentUserID(c), instanceID, taskID, &req); err != nil {
		response.Fail(c, response.CodeServerError, err.Error())
		return
	}
	response.OKMsg(c, "操作成功")
}

// ApprovalInstanceTaskDelegate PUT /api/v1/approval/instance/:id/task/:taskId/delegate
func ApprovalInstanceTaskDelegate(c *gin.Context) {
	instanceID, ok := parseID(c)
	if !ok {
		return
	}
	taskID, ok := parseTaskID(c)
	if !ok {
		return
	}
	var req model.ApprovalInstanceTaskDelegateReq
	if msg := vtrans.Validate(c, &req); msg != "" {
		response.Fail(c, response.CodeParamError, msg)
		return
	}
	if err := service.ApprovalTaskDelegate(middleware.CurrentUserID(c), instanceID, taskID, &req); err != nil {
		response.Fail(c, response.CodeServerError, err.Error())
		return
	}
	response.OKMsg(c, "转交成功")
}
