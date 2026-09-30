package router

import (
	"back-end/internal/handler"
	"back-end/internal/middleware"

	"github.com/gin-gonic/gin"
)

// registerRoleRoutes 角色管理路由
func registerRoleRoutes(api *gin.RouterGroup) {
	roles := api.Group("/roles")
	roles.Use(middleware.JWTAuth())
	{
		roles.GET("", handler.RoleList)           // 角色列表
		roles.GET("/users", handler.RoleUsers)    // 角色下用户列表
		roles.POST("", middleware.RequirePermission("system:role:edit"), handler.RoleCreate)        // 新建角色
		roles.GET("/:id", handler.RoleDetail)     // 角色详情
		roles.PUT("/:id", middleware.RequirePermission("system:role:edit"), handler.RoleUpdate)     // 修改角色
		roles.DELETE("/:id", middleware.RequirePermission("system:role:edit"), handler.RoleDelete)  // 删除角色
		roles.PUT("/:id/menus", middleware.RequirePermission("system:role:assignMenu"), handler.RoleAssignMenus) // 分配菜单权限
		roles.PUT("/:id/depts", middleware.RequirePermission("system:role:edit"), handler.RoleAssignDepts) // 分配数据范围部门
	}
}
