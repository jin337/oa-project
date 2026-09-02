package handler

import (
	"back-end/internal/model"
	"back-end/internal/pkg/response"
	"back-end/internal/pkg/vtrans"
	"back-end/internal/service"

	"github.com/gin-gonic/gin"
)

// parseFieldID 解析路径中的 :fieldId 参数（物理表列名），为空时拦截
func parseFieldID(c *gin.Context) (string, bool) {
	name := c.Param("fieldId")
	if name == "" {
		response.Fail(c, response.CodeParamError, "字段 ID 参数非法")
		return "", false
	}
	return name, true
}

// TableFieldList GET /api/v1/application/:id/fields 物理业务表列分页列表
func TableFieldList(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	var req model.TableFieldListReq
	if msg := vtrans.Validate(c, &req); msg != "" {
		response.Fail(c, response.CodeParamError, msg)
		return
	}
	list, total, err := service.TableFieldList(id, req.TableName, &req)
	if err != nil {
		response.Fail(c, response.CodeServerError, err.Error())
		return
	}
	response.OK(c, response.PageResult{List: list, Total: total, Page: req.Page, Size: req.Size})
}

// TableFieldCreate POST /api/v1/application/:id/fields 物理业务表新增列
func TableFieldCreate(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	var req model.TableFieldCreateReq
	if msg := vtrans.Validate(c, &req); msg != "" {
		response.Fail(c, response.CodeParamError, msg)
		return
	}
	col, err := service.TableFieldCreate(id, req.TableName, &req)
	if err != nil {
		response.Fail(c, response.CodeServerError, err.Error())
		return
	}
	response.OK(c, col)
}

// TableFieldUpdate PUT /api/v1/application/:id/fields/:fieldId 修改物理业务表列
func TableFieldUpdate(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	fieldName, ok := parseFieldID(c)
	if !ok {
		return
	}
	var req model.TableFieldUpdateReq
	if msg := vtrans.Validate(c, &req); msg != "" {
		response.Fail(c, response.CodeParamError, msg)
		return
	}
	col, err := service.TableFieldUpdate(id, req.TableName, fieldName, &req)
	if err != nil {
		response.Fail(c, response.CodeServerError, err.Error())
		return
	}
	response.OK(c, col)
}

// TableFieldDelete DELETE /api/v1/application/:id/fields/:fieldId 删除物理业务表列
// 前端以 query 参数传递 table_name（vtrans.Validate 对 DELETE 走 JSON 绑定，此处手动绑定 query）
func TableFieldDelete(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	fieldName, ok := parseFieldID(c)
	if !ok {
		return
	}
	var req model.TableFieldDeleteReq
	if err := c.ShouldBindQuery(&req); err != nil {
		response.Fail(c, response.CodeParamError, "请求参数格式错误")
		return
	}
	if req.TableName == "" {
		response.Fail(c, response.CodeParamError, "表名不能为空")
		return
	}
	if err := service.TableFieldDelete(id, req.TableName, fieldName); err != nil {
		response.Fail(c, response.CodeServerError, err.Error())
		return
	}
	response.OKMsg(c, "删除成功")
}
