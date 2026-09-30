package router

import (
	"back-end/internal/handler"
	"back-end/internal/middleware"

	"github.com/gin-gonic/gin"
)

// registerExamineGroupRoutes 审核人员组管理路由
func registerExamineGroupRoutes(api *gin.RouterGroup) {
	examineGroups := api.Group("/examine-groups")
	examineGroups.Use(middleware.JWTAuth())
	{
		examineGroups.GET("", handler.ExamineGroupList)      // 审核人员组列表
		examineGroups.POST("", middleware.RequirePermission("system:examine:edit"), handler.ExamineGroupCreate)   // 新建审核人员组
		examineGroups.GET("/:id", handler.ExamineGroupDetail) // 审核人员组详情
		examineGroups.PUT("/:id", middleware.RequirePermission("system:examine:edit"), handler.ExamineGroupUpdate) // 修改审核人员组
		examineGroups.DELETE("/:id", middleware.RequirePermission("system:examine:edit"), handler.ExamineGroupDelete) // 删除审核人员组
	}
}
