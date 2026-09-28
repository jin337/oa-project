package router

import (
	"back-end/internal/handler"
	"back-end/internal/middleware"

	"github.com/gin-gonic/gin"
)

// registerUserRoutes 用户管理路由
func registerUserRoutes(v1 *gin.RouterGroup) {
	users := v1.Group("/users")
	users.Use(middleware.JWTAuth())
	{
		users.GET("", handler.UserList)
		users.PUT("/switch-dept", handler.UserSwitchDept)
		users.POST("", handler.UserCreate)
		users.GET("/:id", handler.UserDetail)
		users.PUT("/:id", handler.UserUpdate)
		users.DELETE("/:id", handler.UserDelete)
		users.PUT("/:id/roles", handler.UserAssignRoles)
		users.PUT("/:id/password", handler.UserUpdatePassword)
		users.PUT("/:id/reset-password", handler.UserResetPassword)
		users.GET("/:id/profile", handler.UserProfileGet)
		users.PUT("/:id/profile", handler.UserProfileUpdate)
	}
}
