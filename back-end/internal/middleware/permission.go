package middleware

import (
	"back-end/internal/database"
	"back-end/internal/model"
	"back-end/internal/pkg/response"

	"github.com/gin-gonic/gin"
)

// RequirePermission 权限校验中间件：校验当前登录用户是否拥有指定权限标识（perm）。
// 可传入多个权限标识，命中任意一个即放行（如新建流程的设计链路需 add 或 edit 任一）。
// 权限来源：用户启用角色（status=1）关联的启用菜单（status=1，不区分目录/页面/按钮类型）的 perm 标识，
// 与前端登录时下发的 perms 集合（service.UserMenus）口径完全一致——
// 页面级菜单（如 application:tables）的 perm 同样参与接口鉴权。
// 超级管理员（角色 is_super）默认拥有全部权限，直接放行。
func RequirePermission(perms ...string) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := CurrentUserID(c)
		if userID == 0 {
			response.FailWithHTTP(c, 401, response.CodeUnauthorized, "未登录或登录已过期")
			c.Abort()
			return
		}
		if hasAnyPermission(userID, perms) {
			c.Next()
			return
		}
		response.FailWithHTTP(c, 403, response.CodeForbidden, "无权限执行该操作")
		c.Abort()
	}
}

// HasPermission 查询用户是否拥有指定按钮权限标识，供服务层/处理器做非强制拦截的展示控制。
func HasPermission(userID uint, perm string) bool {
	return hasAnyPermission(userID, []string{perm})
}

// hasAnyPermission 查询用户启用角色所关联的菜单权限标识（与前端 perms 集合口径一致），命中列表中任意一个返回 true
func hasAnyPermission(userID uint, perms []string) bool {
	if len(perms) == 0 {
		return true
	}
	var user model.User
	if err := database.DB.Preload("Roles", "status = ?", 1).
		Preload("Roles.Menus", "status = 1").
		First(&user, userID).Error; err != nil {
		return false
	}
	for _, role := range user.Roles {
		if role.IsSuper {
			return true // 超级管理员全量放行
		}
		for _, menu := range role.Menus {
			for _, perm := range perms {
				if menu.Perm == perm {
					return true
				}
			}
		}
	}
	return false
}
