package test

import (
	"testing"

	"back-end/internal/config"
	"back-end/internal/middleware"
)

// TestTokenVersionRoundTrip 凭证版本随 JWT 签发/解析完整往返：
// token 吊销机制依赖「签发时写入的版本号」与「库内当前版本」比对，
// 版本号丢失（未写入载荷或解析读不到）会让所有 token 永远等于 0 版本而无法吊销。
// 纯内存测试，不触碰数据库。
func TestTokenVersionRoundTrip(t *testing.T) {
	old := config.Cfg
	defer func() { config.Cfg = old }()
	config.Cfg = &config.Config{}
	config.Cfg.Server.JWT = config.JWTConfig{
		Secret: "unit-test-secret",
		Expire: 1,
		Issuer: "back-end",
	}

	cases := []struct {
		name     string
		userID   uint
		username string
		version  uint
	}{
		{"零版本", 1, "admin", 0},
		{"非零版本", 7, "test001", 3},
		{"大版本号", 42, "u", 1 << 20},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			token, err := middleware.GenerateToken(tc.userID, tc.username, tc.version)
			if err != nil {
				t.Fatalf("GenerateToken 失败: %v", err)
			}
			claims, err := middleware.ParseToken(token)
			if err != nil {
				t.Fatalf("ParseToken 失败: %v", err)
			}
			if claims.UserID != tc.userID || claims.Username != tc.username {
				t.Fatalf("身份载荷不符: %+v", claims)
			}
			if claims.TokenVersion != tc.version {
				t.Fatalf("凭证版本往返丢失: 签发 %d，解析得 %d", tc.version, claims.TokenVersion)
			}
		})
	}
}

// TestParseTokenRejectsForeignSignature 异密钥 token 必须解析失败（吊销判断的前提：签名可信）。
func TestParseTokenRejectsForeignSignature(t *testing.T) {
	old := config.Cfg
	defer func() { config.Cfg = old }()
	config.Cfg = &config.Config{}
	config.Cfg.Server.JWT = config.JWTConfig{Secret: "secret-A", Expire: 1, Issuer: "back-end"}
	token, err := middleware.GenerateToken(1, "admin", 2)
	if err != nil {
		t.Fatal(err)
	}

	config.Cfg.Server.JWT.Secret = "secret-B"
	if _, err := middleware.ParseToken(token); err == nil {
		t.Fatal("异密钥签发的 token 应解析失败")
	}
}
