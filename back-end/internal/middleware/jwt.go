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
	UserID   uint   `json:"user_id"`
	Username string `json:"username"`
	jwt.RegisteredClaims
}

// GenerateToken 生成登录 token，密钥与有效期取自配置
func GenerateToken(userID uint, username string) (string, error) {
	cfg := config.Cfg.Server.JWT
	claims := Claims{
		UserID:   userID,
		Username: username,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Duration(cfg.Expire) * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			Issuer:    cfg.Issuer,
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(cfg.Secret))
}

// JWTAuth 登录鉴权中间件：解析 Bearer token，非法直接拦截
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
		c.Set(CtxUserID, claims.UserID)
		c.Set(CtxUsername, claims.Username)
		c.Next()
	}
}

// ParseToken 解析并校验 token
func ParseToken(tokenStr string) (*Claims, error) {
	token, err := jwt.ParseWithClaims(tokenStr, &Claims{}, func(t *jwt.Token) (any, error) {
		return []byte(config.Cfg.Server.JWT.Secret), nil
	})
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
