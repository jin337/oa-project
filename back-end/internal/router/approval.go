package router

import (
	"back-end/internal/handler"
	"back-end/internal/middleware"

	"github.com/gin-gonic/gin"
)

// registerApprovalRoutes 审批管理路由
func registerApprovalRoutes(api *gin.RouterGroup) {
	approval := api.Group("/approval")
	approval.Use(middleware.JWTAuth())
	{
		approval.GET("/list", handler.ApprovalList) // 审批列表
		// 审批分类 & 申请项
		category := approval.Group("/category")
		{
			category.GET("", handler.ApprovalCategoryList)              // 审批分类列表
			category.POST("", handler.ApprovalCategoryCreate)           // 新建审批分类
			category.PUT("/:id", handler.ApprovalCategoryUpdate)        // 修改审批分类
			category.DELETE("/:id", handler.ApprovalCategoryDelete)     // 删除审批分类
			// 申请项
			category.GET("/item", handler.ApprovalCategoryItemList)     // 申请项列表
			category.POST("/item", handler.ApprovalCategoryItemCreate)  // 新建申请项
			category.PUT("/item/:id", handler.ApprovalCategoryItemUpdate) // 修改申请项
			category.DELETE("/item/:id", handler.ApprovalCategoryItemDelete) // 删除申请项
		}
		// 流程实例
		instance := approval.Group("/instance")
		{
			instance.POST("", handler.ApprovalInstanceCreate)                                // 发起审批
			instance.POST("/draft", handler.ApprovalInstanceSaveDraft)                       // 保存审批草稿
			instance.GET("/:id", handler.ApprovalInstanceDetail)                             // 实例详情
			instance.PUT("/:id/submit", handler.ApprovalInstanceSubmitDraft)                 // 从草稿提交发起
			instance.PUT("/:id/withdraw", handler.ApprovalInstanceWithdraw)                  // 撤回
			instance.PUT("/:id/resubmit", handler.ApprovalInstanceResubmit)                  // 已驳回重新提交
			instance.PUT("/:id/task/:taskId/approve", handler.ApprovalInstanceTaskApprove)   // 审批操作
			instance.PUT("/:id/task/:taskId/add-sign", handler.ApprovalInstanceTaskAddSign)  // 加签（前/后）
			instance.PUT("/:id/task/:taskId/delegate", handler.ApprovalInstanceTaskDelegate) // 转交
			instance.DELETE("/:id", handler.ApprovalInstanceDelete)                          // 删除
		}
	}
}
