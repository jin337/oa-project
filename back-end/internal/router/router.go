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
		users.POST("", handler.UserCreate)
		users.GET("/:id", handler.UserDetail)
		users.PUT("/:id", handler.UserUpdate)
		users.DELETE("/:id", handler.UserDelete)
		users.PUT("/:id/roles", handler.UserAssignRoles)            // 用户-角色 多对多
		users.PUT("/:id/password", handler.UserUpdatePassword)      // 修改密码（仅限本人）
		users.PUT("/:id/reset-password", handler.UserResetPassword) // 重置密码（管理员操作）
		users.GET("/:id/profile", handler.UserProfileGet)           // 获取员工档案
		users.PUT("/:id/profile", handler.UserProfileUpdate)        // 更新员工档案
	}

	// 角色管理
	roles := v1.Group("/roles")
	roles.Use(middleware.JWTAuth())
	{
		roles.GET("", handler.RoleList)
		roles.POST("", handler.RoleCreate)
		roles.GET("/:id", handler.RoleDetail)
		roles.PUT("/:id", handler.RoleUpdate)
		roles.DELETE("/:id", handler.RoleDelete)
		roles.PUT("/:id/menus", handler.RoleAssignMenus) // 角色-菜单 多对多
		roles.PUT("/:id/depts", handler.RoleAssignDepts) // 自定义数据范围绑定部门
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
		depts.POST("", handler.DeptCreate)
		depts.GET("/:id", handler.DeptDetail)
		depts.PUT("/:id", handler.DeptUpdate)
		depts.DELETE("/:id", handler.DeptDelete)
	}

	// 审批管理
	approval := v1.Group("/approval")
	approval.Use(middleware.JWTAuth())
	{
		// 审批分类
		approval.GET("/category", handler.ApprovalCategoryList)
		approval.POST("/category", handler.ApprovalCategoryCreate)
		approval.PUT("/category/:id", handler.ApprovalCategoryUpdate)
		approval.DELETE("/category/:id", handler.ApprovalCategoryDelete)
		// 申请项
		approval.GET("/item", handler.ApprovalItemList)
		approval.POST("/item", handler.ApprovalItemCreate)
		approval.PUT("/item/:id", handler.ApprovalItemUpdate)
		approval.DELETE("/item/:id", handler.ApprovalItemDelete)
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
		applications.GET("/:id/data", handler.ApplicationDataList)
		applications.GET("/:id/data/:dataId", handler.ApplicationDataDetail)
	}

	return r
}
