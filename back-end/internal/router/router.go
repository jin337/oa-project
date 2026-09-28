package router

import (
	"back-end/internal/handler"
	"back-end/internal/middleware"

	"github.com/gin-gonic/gin"
)

// Setup 组装路由：标准 RESTful 风格
// GET 查询 / POST 新增 / PUT 修改 / DELETE 删除
//
// 各业务模块的路由按 Group 拆分在 router 包内对应文件（见 registerXxxRoutes），
// 本文件仅负责装配：全局中间件、健康检查、静态资源与 v1 分组。
func Setup() *gin.Engine {
	r := gin.New()
	r.Use(middleware.Recovery(), middleware.Cors(), middleware.Timeout(), gin.Logger())

	// 根路径健康检查：无需鉴权，用于验证服务与数据库是否正常
	r.GET("/", handler.Health)

	// 上传文件静态服务：直接映射磁盘 uploads 目录
	r.Static("/uploads", handler.UploadDir)

	v1 := r.Group("/api/v1")

	registerAuthRoutes(v1)
	registerUserRoutes(v1)
	registerRoleRoutes(v1)
	registerMenuRoutes(v1)
	registerDeptRoutes(v1)
	registerExamineGroupRoutes(v1)
	registerApiDefinitionRoutes(v1)
	registerApplicationRoutes(v1)
	registerApprovalRoutes(v1)
	registerUploadRoutes(v1)
	registerUtilRoutes(v1)
	registerNotificationRoutes(v1)

	return r
}
