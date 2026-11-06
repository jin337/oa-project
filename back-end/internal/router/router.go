package router

import (
	"back-end/internal/config"
	"back-end/internal/handler"
	"back-end/internal/middleware"

	"github.com/gin-gonic/gin"
)

// Setup 组装路由：标准 RESTful 风格
// GET 查询 / POST 新增 / PUT 修改 / DELETE 删除
//
// 各业务模块的路由按 Group 拆分在 router 包内对应文件（见 registerXxxRoutes），
// 本文件仅负责装配：全局中间件、健康检查、静态资源与 API 分组。
func Setup() *gin.Engine {
	r := gin.New()
	// RateLimit：令牌桶限流（全局+凭据接口分级，config.security 开关与阈值）
	// SecurityHeaders：防点击劫持/嗅探/能力授权收敛（后端响应侧；前端 index.html 需在静态服务器同步配置）
	r.Use(middleware.Recovery(), middleware.Cors(), middleware.Timeout(), middleware.RateLimit(), middleware.SecurityHeaders(), gin.Logger())

	// 可信代理：限流按 ClientIP 计数，Gin 默认信任所有代理，客户端可伪造 X-Forwarded-For
	// 绕开额度。反代部署须在 config server.security.trusted_proxies 填代理网段（CIDR）；
	// 留空保持 Gin 默认（本机直连部署无需配置）。
	if proxies := config.Cfg.Server.Security.TrustedProxies; len(proxies) > 0 {
		if err := r.SetTrustedProxies(proxies); err != nil {
			panic("trusted_proxies 配置非法: " + err.Error())
		}
	}

	// 根路径健康检查：无需鉴权，用于验证服务与数据库是否正常
	r.GET("/", handler.Health)

	// 上传文件静态服务：直接映射磁盘 uploads 目录（目录来源与上传、附件回收共用 config.UploadDir）
	r.Static("/uploads", config.UploadDir)

	// 业务路由统一注册在配置的前缀下（config.Server.APIPrefix，唯一真值见 config-*.yaml 的 server.api_prefix）
	api := r.Group(config.Cfg.Server.APIPrefix)
	// 操作审计：记录 api 分组全部非 GET 写操作（登录/授权/配置/数据变更）。
	// 身份在各组 JWTAuth 执行后写入上下文，本中间件位于外层、c.Next 返回时读取
	api.Use(middleware.OperationLog())

	registerAuthRoutes(api)          // 认证
	registerUserRoutes(api)          // 用户
	registerRoleRoutes(api)          // 角色
	registerMenuRoutes(api)          // 菜单
	registerDeptRoutes(api)          // 部门
	registerExamineGroupRoutes(api)  // 审核人员组
	registerApiDefinitionRoutes(api) // 接口管理
	registerApplicationRoutes(api)   // 流程配置
	registerApprovalRoutes(api)      // 审批
	registerUploadRoutes(api)        // 上传
	registerNotificationRoutes(api)  // 通知
	registerOperationLogRoutes(api)  // 操作审计日志

	// 注入运行时路由快照（供接口管理一键导入后端路由）
	middleware.SetRouteSnapshot(r.Routes())

	return r
}
