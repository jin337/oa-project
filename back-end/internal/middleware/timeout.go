package middleware

import (
	"context"

	"back-end/internal/config"
	"back-end/internal/pkg/response"

	"github.com/gin-gonic/gin"
)

// Timeout 接口请求统一超时控制：超时时间取自配置 server.request_timeout。
// 通过上下文传播超时，依赖超时上下文的下游操作（数据库等）会自动取消；
// 若处理链结束时尚未写响应且已超时，则统一返回超时提示。
func Timeout() gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx, cancel := context.WithTimeout(c.Request.Context(), config.Cfg.Server.RequestTimeoutDuration())
		defer cancel()
		c.Request = c.Request.WithContext(ctx)

		c.Next()

		if !c.Writer.Written() && ctx.Err() == context.DeadlineExceeded {
			response.Fail(c, response.CodeServerError, "请求处理超时")
		}
	}
}
