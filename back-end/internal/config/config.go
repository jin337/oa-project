package config

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
	"time"

	"gopkg.in/yaml.v3"
)

// UploadDir 上传文件根目录（相对后端运行目录）。
// 上传写入（handler.Upload）、静态映射（路由 /uploads）与附件回收（service.ReclaimOrphanUploads）
// 共用这一个来源，避免多处各自硬编码后漂移。
const UploadDir = "uploads"

// Config 顶层配置：只分两大块——服务基础配置(server)、数据库+迁移配置(mysql)
type Config struct {
	Server ServerConfig `yaml:"server"`
	MySQL  MySQLConfig  `yaml:"mysql"`
}

type ServerConfig struct {
	Port           int         `yaml:"port"`
	Mode           string      `yaml:"mode"`
	APIPrefix      string      `yaml:"api_prefix"` // API 统一前缀（版本号变更只改此处，需同步前端 .env 与 Nginx）
	RequestTimeout int         `yaml:"request_timeout"` // 秒
	JWT            JWTConfig   `yaml:"jwt"`
	Log            LogConfig   `yaml:"log"`
	Cors           CorsConfig  `yaml:"cors"`
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
			JWT:            JWTConfig{Secret: "default-secret-change-me", Expire: 2, Issuer: "back-end"},
			Log:            LogConfig{Level: "info", Path: ""},
			Cors: CorsConfig{
				Enable:       false,
				AllowOrigins: []string{"*"},
				AllowMethods: []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
				AllowHeaders: []string{"Origin", "Content-Type", "Authorization"},
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
var DefaultEnv = "dev"
func Load() *Config {
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

	Cfg = cfg
	return cfg
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
