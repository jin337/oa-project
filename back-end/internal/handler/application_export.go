package handler

import (
	"net/http"
	"net/url"
	"strings"

	"back-end/internal/middleware"
	"back-end/internal/pkg/response"
	"back-end/internal/service"

	"github.com/gin-gonic/gin"
)

// ApplicationDataExport GET /{APIPrefix}/application/export?code=xxx&<搜索字段>
// 动态数据列表（state=list）全量导出 xlsx：只接收页面编码与搜索筛选（与列表页 /by-code 同口径），
// 后端自行取数、拼主表全字段列、渲染 xlsx 后以二进制流回写。
// 文件名来自后端（应用名，超限追加范围提示），URL 编码避免中文乱码。
// 成功回二进制；取数/渲染失败回 JSON 业务错误（前端按响应 content-type 区分）。
func ApplicationDataExport(c *gin.Context) {
	code := strings.TrimSpace(c.Query("code"))
	if code == "" {
		response.Fail(c, response.CodeParamError, "页面编码不能为空")
		return
	}
	// 动态搜索字段：query 中除保留参数 code 外全部作为筛选（field_key → 值），与 by-code 列表一致
	filters := make(map[string]string)
	for k, vs := range c.Request.URL.Query() {
		if k == "code" || len(vs) == 0 || vs[0] == "" {
			continue
		}
		filters[k] = vs[0]
	}

	buf, filename, err := service.ApplicationDataExport(code, filters, middleware.CurrentUserID(c))
	if err != nil {
		response.Fail(c, response.CodeServerError, err.Error())
		return
	}
	c.Header("Content-Disposition",
		"attachment; filename=export.xlsx; filename*=UTF-8''"+url.PathEscape(filename))
	c.Data(http.StatusOK, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buf)
}
