package middleware

import "time"

// 导出桥接层：仅供 internal/test 跨包访问本包的白盒测试目标。
// 与 internal/service/exportbridge.go 同一模式：internal 路径下外部模块无法 import，
// 这些导出名仅在本项目内可见，不构成对外 API。
// 新增白盒测试需要暴露新的私有符号时，在此按同样方式补一行。

// 类型别名（测试可持有 NewRateLimiter 返回值并传给桥接函数）
type RateLimiter = rateLimiter

// 函数别名（matchKeyword 定义在 operation_log.go，同包桥接）
var (
	NewRateLimiter = newRateLimiter
	MatchKeyword   = matchKeyword
)

// 方法表达式桥接：Go 禁止跨包调用未导出方法，转为包级函数（首参接收者）。
// 测试用 RateLimiterAllow(rl, key, now) 等价于 rl.allow(key, now)。
var RateLimiterAllow = (*rateLimiter).allow

// RateLimitSensitiveKeywords 敏感桶限流关键字表（真值定义在 security.go）
var RateLimitSensitiveKeywords = rateLimitSensitiveKeywords

// SetGlobalRateLimiter 按参数重建全局限流器。
// 测试替换 config.Cfg 后需要同时重置桶实例（生产路径走 InitSecurity，不受影响）。
func SetGlobalRateLimiter(costPerSec, burst int) {
	globalLimiter = newRateLimiter(costPerSec, burst)
}

// BackdateLoginFirstFail 回拨某用户名失败计数窗口的起点（模拟窗口过期），
// 返回该账号是否存在计数记录。跨包无法直接读写 loginAttempts/loginAttempt 内部字段，故函数化桥接。
func BackdateLoginFirstFail(username string, t time.Time) bool {
	loginAttemptsMu.Lock()
	defer loginAttemptsMu.Unlock()
	a := loginAttempts[username]
	if a == nil {
		return false
	}
	a.firstFail = t
	return true
}
