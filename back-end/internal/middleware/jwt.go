package middleware

import (
	"net/http"
	"strings"
	"time"

	"back-end/internal/config"
	"back-end/internal/pkg/response"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

const (
	CtxUserID   = "userID"
	CtxUsername = "username"

	// AuthCookieName 附件下载专用登录 Cookie。
	// 浏览器加载 <img>/点击 <a> 无法附带 Authorization，故仅 /uploads 路由接受该 Cookie；
	// 普通 API 仍只认 Bearer，避免 Cookie 鉴权扩散到写接口后产生 CSRF 面。
	AuthCookieName = "oa_file_token"
)

// Claims JWT 载荷
type Claims struct {
	UserID       uint   `json:"user_id"`
	Username     string `json:"username"`
	TokenVersion uint   `json:"tv"` // 签发时的凭证版本；登出/改密后库内版本 +1，旧 token 比对不等即失效
	jwt.RegisteredClaims
}

// GenerateToken 生成登录 token，密钥与有效期取自配置。
// tokenVersion 来自用户表当前凭证版本：登录签发时携带，使该 token 在用户登出或改密后被吊销。
func GenerateToken(userID uint, username string, tokenVersion uint) (string, error) {
	cfg := config.Cfg.Server.JWT
	claims := Claims{
		UserID:       userID,
		Username:     username,
		TokenVersion: tokenVersion,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Duration(cfg.Expire) * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			Issuer:    cfg.Issuer,
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(cfg.Secret))
}

// JWTAuth 登录鉴权中间件：解析 Bearer token，非法直接拦截；
// 校验签名后再比对凭证版本（登出/改密后旧 token 立即失效，返回 401）。
// 兼容 SSE 等无法自定义 header 的场景，仍可从 query 读取 token。
func JWTAuth() gin.HandlerFunc {
	return jwtAuth(false)
}

// JWTAuthWithCookie 附件下载专用鉴权：在 Bearer/query 之外额外接受 HttpOnly 登录 Cookie。
// 仅用于 GET /uploads/* 这类只读文件路由，不得挂到业务 API 上。
func JWTAuthWithCookie() gin.HandlerFunc {
	return jwtAuth(true)
}

func jwtAuth(allowCookie bool) gin.HandlerFunc {
	return func(c *gin.Context) {
		tokenStr, fromHeader := requestToken(c, allowCookie)
		if tokenStr == "" {
			response.FailWithHTTP(c, http.StatusUnauthorized, response.CodeUnauthorized, "未登录或登录已过期")
			c.Abort()
			return
		}
		claims, err := ParseToken(tokenStr)
		if err != nil {
			response.FailWithHTTP(c, http.StatusUnauthorized, response.CodeUnauthorized, "登录凭证无效")
			c.Abort()
			return
		}
		// 凭证版本比对：库内版本随权限缓存读取（命中零查库）；
		// 用户不存在（已删除）或版本不一致（已登出/改密吊销）均视为凭证失效
		if cur, exists := TokenVersionOf(claims.UserID); !exists || cur != claims.TokenVersion {
			response.FailWithHTTP(c, http.StatusUnauthorized, response.CodeUnauthorized, "登录状态已失效，请重新登录")
			c.Abort()
			return
		}

		// 浏览器已存有 localStorage token、但还没有附件 Cookie 时，借任意一次带 Bearer 的 API
		// 请求补发 Cookie，使旧会话无需重新登录即可正常加载附件。
		if fromHeader {
			if existing, err := c.Cookie(AuthCookieName); err != nil || existing != tokenStr {
				SetAuthCookie(c, tokenStr)
			}
		}

		c.Set(CtxUserID, claims.UserID)
		c.Set(CtxUsername, claims.Username)
		c.Next()
	}
}

// requestToken 按“Authorization > query token > Cookie”的顺序取登录凭证。
// allowCookie=false 时不读取 Cookie，保证普通 API 的鉴权方式不变。
func requestToken(c *gin.Context, allowCookie bool) (token string, fromHeader bool) {
	auth := strings.TrimSpace(c.GetHeader("Authorization"))
	if len(auth) > 7 && strings.EqualFold(auth[:7], "Bearer ") {
		return strings.TrimSpace(auth[7:]), true
	}
	if q := strings.TrimSpace(c.Query("token")); q != "" {
		return q, false
	}
	if allowCookie {
		if cookie, err := c.Cookie(AuthCookieName); err == nil && strings.TrimSpace(cookie) != "" {
			return strings.TrimSpace(cookie), false
		}
	}
	return "", false
}

// SetAuthCookie 写入附件下载专用 HttpOnly Cookie。
// SameSite=Lax：同源 <img> 与用户点击链接会带上，跨站图片请求不会带上；
// Secure 按 TLS 或反向代理的 X-Forwarded-Proto 推断，HTTP 开发环境不设置以免 Cookie 被浏览器丢弃。
func SetAuthCookie(c *gin.Context, token string) {
	cfg := config.Cfg.Server.JWT
	maxAge := cfg.Expire * 3600
	if maxAge <= 0 {
		maxAge = 24 * 3600
	}
	c.SetSameSite(http.SameSiteLaxMode)
	c.SetCookie(AuthCookieName, token, maxAge, "/", "", isSecureRequest(c), true)
}

// ClearAuthCookie 清理附件下载 Cookie（登出时调用）。
func ClearAuthCookie(c *gin.Context) {
	c.SetSameSite(http.SameSiteLaxMode)
	c.SetCookie(AuthCookieName, "", -1, "/", "", isSecureRequest(c), true)
}

func isSecureRequest(c *gin.Context) bool {
	if c.Request.TLS != nil {
		return true
	}
	proto := strings.TrimSpace(strings.Split(c.GetHeader("X-Forwarded-Proto"), ",")[0])
	return strings.EqualFold(proto, "https")
}

// ParseToken 解析并校验 token
func ParseToken(tokenStr string) (*Claims, error) {
	token, err := jwt.ParseWithClaims(tokenStr, &Claims{}, func(t *jwt.Token) (any, error) {
		return []byte(config.Cfg.Server.JWT.Secret), nil
	}, jwt.WithValidMethods([]string{"HS256"})) // 锁定签名算法，防算法混淆攻击
	if err != nil {
		return nil, err
	}
	if claims, ok := token.Claims.(*Claims); ok && token.Valid {
		return claims, nil
	}
	return nil, jwt.ErrTokenSignatureInvalid
}

// CurrentUserID 从上下文取当前登录用户 ID
func CurrentUserID(c *gin.Context) uint {
	if v, ok := c.Get(CtxUserID); ok {
		if id, ok := v.(uint); ok {
			return id
		}
	}
	return 0
}
