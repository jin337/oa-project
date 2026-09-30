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
		depts.GET("", handler.DeptTree)       // 部门树
		depts.GET("/users", handler.DeptUsers) // 部门下用户列表
		depts.POST("", handler.DeptCreate)    // 新建部门
		depts.GET("/:id", handler.DeptDetail) // 部门详情
		depts.PUT("/:id", handler.DeptUpdate) // 修改部门
		depts.DELETE("/:id", handler.DeptDelete) // 删除部门
	}
}
