package handler

import (
	"back-end/internal/middleware"
	"back-end/internal/model"
	"back-end/internal/pkg/response"
	"back-end/internal/pkg/vtrans"
	"back-end/internal/service"

	"github.com/gin-gonic/gin"
)

// ExamineGroupList GET /{APIPrefix}/examine-groups
func ExamineGroupList(c *gin.Context) {
	var req model.ExamineGroupListReq
	if msg := vtrans.Validate(c, &req); msg != "" {
		response.Fail(c, response.CodeParamError, msg)
		return
	}
	list, total, err := service.ExamineGroupList(&req)
	if err != nil {
		response.Fail(c, response.CodeServerError, "查询审核人员组失败")
		return
	}
	response.OK(c, response.PageResult{List: list, Total: total, Page: req.Page, Size: req.Size})
}

// ExamineGroupDetail GET /{APIPrefix}/examine-groups/:id
func ExamineGroupDetail(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	group, err := service.ExamineGroupDetail(id)
	if err != nil {
		response.Fail(c, response.CodeNotFound, err.Error())
		return
	}
	response.OK(c, group)
}

// ExamineGroupCreate POST /{APIPrefix}/examine-groups
func ExamineGroupCreate(c *gin.Context) {
	var req model.ExamineGroupCreateReq
	if msg := vtrans.Validate(c, &req); msg != "" {
		response.Fail(c, response.CodeParamError, msg)
		return
	}
	group, err := service.ExamineGroupCreate(middleware.CurrentUserID(c), &req)
	if err != nil {
		response.Fail(c, response.CodeServerError, err.Error())
		return
	}
	response.OK(c, group)
}

// ExamineGroupUpdate PUT /{APIPrefix}/examine-groups/:id
func ExamineGroupUpdate(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	var req model.ExamineGroupUpdateReq
	if msg := vtrans.Validate(c, &req); msg != "" {
		response.Fail(c, response.CodeParamError, msg)
		return
	}
	group, err := service.ExamineGroupUpdate(middleware.CurrentUserID(c), id, &req)
	if err != nil {
		response.Fail(c, response.CodeServerError, err.Error())
		return
	}
	response.OK(c, group)
}

// ExamineGroupDelete DELETE /{APIPrefix}/examine-groups/:id
func ExamineGroupDelete(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	if err := service.ExamineGroupDelete(id); err != nil {
		response.Fail(c, response.CodeServerError, err.Error())
		return
	}
	response.OKMsg(c, "删除成功")
}
