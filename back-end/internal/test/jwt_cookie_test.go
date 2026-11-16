package test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"back-end/internal/config"
	"back-end/internal/middleware"

	"github.com/gin-gonic/gin"
)

// TestRequestTokenCookieOnlyForFileAuth 普通 API 不读取 Cookie，只有附件下载路由显式开启。
func TestRequestTokenCookieOnlyForFileAuth(t *testing.T) {
	gin.SetMode(gin.TestMode)
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	req := httptest.NewRequest(http.MethodGet, "/uploads/common/x.png", nil)
	req.AddCookie(&http.Cookie{Name: middleware.AuthCookieName, Value: "cookie-token"})
	c.Request = req

	if token, _ := middleware.RequestToken(c, false); token != "" {
		t.Fatalf("普通 API 不应接受 Cookie，实际 token=%q", token)
	}
	token, fromHeader := middleware.RequestToken(c, true)
	if token != "cookie-token" || fromHeader {
		t.Fatalf("附件路由应读取 Cookie，实际 token=%q fromHeader=%v", token, fromHeader)
	}
}

// TestSetAuthCookieHttpOnly 登录签发的附件 Cookie 必须 HttpOnly，且同站 Lax。
func TestSetAuthCookieHttpOnly(t *testing.T) {
	gin.SetMode(gin.TestMode)
	old := config.Cfg
	config.Cfg = &config.Config{Server: config.ServerConfig{JWT: config.JWTConfig{Expire: 24}}}
	defer func() { config.Cfg = old }()

	rec := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(rec)
	c.Request = httptest.NewRequest(http.MethodGet, "/v1/api/auth/login", nil)

	middleware.SetAuthCookie(c, "test-token")
	resp := rec.Result()
	defer resp.Body.Close()

	cookies := resp.Cookies()
	if len(cookies) != 1 {
		t.Fatalf("Set-Cookie 数量 = %d, 期望 1", len(cookies))
	}
	ck := cookies[0]
	if ck.Name != middleware.AuthCookieName || ck.Value != "test-token" {
		t.Fatalf("Cookie = %s=%s, 期望 %s=test-token", ck.Name, ck.Value, middleware.AuthCookieName)
	}
	if !ck.HttpOnly {
		t.Fatal("附件 Cookie 必须 HttpOnly")
	}
	if ck.SameSite != http.SameSiteLaxMode {
		t.Fatalf("SameSite = %v, 期望 Lax", ck.SameSite)
	}
	if ck.MaxAge != 24*3600 {
		t.Fatalf("MaxAge = %d, 期望 %d", ck.MaxAge, 24*3600)
	}
}
