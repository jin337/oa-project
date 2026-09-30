package router

import (
	"back-end/internal/handler"
	"back-end/internal/middleware"

	"github.com/gin-gonic/gin"
)

// registerMenuRoutes 导航/菜单管理路由
func registerMenuRoutes(api *gin.RouterGroup) {
	menus := api.Group("/menus")
	menus.Use(middleware.JWTAuth())
	{
		menus.GET("", handler.MenuTree)       // 菜单树
		menus.POST("", middleware.RequirePermission("system:menu:edit"), handler.MenuCreate)    // 新建菜单
		menus.GET("/:id", handler.MenuDetail) // 菜单详情
		menus.PUT("/:id", middleware.RequirePermission("system:menu:edit"), handler.MenuUpdate) // 修改菜单
		menus.DELETE("/:id", middleware.RequirePermission("system:menu:edit"), handler.MenuDelete) // 删除菜单
	}
}
