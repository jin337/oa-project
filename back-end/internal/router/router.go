package router

import (
	"back-end/internal/handler"
	"back-end/internal/middleware"

	"github.com/gin-gonic/gin"
)

// Setup 组装路由：标准 RESTful 风格
// GET 查询 / POST 新增 / PUT 修改 / DELETE 删除
func Setup() *gin.Engine {
	r := gin.New()
	r.Use(middleware.Recovery(), middleware.Cors(), middleware.Timeout(), gin.Logger())

	// 根路径健康检查：无需鉴权，用于验证服务与数据库是否正常
	r.GET("/", handler.Health)

	// 上传文件静态服务：直接映射磁盘 uploads 目录
	r.Static("/uploads", handler.UploadDir)

	v1 := r.Group("/api/v1")

	// 认证（登录无需鉴权）
	auth := v1.Group("/auth")
	{
		auth.POST("/login", handler.Login)
		auth.Use(middleware.JWTAuth())
		auth.GET("/profile", handler.Profile) // 当前用户 + 菜单树 + 权限标识
		auth.GET("/menus", handler.UserMenus) // 当前用户菜单树
	}

	// 用户管理
	users := v1.Group("/users")
	users.Use(middleware.JWTAuth())
	{
		users.GET("", handler.UserList)
		users.PUT("/switch-dept", handler.UserSwitchDept)
		users.POST("", handler.UserCreate)
		users.GET("/:id", handler.UserDetail)
		users.PUT("/:id", handler.UserUpdate)
		users.DELETE("/:id", handler.UserDelete)
		users.PUT("/:id/roles", handler.UserAssignRoles)
		users.PUT("/:id/password", handler.UserUpdatePassword)
		users.PUT("/:id/reset-password", handler.UserResetPassword)
		users.GET("/:id/profile", handler.UserProfileGet)
		users.PUT("/:id/profile", handler.UserProfileUpdate)
	}

	// 角色管理
	roles := v1.Group("/roles")
	roles.Use(middleware.JWTAuth())
	{
		roles.GET("", handler.RoleList)
		roles.GET("/users", handler.RoleUsers)
		roles.POST("", handler.RoleCreate)
		roles.GET("/:id", handler.RoleDetail)
		roles.PUT("/:id", handler.RoleUpdate)
		roles.DELETE("/:id", handler.RoleDelete)
		roles.PUT("/:id/menus", handler.RoleAssignMenus)
		roles.PUT("/:id/depts", handler.RoleAssignDepts)
	}

	// 导航/菜单管理
	menus := v1.Group("/menus")
	menus.Use(middleware.JWTAuth())
	{
		menus.GET("", handler.MenuTree)
		menus.POST("", handler.MenuCreate)
		menus.GET("/:id", handler.MenuDetail)
		menus.PUT("/:id", handler.MenuUpdate)
		menus.DELETE("/:id", handler.MenuDelete)
	}

	// 公司/部门管理
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

	// 审批管理
	approval := v1.Group("/approval")
	approval.Use(middleware.JWTAuth())
	{
		// 审批列表
		approval.GET("/list", handler.ApprovalList)
		// 审批分类 & 申请项
		category := approval.Group("/category")
		{
			category.GET("", handler.ApprovalCategoryList)
			category.POST("", handler.ApprovalCategoryCreate)
			category.PUT("/:id", handler.ApprovalCategoryUpdate)
			category.DELETE("/:id", handler.ApprovalCategoryDelete)
			// 申请项
			category.GET("/item", handler.ApprovalCategoryItemList)
			category.POST("/item", handler.ApprovalCategoryItemCreate)
			category.PUT("/item/:id", handler.ApprovalCategoryItemUpdate)
			category.DELETE("/item/:id", handler.ApprovalCategoryItemDelete)
		}
		// 流程实例
		instance := approval.Group("/instance")
		{
			instance.POST("", handler.ApprovalInstanceCreate)                                // 发起审批
			instance.POST("/draft", handler.ApprovalInstanceSaveDraft)                       // 保存审批草稿
			instance.GET("/:id", handler.ApprovalInstanceDetail)                             // 实例详情
			instance.PUT("/:id/submit", handler.ApprovalInstanceSubmitDraft)                 // 从草稿提交发起
			instance.PUT("/:id/withdraw", handler.ApprovalInstanceWithdraw)                  // 撤回
			instance.PUT("/:id/resubmit", handler.ApprovalInstanceResubmit)                 // 已驳回重新提交
			instance.PUT("/:id/task/:taskId/approve", handler.ApprovalInstanceTaskApprove)   // 审批操作
			instance.PUT("/:id/task/:taskId/add-sign", handler.ApprovalInstanceTaskAddSign)  // 加签（前/后）
			instance.PUT("/:id/task/:taskId/delegate", handler.ApprovalInstanceTaskDelegate) // 转交
			instance.DELETE("/:id", handler.ApprovalInstanceDelete)                            // 删除
		}
	}

	// 站内通知
	// 文件上传
	upload := v1.Group("/upload")
	upload.Use(middleware.JWTAuth())
	{
		upload.POST("", handler.Upload)
	}

	notifications := v1.Group("/notifications")
	notifications.Use(middleware.JWTAuth())
	{
		notifications.GET("", handler.NotificationList)
		notifications.GET("/stream", handler.NotificationStream)
		notifications.GET("/unread-count", handler.NotificationUnreadCount)
		notifications.PUT("/read-all", handler.NotificationReadAll)
		notifications.PUT("/:id/read", handler.NotificationRead)
	}

	// 页面配置管理
	applications := v1.Group("/application")
	applications.Use(middleware.JWTAuth())
	{
		applications.GET("", handler.ApplicationList)
		applications.POST("", handler.ApplicationCreate)
		applications.GET("/by-code/:code", handler.ApplicationByCode)
		applications.GET("/:id", handler.ApplicationDetail)
		applications.PUT("/:id", handler.ApplicationUpdate)
		applications.DELETE("/:id", handler.ApplicationDelete)
		// 表字段管理
		applications.GET("/:id/fields", handler.TableFieldList)
		applications.POST("/:id/fields", handler.TableFieldCreate)
		applications.PUT("/:id/fields/:fieldId", handler.TableFieldUpdate)
		applications.DELETE("/:id/fields/:fieldId", handler.TableFieldDelete)
		// 表单元素管理
		applications.GET("/:id/formelement", handler.FormElementList)
		applications.POST("/:id/formelement", handler.FormElementCreate)
		applications.PUT("/:id/formelement/:elementId", handler.FormElementUpdate)
		applications.DELETE("/:id/formelement/:elementId", handler.FormElementDelete)
		// 动态页面数据
		applications.POST("/:id/data", handler.ApplicationDataCreate)
		applications.GET("/:id/data/:dataId", handler.ApplicationDataDetail)
		applications.PUT("/:id/data/:dataId", handler.ApplicationDataUpdate)
		applications.DELETE("/:id/data/:dataId", handler.ApplicationDataDelete)
	}

	return r
}
