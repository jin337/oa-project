package middleware

import (
	"context"

	"back-end/internal/config"
	"back-end/internal/pkg/response"

	"github.com/gin-gonic/gin"
)

// ssePaths 长连接/流式接口白名单：这类接口按设计长期持有连接，
// 不能被请求超时上下文取消，否则连接会被定时切断（表现为 SSE 每隔超时时长断开重连）。
var ssePaths = map[string]struct{}{
	"/api/v1/notifications/stream": {},
}

// Timeout 接口请求统一超时控制：超时时间取自配置 server.request_timeout。
// 通过上下文传播超时，依赖超时上下文的下游操作（数据库等）会自动取消；
// 若处理链结束时尚未写响应且已超时，则统一返回超时提示。
func Timeout() gin.HandlerFunc {
	return func(c *gin.Context) {
		// 长连接（SSE）直接放行，不注入超时上下文
		if _, ok := ssePaths[c.FullPath()]; ok {
			c.Next()
			return
		}

		ctx, cancel := context.WithTimeout(c.Request.Context(), config.Cfg.Server.RequestTimeoutDuration())
		defer cancel()
		c.Request = c.Request.WithContext(ctx)

		c.Next()

		if !c.Writer.Written() && ctx.Err() == context.DeadlineExceeded {
			response.Fail(c, response.CodeServerError, "请求处理超时")
		}
	}
}
