package middleware

import "github.com/gin-gonic/gin"

// 路由快照：由 router.Setup 在装配完成后注入，
// 供接口管理"枚举后端路由 / 一键导入"使用（Gin 运行时权威路由表）。
var routeSnapshot []gin.RouteInfo

// SetRouteSnapshot 注入当前 Gin 引擎的全部注册路由（method + path + handler）
func SetRouteSnapshot(routes []gin.RouteInfo) {
	routeSnapshot = routes
}

// RouteSnapshot 返回当前引擎注册的全部路由
func RouteSnapshot() []gin.RouteInfo {
	return routeSnapshot
}
