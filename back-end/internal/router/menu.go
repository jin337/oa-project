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
		menus.GET("", handler.MenuTree)       // 菜单树
		menus.POST("", handler.MenuCreate)    // 新建菜单
		menus.GET("/:id", handler.MenuDetail) // 菜单详情
		menus.PUT("/:id", handler.MenuUpdate) // 修改菜单
		menus.DELETE("/:id", handler.MenuDelete) // 删除菜单
	}
}
