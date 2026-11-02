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

// ApprovalCategoryList GET /{APIPrefix}/approval/category
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

// ApprovalCategoryCreate POST /{APIPrefix}/approval/category
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

// ApprovalCategoryUpdate PUT /{APIPrefix}/approval/category/:id
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

// ApprovalCategoryDelete DELETE /{APIPrefix}/approval/category/:id
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

// ApprovalCategoryItemList GET /{APIPrefix}/approval/category/item
func ApprovalCategoryItemList(c *gin.Context) {
	var req model.ApprovalCategoryItemListReq
	if msg := vtrans.Validate(c, &req); msg != "" {
		response.Fail(c, response.CodeParamError, msg)
		return
	}
	curUserID := middleware.CurrentUserID(c)
	manage := req.Manage && middleware.HasPermission(curUserID, "approval:edit")
	list, total, err := service.ApprovalCategoryItemList(curUserID, &req, manage)
	if err != nil {
		respondServiceError(c, err)
		return
	}
	response.OK(c, response.PageResult{List: list, Total: total, Page: req.Page, Size: req.Size})
}

// ApprovalCategoryItemCreate POST /{APIPrefix}/approval/item
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

// ApprovalCategoryItemUpdate PUT /{APIPrefix}/approval/item/:id
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

// ApprovalCategoryItemDelete DELETE /{APIPrefix}/approval/item/:id
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

// ApprovalList GET /{APIPrefix}/approval/list
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

// ==================== 工作台（独立接口） ====================

// dashboardTimeRangeReq 工作台时间筛选 query 参数
type dashboardTimeRangeReq struct {
	TimeRange string `json:"time_range" form:"time_range" validate:"omitempty,oneof=today week month year all" label:"时间范围"`
}

// ApprovalDashboardSummary GET /{APIPrefix}/approval/dashboard/summary 工作台「全部事项」四类计数
// query: time_range=today|7d|month|year|all（可选，空等价 all）
func ApprovalDashboardSummary(c *gin.Context) {
	var req dashboardTimeRangeReq
	if msg := vtrans.Validate(c, &req); msg != "" {
		response.Fail(c, response.CodeParamError, msg)
		return
	}
	sum, err := service.ApprovalDashboardSummary(middleware.CurrentUserID(c), req.TimeRange)
	if err != nil {
		response.Fail(c, response.CodeServerError, err.Error())
		return
	}
	response.OK(c, sum)
}

// ApprovalDashboardFlows GET /{APIPrefix}/approval/dashboard/flows 工作台「流程监控」与我相关的所有申请（全量）
// query: time_range=today|7d|month|year|all（可选，空等价 all）
func ApprovalDashboardFlows(c *gin.Context) {
	var req dashboardTimeRangeReq
	if msg := vtrans.Validate(c, &req); msg != "" {
		response.Fail(c, response.CodeParamError, msg)
		return
	}
	list, err := service.ApprovalDashboardFlows(middleware.CurrentUserID(c), req.TimeRange)
	if err != nil {
		response.Fail(c, response.CodeServerError, err.Error())
		return
	}
	response.OK(c, map[string]interface{}{"list": list})
}
