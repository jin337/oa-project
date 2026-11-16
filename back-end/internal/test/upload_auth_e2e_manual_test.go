//go:build manual

package test

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"back-end/internal/config"
	"back-end/internal/database"
	"back-end/internal/middleware"
	"back-end/internal/model"
	"back-end/internal/router"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
)

func TestManualUploadAuthE2E(t *testing.T) {
	oldEnv := os.Getenv("APP_ENV")
	_ = os.Setenv("APP_ENV", "test")
	defer os.Setenv("APP_ENV", oldEnv)

	chdirBackendRoot(t)
	uploadRoot, _ := filepath.Abs("uploads")

	cfg := config.Load()
	if _, err := database.Setup(cfg.MySQL); err != nil {
		t.Fatalf("连接测试库失败: %v", err)
	}
	middleware.InitSecurity()
	gin.SetMode(gin.TestMode)

	// 测试库不保证有 admin，创建一次性账号完成登录/鉴权闭环，结束后删除。
	username := fmt.Sprintf("upload_e2e_%d", time.Now().UnixNano())
	password := "upload-e2e-password"
	hash, _ := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	u := model.User{Username: username, Password: string(hash), Status: 1}
	if err := database.DB.Create(&u).Error; err != nil {
		t.Fatalf("创建测试用户失败: %v", err)
	}
	t.Cleanup(func() {
		_ = database.DB.Unscoped().Where("user_id = ?", u.ID).Delete(&model.OperationLog{}).Error
		_ = database.DB.Unscoped().Delete(&u).Error
	})

	srv := httptest.NewServer(router.Setup())
	defer srv.Close()

	jar, _ := cookiejar.New(nil)
	client := &http.Client{Jar: jar}

	loginBody := []byte(fmt.Sprintf(`{"username":%q,"password":%q}`, username, password))
	resp, err := client.Post(srv.URL+"/v1/api/auth/login", "application/json", bytes.NewReader(loginBody))
	if err != nil {
		t.Fatalf("登录请求失败: %v", err)
	}
	defer resp.Body.Close()
	var login struct {
		Code int `json:"code"`
		Data struct {
			Token string `json:"token"`
		} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&login); err != nil || login.Code != 0 || login.Data.Token == "" {
		t.Fatalf("登录失败: code=%d err=%v", login.Code, err)
	}

	appCode := "__upload_auth_e2e__"
	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)
	part, err := mw.CreateFormFile("file", "e2e.txt")
	if err != nil {
		t.Fatalf("构造上传表单失败: %v", err)
	}
	_, _ = part.Write([]byte("hello-attachment"))
	_ = mw.Close()

	req, _ := http.NewRequest(http.MethodPost, srv.URL+"/v1/api/upload?app_code="+appCode, &buf)
	req.Header.Set("Content-Type", mw.FormDataContentType())
	req.Header.Set("Authorization", "Bearer "+login.Data.Token)
	respUpload, err := client.Do(req)
	if err != nil {
		t.Fatalf("上传请求失败: %v", err)
	}
	defer respUpload.Body.Close()
	var upload struct {
		Code int `json:"code"`
		Data struct {
			URL string `json:"url"`
		} `json:"data"`
	}
	if err := json.NewDecoder(respUpload.Body).Decode(&upload); err != nil || upload.Code != 0 || upload.Data.URL == "" {
		t.Fatalf("上传失败: code=%d err=%v", upload.Code, err)
	}
	fileURL := upload.Data.URL
	t.Cleanup(func() {
		_ = os.RemoveAll(filepath.Join(uploadRoot, appCode))
	})

	// 带登录 Cookie（浏览器 <img>/<a> 的实际请求形态）应成功。
	respFile, err := client.Get(srv.URL + fileURL)
	if err != nil {
		t.Fatalf("带 Cookie 读取附件失败: %v", err)
	}
	defer respFile.Body.Close()
	if respFile.StatusCode != http.StatusOK {
		t.Fatalf("带 Cookie 读取附件状态码 = %d, 期望 200", respFile.StatusCode)
	}
	body, _ := io.ReadAll(respFile.Body)
	if string(body) != "hello-attachment" {
		t.Fatalf("附件内容 = %q", string(body))
	}

	// 不带 Cookie / Bearer 的直接链接必须 401。
	respAnon, err := http.Get(srv.URL + fileURL)
	if err != nil {
		t.Fatalf("匿名读取附件失败: %v", err)
	}
	defer respAnon.Body.Close()
	if respAnon.StatusCode != http.StatusUnauthorized {
		t.Fatalf("匿名读取附件状态码 = %d, 期望 401", respAnon.StatusCode)
	}

	// 登出清理 Cookie 后，原链接也应 401。
	logoutReq, _ := http.NewRequest(http.MethodPost, srv.URL+"/v1/api/auth/logout", nil)
	logoutReq.Header.Set("Authorization", "Bearer "+login.Data.Token)
	respLogout, err := client.Do(logoutReq)
	if err != nil {
		t.Fatalf("登出请求失败: %v", err)
	}
	_ = respLogout.Body.Close()
	if respLogout.StatusCode != http.StatusOK {
		t.Fatalf("登出状态码 = %d", respLogout.StatusCode)
	}
	respAfter, err := client.Get(srv.URL + fileURL)
	if err != nil {
		t.Fatalf("登出后读取附件失败: %v", err)
	}
	defer respAfter.Body.Close()
	if respAfter.StatusCode != http.StatusUnauthorized {
		t.Fatalf("登出后读取附件状态码 = %d, 期望 401", respAfter.StatusCode)
	}

	fmt.Printf("e2e ok: login cookie -> upload %s -> authenticated 200 -> anonymous 401 -> logout 401\n", fileURL)
}
