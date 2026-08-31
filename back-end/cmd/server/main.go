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
	"back-end/internal/pkg/logger"
	"back-end/internal/router"

	"github.com/gin-gonic/gin"
)

func main() {
	// 1. 加载配置：APP_ENV=dev/test/prod 切换，读取失败自动回退默认安全配置
	cfg := config.Load()

	// 2. 初始化日志：级别与路径均可配置
	logger.Setup(cfg.Server.Log.Level, cfg.Server.Log.Path)
	logger.Infof("环境=%s 配置加载完成", config.Env)

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

	// 6. 优雅停机
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
