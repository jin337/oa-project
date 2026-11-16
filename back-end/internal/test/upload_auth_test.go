package test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"back-end/internal/config"
	"back-end/internal/middleware"
	"back-end/internal/router"

	"github.com/gin-gonic/gin"
)

// TestUploadsRequireAuth /uploads 不再是公开静态目录：
// 未登录访问必须被 JWT 中间件拦下，而不是直接返回磁盘文件或目录列表。
func TestUploadsRequireAuth(t *testing.T) {
	chdirBackendRoot(t)
	gin.SetMode(gin.TestMode)
	config.Load()
	middleware.InitSecurity()

	srv := httptest.NewServer(router.Setup())
	defer srv.Close()

	resp, err := http.Get(srv.URL + "/uploads/common/not-exist.png")
	if err != nil {
		t.Fatalf("请求 /uploads 失败: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("未登录访问 /uploads 状态码 = %d, 期望 %d", resp.StatusCode, http.StatusUnauthorized)
	}

	var body struct {
		Code int `json:"code"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatalf("解析 /uploads 401 响应失败: %v", err)
	}
	if body.Code != 401 {
		t.Fatalf("未登录响应业务码 = %d, 期望 401", body.Code)
	}
}

// TestUploadsDirectoryListingDisabled 旧静态路由会把 /uploads 当成目录入口；
// 改为精确文件路由后，目录入口本身应 404，不能再暴露文件清单。
func TestUploadsDirectoryListingDisabled(t *testing.T) {
	chdirBackendRoot(t)
	gin.SetMode(gin.TestMode)
	config.Load()
	middleware.InitSecurity()

	srv := httptest.NewServer(router.Setup())
	defer srv.Close()

	resp, err := http.Get(srv.URL + "/uploads")
	if err != nil {
		t.Fatalf("请求 /uploads 目录失败: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("/uploads 目录状态码 = %d, 期望 %d", resp.StatusCode, http.StatusNotFound)
	}
}
