package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"back-end/internal/config"
	"back-end/internal/database"
	"back-end/internal/middleware"
	"back-end/internal/pkg/logger"
	"back-end/internal/router"
	"back-end/internal/service"

	"github.com/gin-gonic/gin"
)

func main() {
	// 1. 加载配置：APP_ENV=dev/test/prod 切换，读取失败自动回退默认安全配置
	cfg := config.Load()

	// 2. 初始化日志：级别与路径均可配置
	logger.Setup(cfg.Server.Log.Level, cfg.Server.Log.Path)
	logger.Infof("环境=%s 配置加载完成", config.Env)

	// 2.1 安全策略初始化：按 config.security 应用限流参数并启动过期 key 清理
	middleware.InitSecurity()

	// 3. 连接数据库（自动建库 + 连接池 + 健康检测）
	db, err := database.Setup(cfg.MySQL)
	if err != nil {
		logger.Errorf("连接数据库失败: %v", err)
		os.Exit(1)
	}
	logger.Infof("数据库 %s 连接成功", cfg.MySQL.DBName)

	// 4. 自动迁移：可开关、full/incremental 双模式、带版本管理与迁移日志
	//    迁移失败只记录错误，不让服务启动失败（高稳定要求）
	if err := database.Migrate(db, cfg.MySQL.Migrate); err != nil {
		logger.Errorf("自动迁移失败，服务继续启动: %v", err)
	}

	// 5. 组装路由并启动服务
	// GIN 请求日志输出到文件，避免继承终端/管道 stdout 时缓冲写满阻塞全部请求
	if ginFile, ferr := os.OpenFile("logs/gin.log", os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644); ferr == nil {
		gin.DefaultWriter = ginFile
		gin.DefaultErrorWriter = ginFile
	}
	gin.SetMode(cfg.Server.Mode)
	srv := &http.Server{
		Addr:    fmt.Sprintf(":%d", cfg.Server.Port),
		Handler: router.Setup(),
	}
	go func() {
		logger.Infof("服务启动于 :%d", cfg.Server.Port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Errorf("服务异常退出: %v", err)
			os.Exit(1)
		}
	}()

	// 6. 定时清理超过保留天数的操作审计日志（server.operation_log.retain_days，0=永久保留则不注册）
	if cfg.Server.OperationLog.RetainDays > 0 {
		go func() {
			interval := time.Duration(cfg.Server.OperationLog.CleanupIntervalHours) * time.Hour
			ticker := time.NewTicker(interval)
			defer ticker.Stop()
			for range ticker.C {
				if n, err := service.OperationLogCleanup(); err != nil {
					logger.Errorf("审计日志清理失败: %v", err)
				} else if n > 0 {
					logger.Infof("审计日志清理 %d 条（保留 %d 天）", n, cfg.Server.OperationLog.RetainDays)
				}
			}
		}()
	}

	// 6.1 每分钟检查一次：到了生效时间的流程版本自动激活
	go func() {
		ticker := time.NewTicker(time.Minute)
		defer ticker.Stop()
		if n, err := service.ActivateScheduledVersions(); err != nil {
			logger.Errorf("版本定时激活失败: %v", err)
		} else if n > 0 {
			logger.Infof("版本定时激活 %d 个", n)
		}
		for range ticker.C {
			if n, err := service.ActivateScheduledVersions(); err != nil {
				logger.Errorf("版本定时激活失败: %v", err)
			} else if n > 0 {
				logger.Infof("版本定时激活 %d 个", n)
			}
		}
	}()

	// 6.2 每分钟扫描一次待办超时：按实例提交时冻结的 taskTimeout / taskAdvance 快照判定，
	// 超时给当前待办人发站内提醒（每任务最多 3 次、间隔 24 小时），到期前发一次预警；均不改变审批流转。
	// 扫描周期必须不大于最小预警提前量（1 分钟），否则短时限任务可能在两次扫描之间直接越过预警窗口。
	go func() {
		ticker := time.NewTicker(time.Minute)
		defer ticker.Stop()
		scan := func() {
			reminded, advanced, err := service.OverdueNotificationScan()
			if err != nil {
				logger.Errorf("待办超时提醒扫描失败: %v", err)
			} else if reminded > 0 || advanced > 0 {
				logger.Infof("待办到期预警 %d 条、超时提醒 %d 条", advanced, reminded)
			}
		}
		scan()
		for range ticker.C {
			scan()
		}
	}()

	// 7. 优雅停机
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	logger.Infof("收到退出信号，正在优雅停机...")

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		logger.Errorf("停机异常: %v", err)
	}
	logger.Infof("服务已停止")
}
