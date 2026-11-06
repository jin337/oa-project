package middleware

import (
	"time"

	"back-end/internal/config"
	"back-end/internal/pkg/response"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

const (
	CtxUserID   = "userID"
	CtxUsername = "username"
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
func JWTAuth() gin.HandlerFunc {
	return func(c *gin.Context) {
		tokenStr := c.GetHeader("Authorization")
		if len(tokenStr) > 7 && tokenStr[:7] == "Bearer " {
			tokenStr = tokenStr[7:]
		}
		// 兼容 SSE 等无法自定义 header 的场景，从 query 读取 token
		if tokenStr == "" {
			tokenStr = c.Query("token")
		}
		if tokenStr == "" {
			response.FailWithHTTP(c, 401, response.CodeUnauthorized, "未登录或登录已过期")
			c.Abort()
			return
		}
		claims, err := ParseToken(tokenStr)
		if err != nil {
			response.FailWithHTTP(c, 401, response.CodeUnauthorized, "登录凭证无效")
			c.Abort()
			return
		}
		// 凭证版本比对：库内版本随权限缓存读取（命中零查库）；
		// 用户不存在（已删除）或版本不一致（已登出/改密吊销）均视为凭证失效
		if cur, exists := TokenVersionOf(claims.UserID); !exists || cur != claims.TokenVersion {
			response.FailWithHTTP(c, 401, response.CodeUnauthorized, "登录状态已失效，请重新登录")
			c.Abort()
			return
		}
		c.Set(CtxUserID, claims.UserID)
		c.Set(CtxUsername, claims.Username)
		c.Next()
	}
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
