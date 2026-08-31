package middleware

import (
	"net/http"
	"strings"

	"back-end/internal/config"

	"github.com/gin-gonic/gin"
)

// Cors 跨域中间件：可开关、可自定义放行规则（来源/方法/请求头均取自配置）
func Cors() gin.HandlerFunc {
	return func(c *gin.Context) {
		cfg := config.Cfg.Server.Cors
		if !cfg.Enable {
			c.Next()
			return
		}

		origin := c.GetHeader("Origin")
		allow := "*"
		if len(cfg.AllowOrigins) > 0 && cfg.AllowOrigins[0] != "*" {
			allow = ""
			for _, o := range cfg.AllowOrigins {
				if o == origin {
					allow = origin
					break
				}
			}
			if allow == "" {
				c.Next()
				return
			}
		}

		c.Header("Access-Control-Allow-Origin", allow)
		c.Header("Access-Control-Allow-Methods", strings.Join(cfg.AllowMethods, ", "))
		c.Header("Access-Control-Allow-Headers", strings.Join(cfg.AllowHeaders, ", "))
		c.Header("Access-Control-Max-Age", "86400")

		if c.Request.Method == http.MethodOptions {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}
		c.Next()
	}
}
