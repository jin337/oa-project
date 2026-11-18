package config

import (
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"log"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"gopkg.in/yaml.v3"
)

// 安全相关环境变量名：敏感值不写入 YAML，由部署环境注入。
const (
	EnvJWTSecret        = "OA_JWT_SECRET"
	EnvMySQLHost        = "OA_MYSQL_HOST"
	EnvMySQLPort        = "OA_MYSQL_PORT"
	EnvMySQLUsername    = "OA_MYSQL_USERNAME"
	EnvMySQLPassword    = "OA_MYSQL_PASSWORD"
	EnvMySQLDBName      = "OA_MYSQL_DBNAME"
	EnvCORSEnable       = "OA_CORS_ENABLE"
	EnvCORSAllowOrigins = "OA_CORS_ALLOW_ORIGINS"
	EnvTrustedProxies   = "OA_TRUSTED_PROXIES"
	EnvMigrateEnable    = "OA_MIGRATE_ENABLE"
	EnvMigrateMode      = "OA_MIGRATE_MODE"
	EnvAdminUsername    = "OA_ADMIN_USERNAME"
	EnvAdminPassword    = "OA_ADMIN_PASSWORD"
	EnvAdminEmail       = "OA_ADMIN_EMAIL"
)

// UploadDir 上传文件根目录（相对后端运行目录）。
// 上传写入（handler.Upload）、受保护下载（handler.UploadFile）与附件回收（service.ReclaimOrphanUploads）
// 共用这一个来源，避免多处各自硬编码后漂移。
const UploadDir = "uploads"

// Config 顶层配置：只分两大块——服务基础配置(server)、数据库+迁移配置(mysql)
type Config struct {
	Server ServerConfig `yaml:"server"`
	MySQL  MySQLConfig  `yaml:"mysql"`
}

type ServerConfig struct {
	Port           int                `yaml:"port"`
	Mode           string             `yaml:"mode"`
	APIPrefix      string             `yaml:"api_prefix"`      // API 统一前缀（版本号变更只改此处，需同步前端 .env 与 Nginx）
	RequestTimeout int                `yaml:"request_timeout"` // 秒
	JWT            JWTConfig          `yaml:"jwt"`
	Log            LogConfig          `yaml:"log"`
	Cors           CorsConfig         `yaml:"cors"`
	OperationLog   OperationLogConfig `yaml:"operation_log"` // 操作审计日志留存策略
	Security       SecurityConfig     `yaml:"security"`      // 安全防护：限流 + 登录失败锁定
}

// SecurityConfig 安全防护策略（进程内实现，单实例部署口径；多实例扩容需换 Redis 令牌桶）
type SecurityConfig struct {
	RateLimitEnable bool `yaml:"rate_limit_enable"` // 全局接口限流开关（登录/重置密码等凭据接口叠加更严阈值）

	// 全局桶：按客户端 IP 计，令牌=请求数，每秒回填 cost_per_sec 个、突发封顶 burst
	RateLimitCostPerSec int `yaml:"rate_limit_cost_per_sec"` // 每秒每 IP 持续允许请求数，<=0 用默认桶（50）
	RateLimitBurst      int `yaml:"rate_limit_burst"`        // 突发预算（≈可容忍短时并发请求数），默认桶 100

	// 敏感接口（登录 / 管理员重置密码）：同样机制但预算更紧，撞库会被迅速限流
	SensitiveCostPerSec int `yaml:"sensitive_cost_per_sec"` // <=0 用默认桶（5）
	SensitiveBurst      int `yaml:"sensitive_burst"`        // <=0 用默认桶（10）

	// 可信代理网段（CIDR），如 ["127.0.0.1/32","10.0.0.12/32"]。
	// 限流与登录锁定按客户端 IP 计数：Gin 默认信任所有代理，客户端可自行伪造
	// X-Forwarded-For 绕过 IP 限流。反代部署必须在此填 Nginx 所在网段，
	// 只有来自可信代理的 XFF 才会被采信。留空则沿用 Gin 默认（信任所有代理）。
	TrustedProxies []string `yaml:"trusted_proxies"`

	// 登录失败锁定（按用户名维度，防对单账号撞库）
	LoginMaxFails int `yaml:"login_max_fails"` // 窗口内最大失败次数，<=0 回退 5
	LoginFailTTL  int `yaml:"login_fail_ttl"`  // 失败计数窗口（分钟），<=0 回退 15
	LoginLockTTL  int `yaml:"login_lock_ttl"`  // 锁定时长（分钟），<=0 回退 15
}

// OperationLogConfig 操作审计日志留存：超过保留天数的记录由后台定时任务删除
type OperationLogConfig struct {
	RetainDays           int `yaml:"retain_days"`            // 保留天数，0=永久保留（不执行清理）
	CleanupIntervalHours int `yaml:"cleanup_interval_hours"` // 清理任务执行间隔（小时），非法值回退 24
}

type JWTConfig struct {
	Secret string `yaml:"secret"`
	Expire int    `yaml:"expire"` // 小时
	Issuer string `yaml:"issuer"` // token 签发者
}

type LogConfig struct {
	Level string `yaml:"level"` // debug / info / warn / error
	Path  string `yaml:"path"`
}

type CorsConfig struct {
	Enable       bool     `yaml:"enable"`
	AllowOrigins []string `yaml:"allow_origins"`
	AllowMethods []string `yaml:"allow_methods"`
	AllowHeaders []string `yaml:"allow_headers"`
}

type MySQLConfig struct {
	Host            string        `yaml:"host"`
	Port            int           `yaml:"port"`
	Username        string        `yaml:"username"`
	Password        string        `yaml:"password"`
	DBName          string        `yaml:"dbname"`
	TablePrefix     string        `yaml:"table_prefix"`
	Charset         string        `yaml:"charset"`
	Collation       string        `yaml:"collation"`
	ParseTime       bool          `yaml:"parse_time"`
	Loc             string        `yaml:"loc"`
	MaxOpenConns    int           `yaml:"max_open_conns"`
	MaxIdleConns    int           `yaml:"max_idle_conns"`
	ConnMaxLifetime int           `yaml:"conn_max_lifetime"` // 分钟
	ConnectTimeout  int           `yaml:"connect_timeout"`   // 秒
	Migrate         MigrateConfig `yaml:"migrate"`
}

type MigrateConfig struct {
	Enable    bool   `yaml:"enable"`
	Mode      string `yaml:"mode"` // full=全量建表+初始化 / incremental=仅增量
	LogEnable bool   `yaml:"log_enable"`
	LogPath   string `yaml:"log_path"`
}

// Cfg 全局配置实例
var Cfg *Config

// Env 当前环境名：dev / test / prod
var Env string

// defaultConfig 默认安全配置：配置出错时不崩服务，回退到这里
func defaultConfig() *Config {
	return &Config{
		Server: ServerConfig{
			Port:           8080,
			Mode:           "release",
			APIPrefix:      "/v1/api",
			RequestTimeout: 10,
			JWT:            JWTConfig{Secret: "", Expire: 2, Issuer: "back-end"},
			Log:            LogConfig{Level: "info", Path: ""},
			Cors: CorsConfig{
				Enable:       false,
				AllowOrigins: nil,
				AllowMethods: []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
				AllowHeaders: []string{"Origin", "Content-Type", "Authorization"},
			},
			OperationLog: OperationLogConfig{RetainDays: 180, CleanupIntervalHours: 24},
			Security: SecurityConfig{
				RateLimitEnable:     true,
				RateLimitCostPerSec: 50,
				RateLimitBurst:      100,
				SensitiveCostPerSec: 5,
				SensitiveBurst:      10,
				LoginMaxFails:       5,
				LoginFailTTL:        15,
				LoginLockTTL:        15,
			},
		},
		MySQL: MySQLConfig{
			Host: "127.0.0.1", Port: 3306,
			Username: "root", Password: "", DBName: "test", TablePrefix: "oa_",
			Charset: "utf8mb4", Collation: "utf8mb4_general_ci",
			ParseTime: true, Loc: "Local",
			MaxOpenConns: 100, MaxIdleConns: 10,
			ConnMaxLifetime: 60, ConnectTimeout: 5,
			Migrate: MigrateConfig{Enable: false, Mode: "incremental", LogEnable: true, LogPath: "./logs/migrate.log"},
		},
	}
}

// Load 根据环境变量 APP_ENV 加载对应配置文件：
// APP_ENV=dev(默认) -> configs/config-dev.yaml
// APP_ENV=test      -> configs/config-test.yaml
// APP_ENV=prod      -> configs/config-prod.yaml
// 配置文件读取/解析失败时不退出，打印告警并使用默认安全配置。
// 敏感项（数据库密码、JWT 密钥、CORS 来源、管理员口令等）由 OA_* 环境变量覆盖，
// YAML 中只保留非敏感默认值和占位说明，避免仓库内出现明文凭据。
var DefaultEnv = "dev"

func Load() *Config {
	// .env 仅供本地 dev/test 使用；生产必须由部署系统注入，避免本地开发凭据被带入 prod。
	envBeforeDotEnv := os.Getenv("APP_ENV")
	if envBeforeDotEnv == "" {
		envBeforeDotEnv = DefaultEnv
	}
	if envBeforeDotEnv != "prod" {
		loadDotEnv()
	}
	Env = os.Getenv("APP_ENV")
	if Env == "" {
		Env = DefaultEnv
	}
	cfg := defaultConfig()

	path := filepath.Join("configs", fmt.Sprintf("config-%s.yaml", Env))
	data, err := os.ReadFile(path)
	if err != nil {
		log.Printf("[config] 读取 %s 失败，使用默认安全配置: %v", path, err)
	} else if err := yaml.Unmarshal(data, cfg); err != nil {
		log.Printf("[config] 解析 %s 失败，使用默认安全配置: %v", path, err)
	} else {
		log.Printf("[config] 已加载环境配置: %s", path)
	}

	applyEnvOverrides(cfg)

	// 兜底校验：关键参数非法时回退默认值，保证服务可用
	if cfg.Server.Port <= 0 || cfg.Server.Port > 65535 {
		cfg.Server.Port = 8080
	}
	if cfg.Server.Mode != "debug" && cfg.Server.Mode != "release" && cfg.Server.Mode != "test" {
		cfg.Server.Mode = "release"
	}
	// API 前缀兜底：yaml 缺失时禁止为空（否则路由注册到根路径）
	if cfg.Server.APIPrefix == "" {
		cfg.Server.APIPrefix = "/v1/api"
	}
	if cfg.Server.RequestTimeout <= 0 {
		cfg.Server.RequestTimeout = 10
	}
	if cfg.MySQL.Migrate.Mode != "full" && cfg.MySQL.Migrate.Mode != "incremental" {
		cfg.MySQL.Migrate.Mode = "incremental"
	}
	// 审计日志留存兜底：间隔非法回退 24 小时；RetainDays=0 合法（永久保留，不执行清理）
	if cfg.Server.OperationLog.CleanupIntervalHours <= 0 {
		cfg.Server.OperationLog.CleanupIntervalHours = 24
	}
	normalizeSecurity(cfg)

	Cfg = cfg
	return cfg
}

// loadDotEnv 读取当前目录下可选的 .env（本地开发用，已被 .gitignore 忽略）。
// 仅填充进程环境中尚不存在的变量，部署系统注入的同名变量优先。
func loadDotEnv() {
	data, err := os.ReadFile(".env")
	if err != nil {
		return
	}
	for _, raw := range strings.Split(string(data), "\n") {
		line := strings.TrimSpace(strings.TrimSuffix(raw, "\r"))
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		line = strings.TrimPrefix(line, "export ")
		key, value, ok := strings.Cut(line, "=")
		if !ok {
			continue
		}
		key = strings.TrimSpace(key)
		value = strings.TrimSpace(value)
		if len(value) >= 2 && ((value[0] == '"' && value[len(value)-1] == '"') || (value[0] == '\'' && value[len(value)-1] == '\'')) {
			value = value[1 : len(value)-1]
		}
		if key == "" {
			continue
		}
		// 环境切换只由启动命令的 APP_ENV 决定；.env 只允许注入 OA_* 配置项，避免改写 PATH 等进程环境。
		if key == "APP_ENV" || !strings.HasPrefix(key, "OA_") {
			continue
		}
		if _, exists := os.LookupEnv(key); exists {
			continue
		}
		_ = os.Setenv(key, value)
	}
}

// applyEnvOverrides 用部署环境变量覆盖 YAML 中的敏感项。
// 空值不覆盖，避免本地未设置变量时把 YAML 的默认值清空。
func applyEnvOverrides(cfg *Config) {
	if v := os.Getenv(EnvJWTSecret); v != "" {
		cfg.Server.JWT.Secret = v
	}
	if v := os.Getenv(EnvMySQLHost); v != "" {
		cfg.MySQL.Host = v
	}
	if v := os.Getenv(EnvMySQLPort); v != "" {
		if p, err := strconv.Atoi(v); err == nil {
			cfg.MySQL.Port = p
		}
	}
	if v := os.Getenv(EnvMySQLUsername); v != "" {
		cfg.MySQL.Username = v
	}
	if v := os.Getenv(EnvMySQLPassword); v != "" {
		cfg.MySQL.Password = v
	}
	if v := os.Getenv(EnvMySQLDBName); v != "" {
		cfg.MySQL.DBName = v
	}
	if v := os.Getenv(EnvCORSEnable); v != "" {
		if enabled, err := strconv.ParseBool(v); err == nil {
			cfg.Server.Cors.Enable = enabled
		}
	}
	if v := os.Getenv(EnvCORSAllowOrigins); v != "" {
		cfg.Server.Cors.AllowOrigins = splitList(v)
	}
	if v := os.Getenv(EnvTrustedProxies); v != "" {
		cfg.Server.Security.TrustedProxies = splitList(v)
	}
	if v := os.Getenv(EnvMigrateEnable); v != "" {
		if enabled, err := strconv.ParseBool(v); err == nil {
			cfg.MySQL.Migrate.Enable = enabled
		}
	}
	if v := os.Getenv(EnvMigrateMode); v != "" {
		cfg.MySQL.Migrate.Mode = strings.TrimSpace(v)
	}
}

func splitList(raw string) []string {
	parts := strings.Split(raw, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if v := strings.TrimSpace(p); v != "" {
			out = append(out, v)
		}
	}
	return out
}

// normalizeSecurity 补全非敏感默认值；开发/测试环境缺少 JWT 密钥时生成进程级临时密钥。
// 生产环境不生成临时密钥，由 ValidateSecurity 强制要求显式注入。
func normalizeSecurity(cfg *Config) {
	if cfg.Server.JWT.Expire <= 0 {
		cfg.Server.JWT.Expire = 24
	}
	if strings.TrimSpace(cfg.Server.JWT.Issuer) == "" {
		cfg.Server.JWT.Issuer = "back-end"
	}
	if strings.TrimSpace(cfg.Server.JWT.Secret) == "" && Env != "prod" {
		secret, err := randomToken(32)
		if err != nil {
			log.Fatalf("[config] 生成临时 JWT 密钥失败: %v", err)
		}
		cfg.Server.JWT.Secret = secret
		log.Printf("[config] %s 环境未设置 %s，已生成本次进程临时密钥（重启后登录态失效）", Env, EnvJWTSecret)
	}
}

// ValidateSecurity 生产环境安全校验：不合格时拒绝启动，避免静默使用不安全默认值。
// 开发/测试环境保留宽松策略，便于本地调试。
func (c *Config) ValidateSecurity() error {
	if Env != "prod" {
		return nil
	}
	var problems []string
	secret := c.Server.JWT.Secret
	if strings.TrimSpace(secret) == "" {
		problems = append(problems, "server.jwt.secret 为空，必须通过 "+EnvJWTSecret+" 注入")
	} else {
		if len(secret) < 32 {
			problems = append(problems, "server.jwt.secret 长度不足 32 字节")
		}
		if strings.Contains(strings.ToLower(secret), "change-me") {
			problems = append(problems, "server.jwt.secret 仍为示例占位值")
		}
	}
	if strings.TrimSpace(c.MySQL.Username) == "" {
		problems = append(problems, "mysql.username 为空")
	}
	if strings.TrimSpace(c.MySQL.Password) == "" {
		problems = append(problems, "mysql.password 为空，必须通过 "+EnvMySQLPassword+" 注入")
	}
	if c.Server.Cors.Enable {
		if len(c.Server.Cors.AllowOrigins) == 0 {
			problems = append(problems, "server.cors.allow_origins 为空；同域部署请设置 "+EnvCORSEnable+"=false，跨域部署请显式列出来源")
		}
		for i, origin := range c.Server.Cors.AllowOrigins {
			if origin == "*" {
				problems = append(problems, fmt.Sprintf("server.cors.allow_origins[%d] 不能为 *", i))
				continue
			}
			if err := validateOrigin(origin); err != nil {
				problems = append(problems, fmt.Sprintf("server.cors.allow_origins[%d] 非法: %v", i, err))
			}
		}
	}
	if len(problems) > 0 {
		return fmt.Errorf("安全配置校验失败: %s", strings.Join(problems, "；"))
	}
	return nil
}

// validateOrigin 校验 CORS 来源必须是纯 scheme+host+port，不允许路径、查询、通配符。
func validateOrigin(origin string) error {
	u, err := url.Parse(origin)
	if err != nil {
		return err
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return fmt.Errorf("仅支持 http/https")
	}
	if u.Host == "" {
		return fmt.Errorf("缺少主机名")
	}
	if u.User != nil || u.RawQuery != "" || u.Fragment != "" {
		return fmt.Errorf("不允许用户信息、查询参数或片段")
	}
	if u.Path != "" && u.Path != "/" {
		return fmt.Errorf("不允许路径")
	}
	return nil
}

// randomToken 生成 n 字节随机值的 URL-safe 字符串（用于临时 JWT 密钥和开发环境管理员口令）。
func randomToken(n int) (string, error) {
	buf := make([]byte, n)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(buf), nil
}

// AdminUsername 管理员引导用户名（默认 admin，可通过 OA_ADMIN_USERNAME 指定）。
func AdminUsername() string {
	if v := strings.TrimSpace(os.Getenv(EnvAdminUsername)); v != "" {
		return v
	}
	return "admin"
}

// AdminEmail 管理员引导邮箱。
func AdminEmail() string {
	if v := strings.TrimSpace(os.Getenv(EnvAdminEmail)); v != "" {
		return v
	}
	return "admin@local"
}

// AdminPasswordFromEnv 读取生产/测试环境显式配置的管理员口令；未设置返回空。
func AdminPasswordFromEnv() string {
	return os.Getenv(EnvAdminPassword)
}

// BootstrapAdminPassword 返回初始化管理员使用的口令。
// - OA_ADMIN_PASSWORD 已设置：校验强度后使用；
// - 生产环境未设置：返回错误，禁止使用默认口令；
// - 开发/测试环境未设置：生成随机口令并标记 generated=true，由调用方打印一次。
func BootstrapAdminPassword() (password string, generated bool, err error) {
	if p := AdminPasswordFromEnv(); p != "" {
		if err := validateAdminPassword(p); err != nil {
			return "", false, err
		}
		return p, false, nil
	}
	if Env == "prod" {
		return "", false, fmt.Errorf("生产环境必须设置 %s 作为初始管理员口令", EnvAdminPassword)
	}
	p, err := randomToken(18)
	if err != nil {
		return "", false, err
	}
	return p, true, nil
}

func validateAdminPassword(p string) error {
	if len(p) < 12 {
		return fmt.Errorf("%s 长度至少 12 个字符", EnvAdminPassword)
	}
	if p == "admin123" || strings.Contains(strings.ToLower(p), "change-me") {
		return fmt.Errorf("%s 不能使用默认或示例口令", EnvAdminPassword)
	}
	return nil
}

// DSN 生成 gorm MySQL DSN（不含库名，用于建库）
func (m *MySQLConfig) BaseDSN() string {
	return fmt.Sprintf("%s:%s@tcp(%s:%d)/?charset=%s&collation=%s&parseTime=%v&loc=%s&timeout=%ds&readTimeout=%ds&writeTimeout=%ds",
		m.Username, m.Password, m.Host, m.Port, m.Charset, m.Collation, m.ParseTime, m.Loc, m.ConnectTimeout, m.ConnectTimeout, m.ConnectTimeout)
}

// DSN 生成带库名的完整 DSN
// readTimeout/writeTimeout 与连接超时同值：单条 SQL 超过该时长即报错返回，避免慢查询长期占用连接
func (m *MySQLConfig) DSN() string {
	return fmt.Sprintf("%s:%s@tcp(%s:%d)/%s?charset=%s&collation=%s&parseTime=%v&loc=%s&timeout=%ds&readTimeout=%ds&writeTimeout=%ds",
		m.Username, m.Password, m.Host, m.Port, m.DBName, m.Charset, m.Collation, m.ParseTime, m.Loc, m.ConnectTimeout, m.ConnectTimeout, m.ConnectTimeout)
}

// ConnMaxLifetimeDuration 连接最大存活时间
func (m *MySQLConfig) ConnMaxLifetimeDuration() time.Duration {
	return time.Duration(m.ConnMaxLifetime) * time.Minute
}

// RequestTimeoutDuration 接口请求超时
func (s *ServerConfig) RequestTimeoutDuration() time.Duration {
	return time.Duration(s.RequestTimeout) * time.Second
}
