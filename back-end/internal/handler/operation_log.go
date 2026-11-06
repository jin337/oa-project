package handler

import (
	"net/http"
	"net/url"
	"time"

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

// OperationLogExport GET /{APIPrefix}/operation-logs/export 按筛选条件导出审计日志 xlsx。
// 成功时直接回写二进制流（application/vnd.openxmlformats-...），
// 失败时回 JSON 业务错误（前端按响应 content-type 区分两种情况）。
func OperationLogExport(c *gin.Context) {
	var req model.OperationLogListReq
	if msg := vtrans.Validate(c, &req); msg != "" {
		response.Fail(c, response.CodeParamError, msg)
		return
	}
	buf, err := service.OperationLogExport(&req)
	if err != nil {
		response.Fail(c, response.CodeServerError, "导出操作日志失败: "+err.Error())
		return
	}
	// 文件名带导出时间，URL 编码避免中文乱码（RFC 5987）；同时给 ASCII 回退名兼容旧客户端
	filename := "操作日志_" + time.Now().Format("20060102150405") + ".xlsx"
	c.Header("Content-Disposition", "attachment; filename=operation_logs.xlsx; filename*=UTF-8''"+url.PathEscape(filename))
	c.Data(http.StatusOK, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buf)
}
