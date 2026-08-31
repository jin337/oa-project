package handler

import (
	"strconv"

	"back-end/internal/pkg/response"

	"github.com/gin-gonic/gin"
)

// parseID 解析路径中的 :id 参数，非法时直接拦截
func parseID(c *gin.Context) (uint, bool) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil || id == 0 {
		response.Fail(c, response.CodeParamError, "ID 参数非法")
		return 0, false
	}
	return uint(id), true
}
