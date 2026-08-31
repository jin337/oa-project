package middleware

import (
	"runtime/debug"
	"time"

	"back-end/internal/pkg/logger"
	"back-end/internal/pkg/response"

	"github.com/gin-gonic/gin"
)

// Recovery 全局异常拦截：捕获 panic，屏蔽系统原生报错，只返回规范提示
func Recovery() gin.HandlerFunc {
	return func(c *gin.Context) {
		defer func() {
			if r := recover(); r != nil {
				logger.Errorf("panic: %v\n%s", r, debug.Stack())
				c.AbortWithStatusJSON(200, response.Response{
					Code:      response.CodeServerError,
					Msg:       "服务器内部错误",
					Timestamp: time.Now().Unix(),
				})
			}
		}()
		c.Next()
	}
}
