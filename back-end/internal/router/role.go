package router

import (
	"back-end/internal/handler"
	"back-end/internal/middleware"

	"github.com/gin-gonic/gin"
)

// registerRoleRoutes 角色管理路由
func registerRoleRoutes(v1 *gin.RouterGroup) {
	roles := v1.Group("/roles")
	roles.Use(middleware.JWTAuth())
	{
		roles.GET("", handler.RoleList)
		roles.GET("/users", handler.RoleUsers)
		roles.POST("", handler.RoleCreate)
		roles.GET("/:id", handler.RoleDetail)
		roles.PUT("/:id", handler.RoleUpdate)
		roles.DELETE("/:id", handler.RoleDelete)
		roles.PUT("/:id/menus", handler.RoleAssignMenus)
		roles.PUT("/:id/depts", handler.RoleAssignDepts)
	}
}
