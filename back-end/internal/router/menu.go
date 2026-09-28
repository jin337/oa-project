package router

import (
	"back-end/internal/handler"
	"back-end/internal/middleware"

	"github.com/gin-gonic/gin"
)

// registerMenuRoutes 导航/菜单管理路由
func registerMenuRoutes(v1 *gin.RouterGroup) {
	menus := v1.Group("/menus")
	menus.Use(middleware.JWTAuth())
	{
		menus.GET("", handler.MenuTree)
		menus.POST("", handler.MenuCreate)
		menus.GET("/:id", handler.MenuDetail)
		menus.PUT("/:id", handler.MenuUpdate)
		menus.DELETE("/:id", handler.MenuDelete)
	}
}
