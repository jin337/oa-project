package test

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"back-end/internal/config"
	"back-end/internal/middleware"

	"github.com/gin-gonic/gin"
)

// 限流与登录锁定的纯内存逻辑测试（不依赖数据库/配置）。
// loginPolicy 在 config.Cfg == nil 时回退默认 5 次 / 15 分钟窗口 / 15 分钟锁定，
// 测试直接使用默认策略。私有符号经 middleware 桥接层（exportbridge.go）跨包访问。

func TestTokenBucketBurstThenBlock(t *testing.T) {
	rl := middleware.NewRateLimiter(1, 3) // 每秒 1 个令牌，桶容量 3
	now := time.Now()
	for i := 0; i < 3; i++ {
		if !middleware.RateLimiterAllow(rl, "ip1", now) {
			t.Fatalf("第 %d 次请求应放行（桶初始满 3）", i+1)
		}
	}
	if middleware.RateLimiterAllow(rl, "ip1", now) {
		t.Fatal("耗尽 burst 后应立即限流")
	}
}

func TestTokenBucketRefill(t *testing.T) {
	rl := middleware.NewRateLimiter(2, 2) // 每秒回填 2 个
	now := time.Now()
	if !middleware.RateLimiterAllow(rl, "ip", now) || !middleware.RateLimiterAllow(rl, "ip", now) {
		t.Fatal("burst 内应放行")
	}
	if middleware.RateLimiterAllow(rl, "ip", now) {
		t.Fatal("耗尽后同一时刻应拒绝")
	}
	// 半秒后回填 1 个令牌
	if !middleware.RateLimiterAllow(rl, "ip", now.Add(500*time.Millisecond)) {
		t.Fatal("回填后应恢复放行")
	}
}

func TestTokenBucketCappedAtBurst(t *testing.T) {
	rl := middleware.NewRateLimiter(10, 3)
	now := time.Now()
	if !middleware.RateLimiterAllow(rl, "ip", now) {
		t.Fatal("首次应放行")
	}
	// 长时间空闲：回填应封顶 burst=3，而非累积成 1 小时 * 10/秒
	later := now.Add(time.Hour)
	ok := 0
	for i := 0; i < 10; i++ {
		if middleware.RateLimiterAllow(rl, "ip", later) {
			ok++
		}
	}
	if ok != 3 {
		t.Fatalf("突发应封顶 burst=3，实际放行 %d", ok)
	}
}

func TestTokenBucketPerKeyIsolated(t *testing.T) {
	rl := middleware.NewRateLimiter(1, 1)
	now := time.Now()
	if !middleware.RateLimiterAllow(rl, "a", now) || middleware.RateLimiterAllow(rl, "a", now) {
		t.Fatal("a 应只能过一次")
	}
	if !middleware.RateLimiterAllow(rl, "b", now) {
		t.Fatal("不同 key 应独立计数")
	}
}

func TestRateLimitSensitiveKeywords(t *testing.T) {
	cases := map[string]bool{
		"/v1/api/auth/login":             true,
		"/v1/api/users/3/reset-password": true,
		"/v1/api/users/3/password":       false, // 本人改密不属于撞库面
		"/v1/api/approval/instance":      false,
	}
	for path, want := range cases {
		if got := middleware.MatchKeyword(path, middleware.RateLimitSensitiveKeywords); got != want {
			t.Errorf("path %s: got %v want %v", path, got, want)
		}
	}
}

func TestLoginLockAfterMaxFails(t *testing.T) {
	user := "lock-test-user"
	defer middleware.ClearLoginFail(user)

	// 前 4 次失败不锁定
	for i := 0; i < 4; i++ {
		if middleware.RecordLoginFail(user) {
			t.Fatalf("第 %d 次失败不应触发锁定（默认阈值 5）", i+1)
		}
	}
	if err := middleware.CheckLoginLock(user); err != nil {
		t.Fatalf("未达阈值不应锁定: %v", err)
	}
	// 第 5 次触发锁定
	if !middleware.RecordLoginFail(user) {
		t.Fatal("达到阈值应返回锁定")
	}
	err := middleware.CheckLoginLock(user)
	locked, ok := err.(*middleware.LoginLockedErr)
	if !ok {
		t.Fatalf("CheckLoginLock 应返回 *middleware.LoginLockedErr，实际 %v", err)
	}
	if locked.Remaining <= 0 {
		t.Fatalf("剩余时间应为正，实际 %v", locked.Remaining)
	}
}

func TestLoginSuccessClearsLock(t *testing.T) {
	user := "unlock-test-user"
	defer middleware.ClearLoginFail(user)

	for i := 0; i < 5; i++ {
		middleware.RecordLoginFail(user)
	}
	if middleware.CheckLoginLock(user) == nil {
		t.Fatal("5 次失败后应处于锁定")
	}
	middleware.ClearLoginFail(user)
	if err := middleware.CheckLoginLock(user); err != nil {
		t.Fatalf("登录成功后应立即可重试: %v", err)
	}
}

func TestLoginFailWindowResets(t *testing.T) {
	user := "window-test-user"
	defer middleware.ClearLoginFail(user)

	// 4 次失败后，把 firstFail 推到窗口（默认 15 分钟）之外，再失败 1 次不应锁定
	for i := 0; i < 4; i++ {
		middleware.RecordLoginFail(user)
	}
	if !middleware.BackdateLoginFirstFail(user, time.Now().Add(-20*time.Minute)) {
		t.Fatal("计数记录应存在")
	}

	if middleware.RecordLoginFail(user) {
		t.Fatal("超出失败窗口后应重新计数，第 1 次不触发锁定")
	}
	if middleware.CheckLoginLock(user) != nil {
		t.Fatal("窗口重置后不应处于锁定")
	}
}

// ============================================================
// 中间件 HTTP 行为（真实走一遍 gin 处理链）
// ============================================================

func setRateCfg(enable bool, cost, burst int) func() {
	old := config.Cfg
	config.Cfg = &config.Config{}
	config.Cfg.Server.APIPrefix = "/v1/api"
	config.Cfg.Server.Security = config.SecurityConfig{
		RateLimitEnable:     enable,
		RateLimitCostPerSec: cost,
		RateLimitBurst:      burst,
	}
	middleware.SetGlobalRateLimiter(cost, burst)
	return func() { config.Cfg = old }
}

func TestRateLimitMiddlewareBlocksOverBurst(t *testing.T) {
	gin.SetMode(gin.TestMode)
	defer setRateCfg(true, 1, 2)()

	r := gin.New()
	r.GET("/x", middleware.RateLimit(), func(c *gin.Context) { c.String(http.StatusOK, "ok") })

	code := func() int {
		w := httptest.NewRecorder()
		r.ServeHTTP(w, httptest.NewRequest("GET", "/x", nil))
		return w.Code
	}
	// 桶初始满 2：前两次放行，第三次限流
	if code() != http.StatusOK || code() != http.StatusOK {
		t.Fatal("burst 内请求应放行")
	}
	if got := code(); got != http.StatusTooManyRequests {
		t.Fatalf("超出 burst 应返回 429，实际 %d", got)
	}
}

func TestRateLimitMiddlewareDisabled(t *testing.T) {
	gin.SetMode(gin.TestMode)
	defer setRateCfg(false, 1, 1)()

	r := gin.New()
	r.GET("/x", middleware.RateLimit(), func(c *gin.Context) { c.String(http.StatusOK, "ok") })
	for i := 0; i < 5; i++ {
		w := httptest.NewRecorder()
		r.ServeHTTP(w, httptest.NewRequest("GET", "/x", nil))
		if w.Code != http.StatusOK {
			t.Fatalf("开关关闭时应始终放行，第 %d 次返回 %d", i+1, w.Code)
		}
	}
}

func TestAdminUnlockAndBatchQuery(t *testing.T) {
	u1 := "unlock-api-test-1"
	u2 := "unlock-api-test-2"
	defer middleware.ClearLoginFail(u1)
	defer middleware.ClearLoginFail(u2)

	// u1 锁定；u2 只累计 3 次失败（未达 5 次阈值，不锁定）
	for i := 0; i < 5; i++ {
		middleware.RecordLoginFail(u1)
	}
	for i := 0; i < 3; i++ {
		middleware.RecordLoginFail(u2)
	}

	// 批量查询只应返回锁定中的账号
	got := middleware.LoginLockedRemaining([]string{u1, u2, "not-exist-user"})
	if _, ok := got[u1]; !ok {
		t.Fatal("u1 锁定中，应出现在批量查询结果")
	}
	if _, ok := got[u2]; ok {
		t.Fatal("u2 未达阈值，不应出现在结果")
	}
	if got[u1] <= 0 {
		t.Fatalf("剩余时间应为正，实际 %v", got[u1])
	}

	// 管理员解锁：返回 true 且状态彻底清除
	if !middleware.AdminUnlockLogin(u1) {
		t.Fatal("解锁锁定中的账号应返回 true")
	}
	if err := middleware.CheckLoginLock(u1); err != nil {
		t.Fatalf("解锁后应可立即登录: %v", err)
	}
	if len(middleware.LoginLockedRemaining([]string{u1})) != 0 {
		t.Fatal("解锁后批量查询不应再包含该账号")
	}
	// 重复解锁：已无记录，返回 false（供 handler 区分"本就未锁定"）
	if middleware.AdminUnlockLogin(u1) {
		t.Fatal("重复解锁应返回 false")
	}
	// 未锁定账号解锁返回 false；完全未知用户名同样 false
	if middleware.AdminUnlockLogin(u2) {
		t.Fatal("未达阈值的账号解锁应返回 false")
	}
	if middleware.AdminUnlockLogin("totally-unknown-user") {
		t.Fatal("未知账号解锁应返回 false")
	}
}

func TestLoginLockedErrText(t *testing.T) {
	err := &middleware.LoginLockedErr{Remaining: 5 * time.Minute}
	if err.Error() == "" {
		t.Fatal("锁定错误需提供文案")
	}
}

func TestSecurityHeadersApplied(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.GET("/x", middleware.SecurityHeaders(), func(c *gin.Context) { c.String(http.StatusOK, "ok") })

	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest("GET", "/x", nil))

	h := w.Result().Header
	if got := h.Get("X-Frame-Options"); got != "SAMEORIGIN" {
		t.Errorf("X-Frame-Options = %q", got)
	}
	if got := h.Get("X-Content-Type-Options"); got != "nosniff" {
		t.Errorf("X-Content-Type-Options = %q", got)
	}
	csp := h.Get("Content-Security-Policy")
	if csp == "" {
		t.Fatal("缺少 Content-Security-Policy")
	}
	// 关键指令必须存在，且刻意不下发 script-src（低代码 js_event 依赖 new Function）
	for _, need := range []string{"frame-ancestors 'self'", "object-src 'none'", "base-uri 'self'", "form-action 'self'"} {
		if !strings.Contains(csp, need) {
			t.Errorf("CSP 缺少 %q，实际 %q", need, csp)
		}
	}
	if strings.Contains(csp, "script-src") {
		t.Errorf("CSP 不应下发 script-src（会打断 js_event 的 new Function 沙箱）：%q", csp)
	}
}
