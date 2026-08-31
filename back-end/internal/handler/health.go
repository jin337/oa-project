package handler

import (
	"time"

	"back-end/internal/config"
	"back-end/internal/database"
	"back-end/internal/pkg/response"

	"github.com/gin-gonic/gin"
)

// Health GET / 根路径健康检查接口：
// 用于验证服务是否正常启动、数据库是否连通，无需登录鉴权
func Health(c *gin.Context) {
	dbStatus := "ok"
	if database.DB == nil {
		dbStatus = "未初始化"
	} else if sqlDB, err := database.DB.DB(); err != nil {
		dbStatus = "不可用"
	} else if err := sqlDB.Ping(); err != nil {
		dbStatus = "连接失败"
	}

	response.OK(c, gin.H{
		"service":   "back-end",
		"env":       config.Env,
		"db_status": dbStatus,
		"time":      time.Now().Format("2006-01-02 15:04:05"),
	})
}
