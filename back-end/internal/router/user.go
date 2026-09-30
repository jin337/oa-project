package router

import (
	"back-end/internal/handler"
	"back-end/internal/middleware"

	"github.com/gin-gonic/gin"
)

// registerUserRoutes 用户管理路由
func registerUserRoutes(api *gin.RouterGroup) {
	users := api.Group("/users")
	users.Use(middleware.JWTAuth())
	{
		users.GET("", handler.UserList)                    // 用户列表（数据范围过滤）
		users.PUT("/switch-dept", handler.UserSwitchDept)  // 切换部门（仅本人）
		users.POST("", middleware.RequirePermission("system:user:edit"), handler.UserCreate) // 新建用户
		users.GET("/:id", handler.UserDetail)              // 用户详情
		users.PUT("/:id", middleware.RequirePermission("system:user:edit"), handler.UserUpdate) // 修改用户
		users.DELETE("/:id", middleware.RequirePermission("system:user:edit"), handler.UserDelete) // 删除用户
		users.PUT("/:id/roles", middleware.RequirePermission("system:user:edit"), handler.UserAssignRoles) // 分配角色
		users.PUT("/:id/password", handler.UserUpdatePassword) // 修改密码（仅限本人）
		users.PUT("/:id/reset-password", middleware.RequirePermission("system:user:edit"), handler.UserResetPassword) // 重置密码
		users.GET("/:id/profile", handler.UserProfileGet)  // 查询用户资料
		users.PUT("/:id/profile", handler.UserProfileUpdate) // 修改用户资料（仅本人或管理员）
	}
}
