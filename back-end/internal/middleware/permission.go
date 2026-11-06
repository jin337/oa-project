package middleware

import (
	"back-end/internal/database"
	"back-end/internal/model"
	"back-end/internal/pkg/response"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// ==================== 权限集合进程内缓存 ====================
//
// 背景：hasAnyPermission 每次受保护请求都要 Preload 角色+菜单（2~3 次 join 查询），
// 权限数据变更频率极低（角色/菜单/用户角色调整）而读取频率为每请求一次，适合缓存。
// 策略：按用户缓存「超管标记 + 权限码集合」，TTL 兜底过期 + 变更点显式失效。
// 单实例部署下失效即时生效；多实例横向扩容时依赖 TTL（5 分钟）收敛，如需强一致可升级 Redis pub/sub。

const permCacheTTL = 5 * time.Minute

type permCacheEntry struct {
	isSuper      bool
	perms        map[string]bool
	tokenVersion uint // 库内当前凭证版本（随条目缓存，鉴权比对免额外查库）
	userExists   bool // 查询是否命中用户（不存在/查询失败：false，供 JWT 拒绝）
	expiresAt    time.Time
}

var (
	permCacheMu    sync.RWMutex
	permCacheStore = map[uint]*permCacheEntry{}
)

// RevokeUserTokens 吊销该用户全部已签发 token：库内版本号 +1 并清除其缓存条目，
// 携带旧版本的 token 下一次请求即 401。登出、修改密码、管理员重置密码时调用。
// UpdateColumn 不经钩子、不触碰 updated_at（凭证失效非业务修改，不应污染更新时间线）。
func RevokeUserTokens(userID uint) error {
	if err := database.DB.Model(&model.User{}).
		UpdateColumn("token_version", gorm.Expr("token_version + 1")).
		Where("id = ?", userID).Error; err != nil {
		return err
	}
	permCacheMu.Lock()
	delete(permCacheStore, userID)
	permCacheMu.Unlock()
	return nil
}

// TokenVersionOf 读取用户当前凭证版本（复用权限缓存，命中时零查库）。
// userExists=false 表示用户不存在或查询失败，调用方应视为凭证无效。
func TokenVersionOf(userID uint) (version uint, userExists bool) {
	e := loadPermEntry(userID)
	return e.tokenVersion, e.userExists
}

// InvalidatePermCache 清空全部用户权限缓存（角色/菜单/用户角色关系任何变更后调用）。
// 全清而非逐用户失效：角色变更影响面难以精确枚举（多对多），全清代价仅一次缓存重建，简单可靠。
func InvalidatePermCache() {
	permCacheMu.Lock()
	permCacheStore = map[uint]*permCacheEntry{}
	permCacheMu.Unlock()
}

// loadPermEntry 读取（或重建）用户权限缓存条目：超管短路 + 权限码集合 + 凭证版本
func loadPermEntry(userID uint) *permCacheEntry {
	permCacheMu.RLock()
	entry := permCacheStore[userID]
	permCacheMu.RUnlock()
	if entry != nil && entry.expiresAt.After(time.Now()) {
		return entry
	}
	var user model.User
	if err := database.DB.Preload("Roles", "status = ?", 1).
		Preload("Roles.Menus", "status = 1").
		First(&user, userID).Error; err != nil {
		// 查询失败（含用户不存在）：返回空权限且不缓存，下次请求重新查
		return &permCacheEntry{perms: map[string]bool{}, expiresAt: time.Now().Add(time.Minute)}
	}
	entry = &permCacheEntry{
		perms:        map[string]bool{},
		tokenVersion: user.TokenVersion,
		userExists:   true,
		expiresAt:    time.Now().Add(permCacheTTL),
	}
	for _, role := range user.Roles {
		if role.IsSuper {
			entry.isSuper = true
		}
		for _, m := range role.Menus {
			if m.Perm != "" {
				entry.perms[m.Perm] = true
			}
		}
	}
	permCacheMu.Lock()
	permCacheStore[userID] = entry
	permCacheMu.Unlock()
	return entry
}

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
	entry := loadPermEntry(userID)
	if entry.isSuper {
		return true // 超级管理员全量放行
	}
	for _, perm := range perms {
		if entry.perms[perm] {
			return true
		}
	}
	return false
}
