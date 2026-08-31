package database

import (
	"database/sql"
	"fmt"
	"time"

	"back-end/internal/config"
	"back-end/internal/pkg/logger"

	"gorm.io/driver/mysql"
	"gorm.io/gorm"
	gormlogger "gorm.io/gorm/logger"
	"gorm.io/gorm/schema"
)

var DB *gorm.DB

// Setup 根据配置连接 MySQL：
// 1. 先用不带库名的连接自动创建数据库（不存在时）
// 2. 再连正式库，配置连接池并做健康检测
func Setup(cfg config.MySQLConfig) (*gorm.DB, error) {
	// 1. 自动建库
	baseDB, err := sql.Open("mysql", cfg.BaseDSN())
	if err != nil {
		return nil, fmt.Errorf("open base mysql: %w", err)
	}
	createSQL := fmt.Sprintf(
		"CREATE DATABASE IF NOT EXISTS `%s` DEFAULT CHARACTER SET %s COLLATE %s",
		cfg.DBName, cfg.Charset, cfg.Collation)
	if _, err := baseDB.Exec(createSQL); err != nil {
		baseDB.Close()
		return nil, fmt.Errorf("create database %s: %w", cfg.DBName, err)
	}
	baseDB.Close()

	// 2. 连接正式库
	gormDB, err := gorm.Open(mysql.Open(cfg.DSN()), &gorm.Config{
		// 全局表名前缀：所有表统一加 TablePrefix 前缀（含多对多关联表）
		NamingStrategy: schema.NamingStrategy{
			TablePrefix: cfg.TablePrefix + "_",
		},
		Logger: gormlogger.Default.LogMode(gormlogger.Warn),
		// 自动迁移不创建物理外键约束（树形自关联/多对多表），
		// 关联完整性由应用层维护，避免根节点 parent_id=0 插入失败
		DisableForeignKeyConstraintWhenMigrating: true,
	})
	if err != nil {
		return nil, fmt.Errorf("open mysql: %w", err)
	}

	sqlDB, err := gormDB.DB()
	if err != nil {
		return nil, fmt.Errorf("get sql db: %w", err)
	}
	// 连接池控制资源，避免数据库压力过大
	sqlDB.SetMaxOpenConns(cfg.MaxOpenConns)
	sqlDB.SetMaxIdleConns(cfg.MaxIdleConns)
	sqlDB.SetConnMaxLifetime(cfg.ConnMaxLifetimeDuration())

	// 健康检测：启动时 ping，database/sql 连接池在断连后会自动重建连接
	if err := sqlDB.Ping(); err != nil {
		return nil, fmt.Errorf("ping mysql: %w", err)
	}

	// 后台健康巡检：周期性 ping，断连时记录日志（连接池自动重连）
	go healthLoop(sqlDB)

	DB = gormDB
	return DB, nil
}

func healthLoop(sqlDB *sql.DB) {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	for range ticker.C {
		if err := sqlDB.Ping(); err != nil {
			logger.Errorf("mysql health check failed: %v", err)
		}
	}
}
