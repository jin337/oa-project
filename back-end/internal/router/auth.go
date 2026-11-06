package router

import (
	"back-end/internal/handler"
	"back-end/internal/middleware"

	"github.com/gin-gonic/gin"
)

// registerAuthRoutes 认证相关路由（登录无需鉴权）
func registerAuthRoutes(api *gin.RouterGroup) {
	auth := api.Group("/auth")
	{
		auth.POST("/login", handler.Login) // 登录（无需鉴权）
		auth.Use(middleware.JWTAuth())
		auth.POST("/logout", handler.Logout)  // 登出（吊销当前用户全部 token）
		auth.GET("/profile", handler.Profile) // 当前账号信息
		auth.GET("/menus", handler.UserMenus) // 当前账号菜单树
	}
}
