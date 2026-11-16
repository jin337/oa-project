package test

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"back-end/internal/config"
	"back-end/internal/handler"

	"github.com/gin-gonic/gin"
)

// TestUploadFileServesWithinUploadRoot 受保护下载 handler 只接受规范的文件名；
// 校验通过后按扩展名决定内联预览或强制下载，并禁止目录入口/路径穿越。
func TestUploadFileServesWithinUploadRoot(t *testing.T) {
	chdirBackendRoot(t)
	gin.SetMode(gin.TestMode)
	appCode := "__upload_auth_test__"
	dir := filepath.Join(config.UploadDir, appCode)
	if err := os.MkdirAll(dir, 0755); err != nil {
		t.Fatalf("创建测试目录失败: %v", err)
	}
	t.Cleanup(func() { _ = os.RemoveAll(dir) })

	filename := "20260101000000_deadbeef.png"
	if err := os.WriteFile(filepath.Join(dir, filename), []byte("png-bytes"), 0644); err != nil {
		t.Fatalf("写入测试文件失败: %v", err)
	}

	rec := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(rec)
	c.Request = httptest.NewRequest(http.MethodGet, "/uploads/"+appCode+"/"+filename, nil)
	c.Params = gin.Params{{Key: "appCode", Value: appCode}, {Key: "filename", Value: filename}}

	handler.UploadFile(c)

	if rec.Code != http.StatusOK {
		t.Fatalf("合法附件状态码 = %d, 期望 200", rec.Code)
	}
	if got := rec.Body.String(); got != "png-bytes" {
		t.Fatalf("附件内容 = %q, 期望 png-bytes", got)
	}
	if got := rec.Header().Get("Content-Disposition"); !strings.HasPrefix(got, "inline;") {
		t.Fatalf("图片 Content-Disposition = %q, 期望 inline", got)
	}
	if got := rec.Header().Get("Cache-Control"); got != "private, no-store" {
		t.Fatalf("Cache-Control = %q, 期望 private, no-store", got)
	}
}

// TestUploadFilePathTraversalRejected 即使路由参数被手工构造，也不能跳出 uploads 根目录。
func TestUploadFilePathTraversalRejected(t *testing.T) {
	chdirBackendRoot(t)
	gin.SetMode(gin.TestMode)
	cases := []gin.Params{
		{{Key: "appCode", Value: ".."}, {Key: "filename", Value: "x.png"}},
		{{Key: "appCode", Value: "common"}, {Key: "filename", Value: "../x.png"}},
		{{Key: "appCode", Value: "common"}, {Key: "filename", Value: "x"}},
	}
	for _, params := range cases {
		rec := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(rec)
		c.Request = httptest.NewRequest(http.MethodGet, "/uploads/x", nil)
		c.Params = params
		handler.UploadFile(c)
		if rec.Code != http.StatusNotFound {
			t.Fatalf("非法路径 %v 状态码 = %d, 期望 404", params, rec.Code)
		}
	}
}
