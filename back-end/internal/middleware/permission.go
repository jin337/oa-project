package middleware

import (
	"back-end/internal/database"
	"back-end/internal/model"
	"back-end/internal/pkg/response"

	"github.com/gin-gonic/gin"
)

// RequirePermission 权限校验中间件：校验当前登录用户是否拥有指定按钮权限标识（perm）。
// 权限来源：用户启用角色（status=1）关联的按钮菜单（type=3, status=1）的 perm 标识；
// 超级管理员（角色 code=admin）默认拥有全部权限，直接放行。
func RequirePermission(perm string) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := CurrentUserID(c)
		if userID == 0 {
			response.FailWithHTTP(c, 401, response.CodeUnauthorized, "未登录或登录已过期")
			c.Abort()
			return
		}
		if hasPermission(userID, perm) {
			c.Next()
			return
		}
		response.FailWithHTTP(c, 403, response.CodeForbidden, "无权限执行该操作")
		c.Abort()
	}
}

// HasPermission 查询用户是否拥有指定按钮权限标识，供服务层/处理器做非强制拦截的展示控制。
func HasPermission(userID uint, perm string) bool {
	return hasPermission(userID, perm)
}

// hasPermission 查询用户启用角色所关联的按钮权限标识，命中指定 perm 返回 true
func hasPermission(userID uint, perm string) bool {
	var user model.User
	if err := database.DB.Preload("Roles", "status = ?", 1).
		Preload("Roles.Menus", "type = ? AND status = ?", model.MenuTypeButton, 1).
		First(&user, userID).Error; err != nil {
		return false
	}
	for _, role := range user.Roles {
		if role.IsSuper {
			return true // 超级管理员全量放行
		}
		for _, menu := range role.Menus {
			if menu.Perm == perm {
				return true
			}
		}
	}
	return false
}
