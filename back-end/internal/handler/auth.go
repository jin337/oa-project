package handler

import (
	"errors"
	"fmt"
	"net/http"

	"back-end/internal/middleware"
	"back-end/internal/model"
	"back-end/internal/pkg/response"
	"back-end/internal/pkg/vtrans"
	"back-end/internal/service"

	"github.com/gin-gonic/gin"
)

// Login POST /{APIPrefix}/auth/login
func Login(c *gin.Context) {
	var req model.LoginReq
	if msg := vtrans.Validate(c, &req); msg != "" {
		response.Fail(c, response.CodeParamError, msg)
		return
	}
	// 登录失败锁定（按用户名）：锁定期内不校验密码，直接返回剩余时间（HTTP 423）
	if err := middleware.CheckLoginLock(req.Username); err != nil {
		var locked *middleware.LoginLockedErr
		if errors.As(err, &locked) {
			response.FailWithHTTP(c, http.StatusLocked, response.CodeForbidden,
				fmt.Sprintf("登录失败次数过多，账号已临时锁定，请 %.0f 分钟后再试", locked.Remaining.Minutes()))
			return
		}
		response.Fail(c, response.CodeServerError, err.Error())
		return
	}
	res, err := service.Login(&req)
	if err != nil {
		// 仅凭据/账号类失败计数（停用等已表明账号状态，不叠加锁定语义）
		if err.Error() == "用户名或密码错误" && middleware.RecordLoginFail(req.Username) {
			response.FailWithHTTP(c, http.StatusLocked, response.CodeForbidden, "登录失败次数过多，账号已临时锁定，请稍后再试")
			return
		}
		response.Fail(c, response.CodeServerError, err.Error())
		return
	}
	middleware.ClearLoginFail(req.Username) // 成功即清零并立即解锁
	middleware.InvalidatePermCache()        // 登录时全量失效：多实例 TTL 未同步场景下，保证本次会话鉴权用最新权限
	response.OK(c, res)
}

// Logout POST /{APIPrefix}/auth/logout 登出：吊销当前用户全部已签发 token
// 需在 JWTAuth 保护下调用（凭当前身份定位用户）；调用后旧 token 立即 401。
func Logout(c *gin.Context) {
	if err := service.Logout(middleware.CurrentUserID(c)); err != nil {
		response.Fail(c, response.CodeServerError, "登出失败")
		return
	}
	response.OKMsg(c, "已登出")
}

// Profile GET /{APIPrefix}/auth/profile 当前用户资料+菜单树+权限标识
func Profile(c *gin.Context) {
	res, err := service.Profile(middleware.CurrentUserID(c))
	if err != nil {
		response.Fail(c, response.CodeNotFound, err.Error())
		return
	}
	response.OK(c, res)
}

// UserMenus GET /{APIPrefix}/auth/menus 当前用户菜单树
func UserMenus(c *gin.Context) {
	menus, perms := service.UserMenus(middleware.CurrentUserID(c))
	response.OK(c, gin.H{"menus": menus, "perms": perms})
}
