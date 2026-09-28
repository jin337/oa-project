package router

import (
	"back-end/internal/handler"
	"back-end/internal/middleware"

	"github.com/gin-gonic/gin"
)

// registerAuthRoutes 认证相关路由（登录无需鉴权）
func registerAuthRoutes(v1 *gin.RouterGroup) {
	auth := v1.Group("/auth")
	{
		auth.POST("/login", handler.Login)
		auth.Use(middleware.JWTAuth())
		auth.GET("/profile", handler.Profile) // 当前用户 + 菜单树 + 权限标识
		auth.GET("/menus", handler.UserMenus) // 当前用户菜单树
	}
}
