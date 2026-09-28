package router

import (
	"back-end/internal/handler"
	"back-end/internal/middleware"

	"github.com/gin-gonic/gin"
)

// registerDeptRoutes 公司/部门管理路由
func registerDeptRoutes(v1 *gin.RouterGroup) {
	depts := v1.Group("/depts")
	depts.Use(middleware.JWTAuth())
	{
		depts.GET("", handler.DeptTree)
		depts.GET("/users", handler.DeptUsers)
		depts.POST("", handler.DeptCreate)
		depts.GET("/:id", handler.DeptDetail)
		depts.PUT("/:id", handler.DeptUpdate)
		depts.DELETE("/:id", handler.DeptDelete)
	}
}
