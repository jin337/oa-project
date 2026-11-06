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
		users.GET("", handler.UserList)                                                                                          // 用户列表（数据范围过滤）
		users.PUT("/switch-dept", handler.UserSwitchDept)                                                                        // 切换部门（仅本人）
		users.POST("", middleware.RequirePermission("system:user:add"), handler.UserCreate)                                      // 新建用户
		users.GET("/:id", handler.UserDetail)                                                                                    // 用户详情
		users.PUT("/:id", middleware.RequirePermission("profile:edit", "system:user:edit"), handler.UserUpdate)                  // 修改用户
		users.DELETE("/:id", middleware.RequirePermission("system:user:delete"), handler.UserDelete)                             // 删除用户
		users.PUT("/:id/roles", middleware.RequirePermission("system:user:edit"), handler.UserAssignRoles)                       // 分配角色
		users.PUT("/:id/password", middleware.RequirePermission("profile:psw", "system:user:reset"), handler.UserUpdatePassword) // 修改密码（仅限本人）
		users.PUT("/:id/reset-password", middleware.RequirePermission("system:user:reset"), handler.UserResetPassword)           // 重置密码
		// 解除登录锁定：优先用细粒度码 system:user:unlock（需在菜单管理建按钮并分配）；
		// 同时认 system:user:reset（解锁与重置密码同属登录凭据处置域），保证功能上线即刻可用
		users.PUT("/:id/unlock", middleware.RequirePermission("system:user:unlock", "system:user:reset"), handler.UserUnlockLogin)
		users.GET("/:id/profile", handler.UserProfileGet)                                                                      // 查询用户资料
		users.PUT("/:id/profile", middleware.RequirePermission("profile:edit", "system:user:edit"), handler.UserProfileUpdate) // 修改用户资料
	}
}
