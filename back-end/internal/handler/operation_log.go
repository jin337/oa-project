package handler

import (
	"back-end/internal/model"
	"back-end/internal/pkg/response"
	"back-end/internal/pkg/vtrans"
	"back-end/internal/service"

	"github.com/gin-gonic/gin"
)

// OperationLogList GET /{APIPrefix}/operation-logs 操作审计日志（分页+筛选）
func OperationLogList(c *gin.Context) {
	var req model.OperationLogListReq
	if msg := vtrans.Validate(c, &req); msg != "" {
		response.Fail(c, response.CodeParamError, msg)
		return
	}
	list, total, err := service.OperationLogList(&req)
	if err != nil {
		response.Fail(c, response.CodeServerError, "查询操作日志失败")
		return
	}
	response.OK(c, response.PageResult{List: list, Total: total, Page: req.Page, Size: req.Size})
}
