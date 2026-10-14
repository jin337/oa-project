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

// respondServiceError 服务层错误统一响应（业务错误码 500，前端仅展示 msg）
func respondServiceError(c *gin.Context, err error) {
	response.Fail(c, response.CodeServerError, err.Error())
}

// ApprovalInstanceCreate POST /{APIPrefix}/approval/instance 发起审批
func ApprovalInstanceCreate(c *gin.Context) {
	var req model.ApprovalInstanceCreateReq
	if msg := vtrans.Validate(c, &req); msg != "" {
		response.Fail(c, response.CodeParamError, msg)
		return
	}
	instance, err := service.ApprovalInstanceCreate(middleware.CurrentUserID(c), &req)
	if err != nil {
		respondServiceError(c, err)
		return
	}
	response.OK(c, instance)
}

// ApprovalInstanceSaveDraft POST /{APIPrefix}/approval/instance/draft 保存审批草稿
func ApprovalInstanceSaveDraft(c *gin.Context) {
	var req model.ApprovalInstanceCreateReq
	if msg := vtrans.Validate(c, &req); msg != "" {
		response.Fail(c, response.CodeParamError, msg)
		return
	}
	instance, err := service.ApprovalInstanceSaveDraft(middleware.CurrentUserID(c), &req)
	if err != nil {
		respondServiceError(c, err)
		return
	}
	response.OK(c, instance)
}

// ApprovalInstanceSubmitDraft PUT /{APIPrefix}/approval/instance/:id/submit 从草稿提交发起审批
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
		respondServiceError(c, err)
		return
	}
	response.OK(c, instance)
}

// ApprovalInstanceDetail GET /{APIPrefix}/approval/instance/:id 实例详情
func ApprovalInstanceDetail(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	result, err := service.ApprovalInstanceDetail(middleware.CurrentUserID(c), id)
	if err != nil {
		respondServiceError(c, err)
		return
	}
	response.OK(c, result)
}

// ApprovalInstanceVoid PUT /{APIPrefix}/approval/instance/:id/void 作废（仅无审批痕迹时）
func ApprovalInstanceVoid(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	if err := service.ApprovalInstanceVoid(middleware.CurrentUserID(c), id); err != nil {
		respondServiceError(c, err)
		return
	}
	response.OKMsg(c, "作废成功")
}

// ApprovalInstanceWithdraw PUT /{APIPrefix}/approval/instance/:id/withdraw 撤回
func ApprovalInstanceWithdraw(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	if err := service.ApprovalInstanceWithdraw(middleware.CurrentUserID(c), id); err != nil {
		respondServiceError(c, err)
		return
	}
	response.OKMsg(c, "撤回成功")
}

// ApprovalInstanceResubmit PUT /{APIPrefix}/approval/instance/:id/resubmit 已驳回实例重新提交
func ApprovalInstanceResubmit(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	var req model.ApprovalInstanceResubmitReq
	if msg := vtrans.Validate(c, &req); msg != "" {
		response.Fail(c, response.CodeParamError, msg)
		return
	}
	if _, err := service.ApprovalInstanceResubmit(middleware.CurrentUserID(c), id, &req); err != nil {
		respondServiceError(c, err)
		return
	}
	response.OKMsg(c, "已重新提交")
}

// ApprovalInstanceDelete DELETE /{APIPrefix}/approval/instance/:id 删除已终结实例
func ApprovalInstanceDelete(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	if err := service.ApprovalInstanceDelete(middleware.CurrentUserID(c), id); err != nil {
		respondServiceError(c, err)
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

// ApprovalInstanceTaskApprove PUT /{APIPrefix}/approval/instance/:id/task/:taskId/approve 审批操作（通过/拒绝/驳回）
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
		respondServiceError(c, err)
		return
	}
	response.OKMsg(c, "操作成功")
}

// ApprovalInstanceTaskAddSign PUT /{APIPrefix}/approval/instance/:id/task/:taskId/add-sign 加签（前加签/后加签）
func ApprovalInstanceTaskAddSign(c *gin.Context) {
	instanceID, ok := parseID(c)
	if !ok {
		return
	}
	taskID, ok := parseTaskID(c)
	if !ok {
		return
	}
	var req model.ApprovalInstanceTaskAddSignReq
	if msg := vtrans.Validate(c, &req); msg != "" {
		response.Fail(c, response.CodeParamError, msg)
		return
	}
	if err := service.ApprovalTaskAddSign(middleware.CurrentUserID(c), instanceID, taskID, &req); err != nil {
		respondServiceError(c, err)
		return
	}
	response.OKMsg(c, "加签成功")
}

// ApprovalInstanceTaskDelegate PUT /{APIPrefix}/approval/instance/:id/task/:taskId/delegate 转交
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
		respondServiceError(c, err)
		return
	}
	response.OKMsg(c, "转交成功")
}
