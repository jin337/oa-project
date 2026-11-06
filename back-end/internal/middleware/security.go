package middleware

import (
	"net/http"
	"strings"
	"sync"
	"time"

	"back-end/internal/config"
	"back-end/internal/pkg/response"

	"github.com/gin-gonic/gin"
)

// ============================================================
// 一、令牌桶限流（进程内）
//
// 背景：登录/重置密码等凭据接口此前无任何速率限制，可被无限撞库。
// 口径：令牌以「请求数」为单位——每次请求消耗 1 个令牌，按时间回填
// costPerSec 个/秒，桶容量封顶 burst（≈可容忍的短时并发请求数）。
// 单实例部署下进程内计数即生效；多实例横向扩容时每实例独立计数
// （等效 N 倍额度），届时应改 Redis 共享令牌桶。
//
// 分级：
//   - 全局桶（所有 API）：阈值宽松，只拦脚本/爬虫/死循环类异常高频，
//     正常人机操作远达不到（SPA 一屏并发十几个请求也在预算内）；
//   - 敏感桶（登录、重置密码等凭据接口）：明显更紧，撞库会被迅速限流。
//
// 后台定期清理长期不活跃 key，防止内存无界增长。
// ============================================================

type tokenBucket struct {
	tokens   float64
	lastFill time.Time
}

type rateLimiter struct {
	mu         sync.Mutex
	buckets    map[string]*tokenBucket
	costPerSec float64 // 每秒回填令牌数（=持续允许的请求速率）
	burst      float64 // 桶容量（突发上限）
}

func newRateLimiter(costPerSec, burst int) *rateLimiter {
	return &rateLimiter{
		buckets:    map[string]*tokenBucket{},
		costPerSec: float64(costPerSec),
		burst:      float64(burst),
	}
}

// allow 消耗 1 个令牌：key 不存在则初始化为满桶；按时间差回填并封顶 burst。
// now 注入便于测试确定性。
func (rl *rateLimiter) allow(key string, now time.Time) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	b, ok := rl.buckets[key]
	if !ok {
		b = &tokenBucket{tokens: rl.burst, lastFill: now}
		rl.buckets[key] = b
	}
	if elapsed := now.Sub(b.lastFill).Seconds(); elapsed > 0 {
		b.tokens += elapsed * rl.costPerSec
		if b.tokens > rl.burst {
			b.tokens = rl.burst
		}
		b.lastFill = now
	}
	if b.tokens < 1 {
		return false
	}
	b.tokens--
	return true
}

// sweep 清理超过 10 分钟未活动的桶（key 失控防护）
func (rl *rateLimiter) sweep(now time.Time) {
	rl.mu.Lock()
	defer rl.mu.Unlock()
	for k, b := range rl.buckets {
		if now.Sub(b.lastFill) > 10*time.Minute {
			delete(rl.buckets, k)
		}
	}
}

// ============================================================
// 二、登录失败锁定（按用户名维度，进程内）
//
// 与 IP 限流互补：轮换 IP 的撞库者按用户名维度仍可被锁死。
// 窗口 LoginFailTTL 内累计 LoginMaxFails 次失败 → 锁定 LoginLockTTL 分钟；
// 登录成功立即清零；锁定到期惰性解锁（无需定时器）。
// 用户不存在与密码错误同等计数（不暴露账号是否存在，与既有错误文案口径一致）。
// 权衡：锁定按用户名，存在「恶意锁死他人账号」面（到期自动解除，且窗口内仅 5 次），
// 已按 OA 常见做法接受；如需更严可结合 IP 维度白名单/验证码升级。
// ============================================================

type loginAttempt struct {
	fails       int
	firstFail   time.Time
	lockedUntil time.Time
}

var (
	loginAttemptsMu sync.Mutex
	loginAttempts   = map[string]*loginAttempt{}
	loginLastSweep  = time.Now()
)

// 锁定策略默认值（配置缺失/非法时回退）
const (
	defaultLoginMaxFails = 5
	defaultLoginFailTTL  = 15 * time.Minute
	defaultLoginLockTTL  = 15 * time.Minute
)

func loginPolicy() (maxFails int, failTTL, lockTTL time.Duration) {
	maxFails, failTTL, lockTTL = defaultLoginMaxFails, defaultLoginFailTTL, defaultLoginLockTTL
	if config.Cfg == nil {
		return
	}
	sc := config.Cfg.Server.Security
	if sc.LoginMaxFails > 0 {
		maxFails = sc.LoginMaxFails
	}
	if sc.LoginFailTTL > 0 {
		failTTL = time.Duration(sc.LoginFailTTL) * time.Minute
	}
	if sc.LoginLockTTL > 0 {
		lockTTL = time.Duration(sc.LoginLockTTL) * time.Minute
	}
	return
}

// loginSweepLocked 清理过期计数与锁定记录（调用方须持锁；低频）
func loginSweepLocked(now time.Time) {
	if now.Sub(loginLastSweep) < time.Minute {
		return
	}
	loginLastSweep = now
	_, failTTL, _ := loginPolicy()
	for k, a := range loginAttempts {
		if now.Sub(a.firstFail) > 2*failTTL && now.After(a.lockedUntil) {
			delete(loginAttempts, k)
		}
	}
}

// LoginLockedErr 账号处于临时锁定期的错误（供 handler 透出剩余时间）
type LoginLockedErr struct{ Remaining time.Duration }

func (e *LoginLockedErr) Error() string { return "登录失败次数过多，账号已临时锁定" }

// CheckLoginLock 登录前置检查：锁定中返回 *LoginLockedErr，否则 nil
func CheckLoginLock(username string) error {
	now := time.Now()
	loginAttemptsMu.Lock()
	defer loginAttemptsMu.Unlock()
	loginSweepLocked(now)
	if a := loginAttempts[username]; a != nil && now.Before(a.lockedUntil) {
		return &LoginLockedErr{Remaining: a.lockedUntil.Sub(now).Round(time.Minute)}
	}
	return nil
}

// RecordLoginFail 记一次登录失败；返回本次是否触发锁定
func RecordLoginFail(username string) bool {
	maxFails, failTTL, lockTTL := loginPolicy()
	now := time.Now()
	loginAttemptsMu.Lock()
	defer loginAttemptsMu.Unlock()
	loginSweepLocked(now)

	a := loginAttempts[username]
	if a == nil || now.Sub(a.firstFail) > failTTL {
		a = &loginAttempt{firstFail: now}
		loginAttempts[username] = a
	}
	a.fails++
	if a.fails >= maxFails {
		a.lockedUntil = now.Add(lockTTL)
		a.fails = 0
		a.firstFail = now
		return true
	}
	return false
}

// ClearLoginFail 登录成功清空失败计数（同时立即解除锁定）
func ClearLoginFail(username string) {
	loginAttemptsMu.Lock()
	delete(loginAttempts, username)
	loginAttemptsMu.Unlock()
}

// LoginLockedRemaining 批量查询锁定剩余时间（只读，不清理、不影响计数）。
// 返回 username → 剩余时长；仅包含当前确实处于锁定期的账号，未锁定者不出现在结果中。
// 供用户列表装配「是否被锁定」，前端据此决定是否显示解除锁定操作。
func LoginLockedRemaining(usernames []string) map[string]time.Duration {
	out := make(map[string]time.Duration)
	if len(usernames) == 0 {
		return out
	}
	now := time.Now()
	loginAttemptsMu.Lock()
	defer loginAttemptsMu.Unlock()
	for _, name := range usernames {
		a := loginAttempts[name]
		if a != nil && now.Before(a.lockedUntil) {
			out[name] = a.lockedUntil.Sub(now)
		}
	}
	return out
}

// AdminUnlockLogin 管理员强制解锁：立即清除该账号的失败计数与锁定。
// 与 ClearLoginFail（登录成功隐式清零）分开命名，语义为「人工处置」。
// 返回是否确实解除了一个锁定期（未在锁定中返回 false，避免前端误报"已解锁"）。
func AdminUnlockLogin(username string) bool {
	now := time.Now()
	loginAttemptsMu.Lock()
	defer loginAttemptsMu.Unlock()
	a := loginAttempts[username]
	if a == nil {
		return false
	}
	locked := now.Before(a.lockedUntil)
	delete(loginAttempts, username)
	return locked
}

// ============================================================
// 三、Gin 中间件
// ============================================================

var (
	globalLimiter    = newRateLimiter(50, 100)
	sensitiveLimiter = newRateLimiter(5, 10)
)

// rateLimitSensitiveKeywords 命中任一关键字即按敏感桶限流（路径统一小写比较）。
// 与审计中间件的 sensitivePathKeywords（"请求体含凭据需脱敏"）语义不同：
// 这里是"可被撞库的接口面"——登录与管理员重置密码；
// 本人改密（PUT /users/:id/password）需旧密码校验且已有全局桶兜底，不单独收紧。
var rateLimitSensitiveKeywords = []string{"login", "reset-password"}

// InitSecurity 由 main 在 config.Load 之后调用：按配置重建限流参数并启动过期清理。
// 未启用限流时仍启动清理器（登录锁定计数同样需要回收）。
func InitSecurity() {
	if config.Cfg != nil {
		sc := config.Cfg.Server.Security
		if sc.RateLimitCostPerSec > 0 && sc.RateLimitBurst > 0 {
			globalLimiter = newRateLimiter(sc.RateLimitCostPerSec, sc.RateLimitBurst)
		}
		if sc.SensitiveCostPerSec > 0 && sc.SensitiveBurst > 0 {
			sensitiveLimiter = newRateLimiter(sc.SensitiveCostPerSec, sc.SensitiveBurst)
		}
	}
	go func() {
		for range time.Tick(5 * time.Minute) {
			now := time.Now()
			globalLimiter.sweep(now)
			sensitiveLimiter.sweep(now)
			loginAttemptsMu.Lock()
			loginSweepLocked(now)
			loginAttemptsMu.Unlock()
		}
	}()
}

// RateLimit 接口限流中间件：全局桶兜底 + 凭据类接口敏感桶。
// 配置未开启（security.rate_limit_enable=false 或配置未加载）时直接放行；
// SSE 长连接豁免（与 Timeout 同口径：连接建立后心跳事件不应按请求计）。
func RateLimit() gin.HandlerFunc {
	return func(c *gin.Context) {
		if config.Cfg == nil || !config.Cfg.Server.Security.RateLimitEnable {
			c.Next()
			return
		}
		if isSSEPath(c.FullPath()) {
			c.Next()
			return
		}
		lim := globalLimiter
		if matchKeyword(strings.ToLower(c.Request.URL.Path), rateLimitSensitiveKeywords) {
			lim = sensitiveLimiter
		}
		if !lim.allow(c.ClientIP(), time.Now()) {
			response.FailWithHTTP(c, http.StatusTooManyRequests, http.StatusTooManyRequests, "操作过于频繁，请稍后再试")
			c.Abort()
			return
		}
		c.Next()
	}
}

// SecurityHeaders 安全响应头：
//   - X-Frame-Options: SAMEORIGIN —— 防点击劫持（旧浏览器回退）；
//   - Content-Security-Policy: frame-ancestors 'self' 等 —— 现代浏览器侧的等价约束。
//     刻意不下发 script-src：低代码引擎的 js_event/表达式钩子依赖 new Function，
//     收紧脚本源会直接砍掉产品能力；此处只收敛嵌套、插件与注入面。
//   - X-Content-Type-Options: nosniff —— 禁 MIME 嗅探；
//   - Referrer-Policy / Permissions-Policy —— 收敛引用信息泄漏与浏览器能力授权。
//
// 注意：本中间件只覆盖后端响应（API 与 /uploads 静态资源）。
// SPA 的 index.html 由前端静态服务器（Nginx 等）下发，点击劫持防护需在该层同步配置，
// 见 README「安全响应头」一节。
func SecurityHeaders() gin.HandlerFunc {
	return func(c *gin.Context) {
		h := c.Writer.Header()
		h.Set("X-Frame-Options", "SAMEORIGIN")
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("Referrer-Policy", "strict-origin-when-cross-origin")
		h.Set("Permissions-Policy", "geolocation=(), microphone=(), camera=(), payment=(), usb=()")
		h.Set("Content-Security-Policy", "frame-ancestors 'self'; object-src 'none'; base-uri 'self'; form-action 'self'")
		c.Next()
	}
}
