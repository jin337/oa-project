package middleware

import (
	"net/http"
	"strings"

	"back-end/internal/config"

	"github.com/gin-gonic/gin"
)

// Cors 跨域中间件：可开关、可自定义放行规则（来源/方法/请求头均取自配置）。
// allow_origins 为空表示不放行任何跨域来源；只有显式配置 "*" 才允许全部来源。
func Cors() gin.HandlerFunc {
	return func(c *gin.Context) {
		cfg := config.Cfg.Server.Cors
		if !cfg.Enable {
			c.Next()
			return
		}

		origin := c.GetHeader("Origin")
		if origin == "" {
			c.Next()
			return
		}

		allow := ""
		wildcard := false
		for _, o := range cfg.AllowOrigins {
			if o == "*" {
				wildcard = true
				break
			}
			if o == origin {
				allow = origin
				break
			}
		}
		// 未配置来源时不再默认放行 *；显式配置 * 才允许全部来源。
		if wildcard {
			allow = "*"
		} else if allow == "" {
			c.Next()
			return
		}

		c.Header("Access-Control-Allow-Origin", allow)
		if !wildcard {
			c.Header("Vary", "Origin")
		}
		c.Header("Access-Control-Allow-Methods", strings.Join(cfg.AllowMethods, ", "))
		c.Header("Access-Control-Allow-Headers", strings.Join(cfg.AllowHeaders, ", "))
		// 文件下载类接口（数据导出等）需要前端读取文件名，必须显式暴露该响应头
		c.Header("Access-Control-Expose-Headers", "Content-Disposition")
		c.Header("Access-Control-Max-Age", "86400")

		if c.Request.Method == http.MethodOptions {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}
		c.Next()
	}
}
