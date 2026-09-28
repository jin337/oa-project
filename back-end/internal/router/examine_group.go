package router

import (
	"back-end/internal/handler"
	"back-end/internal/middleware"

	"github.com/gin-gonic/gin"
)

// registerExamineGroupRoutes 审核人员组管理路由
func registerExamineGroupRoutes(v1 *gin.RouterGroup) {
	examineGroups := v1.Group("/examine-groups")
	examineGroups.Use(middleware.JWTAuth())
	{
		examineGroups.GET("", handler.ExamineGroupList)
		examineGroups.POST("", handler.ExamineGroupCreate)
		examineGroups.GET("/:id", handler.ExamineGroupDetail)
		examineGroups.PUT("/:id", handler.ExamineGroupUpdate)
		examineGroups.DELETE("/:id", handler.ExamineGroupDelete)
	}
}
