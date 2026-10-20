package model

import "time"

// ============================================================
// RBAC 模型，对应架构图：
//   用户 User ──拥有(多对多)── 角色 Role ──分配(多对多)── 导航/菜单 Menu(目录/页面菜单/按钮权限标识, parent_id 自关联)
//   用户 User ──属于(dept_id)── 公司/部门 Dept(parent_id 自关联)
//   角色 Role ──绑定── 数据范围 DataScope(data_scope + 自定义部门多对多) ──过滤查询(WHERE dept_id IN ?)── Dept
// ============================================================

// User 用户
type User struct {
	BaseModel
	Username string `gorm:"size:64;uniqueIndex;not null;comment:用户名" json:"username"`
	Email    string `gorm:"size:128;index;comment:邮箱" json:"email"`
	Phone    string `gorm:"size:20;comment:手机号" json:"phone"`
	Password string `gorm:"size:255;not null;comment:密码" json:"-"`
	Status   int    `gorm:"default:1;comment:状态 1启用 0停用" json:"status"`
	DeptID   uint   `gorm:"index;comment:当前所属部门ID" json:"dept_id"`

	DeptIDs []*Dept      `gorm:"many2many:sys_user_dept;" json:"dept_ids,omitempty"` // 多部门归属(多对多，借鉴 Roles)，当前部门取 DeptID
	Roles   []*Role      `gorm:"many2many:sys_user_role;" json:"roles,omitempty"`
	Dept    *Dept        `gorm:"foreignKey:DeptID" json:"dept,omitempty"`
	Profile *UserProfile `gorm:"foreignKey:UserID" json:"profile,omitempty"`
}

// UserProfile 员工档案：与用户一对一（1:1）关联，存储更丰富的个人信息
type UserProfile struct {
	BaseModel
	UserID           uint   `gorm:"uniqueIndex;not null;comment:用户ID(1:1 外键)" json:"user_id"`
	Nickname         string `gorm:"size:64;comment:姓名" json:"nickname"`
	Avatar           string `gorm:"size:255;comment:头像" json:"avatar"`
	Gender           int    `gorm:"default:1;comment:性别 1男 2女" json:"gender"`
	Birthday         string `gorm:"size:10;comment:出生日期(YYYY-MM-DD)" json:"birthday"`
	Address          string `gorm:"size:255;comment:联系地址" json:"address"`
	JoinDate         string `gorm:"size:10;comment:入职日期(YYYY-MM-DD)" json:"join_date"`
	EmergencyContact string `gorm:"size:64;comment:紧急联系人" json:"emergency_contact"`

	User *User `gorm:"foreignKey:UserID" json:"user,omitempty"`
}

// Role 角色
type Role struct {
	BaseModel
	Name      string `gorm:"size:64;uniqueIndex;not null;comment:角色名称" json:"name"`
	Code      string `gorm:"size:64;uniqueIndex;not null;comment:角色编码" json:"code"`
	Sort      int    `gorm:"default:1;comment:排序" json:"sort"`
	Status    int    `gorm:"default:1;comment:状态 1启用 0停用" json:"status"`
	DataScope int    `gorm:"default:3;comment:数据范围 1全部 2自定义 3仅本部门 4本部门及下级 5仅本人" json:"data_scope"`
	Remark    string `gorm:"size:255;comment:备注" json:"remark"`

	Menus []*Menu `gorm:"many2many:sys_role_menu;" json:"menus,omitempty"`
	Depts []*Dept `gorm:"many2many:sys_role_dept;" json:"depts,omitempty"` // 自定义数据范围绑定的部门
}

// ExamineGroupApprover 审核人信息（由 ApproverIDs 翻译而来，不落库）
type ExamineGroupApprover struct {
	ID       uint   `json:"id"`
	Name     string `json:"name"`
	Username string `json:"username"`
}

// ExamineGroup 审核人员组：配置审批流程时可按组选择审核人，审核人为用户ID列表
type ExamineGroup struct {
	BaseModel
	Name        string `gorm:"size:64;uniqueIndex;not null;comment:审核人员组名称" json:"name"`
	Code        string `gorm:"size:64;uniqueIndex;not null;comment:编号" json:"code"`
	ApproverIDs []uint `gorm:"serializer:json;type:json;comment:审核人用户ID列表" json:"approver_ids"`
	Sort        int    `gorm:"default:1;comment:排序" json:"sort"`
	Status      int    `gorm:"default:1;comment:状态 1启用 0停用" json:"status"`

	Approvers []ExamineGroupApprover `gorm:"-" json:"approvers,omitempty"` // 审核人信息（服务层翻译填充）
}

// ApiDefinition 接口定义：配置即用的数据库接口管理
// 对外以 method+path 暴露统一 HTTP 端点；定义方式二选一：
//   - type=sql：SQL 模板直查数据库（${form.xxx} 占位参数化），沿用数据权限注入（部门固定按 dept_id、仅本人固定按 created_by 过滤）
//   - type=http：转发内部接口（method + target_path + params 模板，转发方法与对外方法一致）
type ApiDefinition struct {
	BaseModel
	Name        string                 `gorm:"size:64;uniqueIndex;not null;comment:接口名称" json:"name"`
	Method      string                 `gorm:"size:10;not null;default:GET;uniqueIndex:uk_api_def_method_path;comment:对外请求方法" json:"method"`
	Path        string                 `gorm:"size:255;not null;uniqueIndex:uk_api_def_method_path;comment:对外路径" json:"path"`
	Type        string                 `gorm:"size:10;not null;default:sql;comment:定义方式 sql|http" json:"type"`
	SQLTemplate string                 `gorm:"type:text;comment:SQL 模板(${form.xxx} 占位)" json:"sql_template"`
	TargetPath  string                 `gorm:"size:255;comment:转发目标路径" json:"target_path"`
	Params      map[string]interface{} `gorm:"serializer:json;type:json;comment:转发参数模板" json:"params"`
	Status      int                    `gorm:"default:1;comment:状态 1启用 0停用" json:"status"`
	Sort        int                    `gorm:"default:1;comment:排序" json:"sort"`
	Remark      string                 `gorm:"size:255;comment:备注" json:"remark"`
	Category    string                 `gorm:"size:64;index;comment:分类（来自 router.go 注册行注释，如 通知/工具）" json:"category"`
	Referenced  int                    `gorm:"-" json:"referenced"` // 被表单元素引用次数（运行时统计，不入库）
}

type ApiDefinitionCreateReq struct {
	Name        string                 `json:"name" validate:"required,min=1,max=64" label:"接口名称"`
	Method      string                 `json:"method" validate:"required,oneof=GET POST PUT DELETE" label:"请求方法"`
	Path        string                 `json:"path" validate:"required,min=1,max=255" label:"对外路径"`
	Type        string                 `json:"type" validate:"omitempty,oneof=sql http" label:"定义方式"`
	SQLTemplate string                 `json:"sql_template" validate:"omitempty,max=8000" label:"SQL 模板"`
	TargetPath  string                 `json:"target_path" validate:"omitempty,min=1,max=255" label:"转发目标路径"`
	Params      map[string]interface{} `json:"params" validate:"omitempty" label:"转发参数模板"`
	Status      int                    `json:"status" validate:"omitempty,oneof=0 1" label:"状态"`
	Sort        int                    `json:"sort" validate:"omitempty" label:"排序"`
	Remark      string                 `json:"remark" validate:"omitempty,max=255" label:"备注"`
	Category    string                 `json:"category" validate:"omitempty,max=64" label:"分类"`
}

type ApiDefinitionUpdateReq struct {
	Name        string                 `json:"name" validate:"omitempty,min=1,max=64" label:"接口名称"`
	Method      string                 `json:"method" validate:"omitempty,oneof=GET POST PUT DELETE" label:"请求方法"`
	Path        string                 `json:"path" validate:"omitempty,min=1,max=255" label:"对外路径"`
	Type        string                 `json:"type" validate:"omitempty,oneof=sql http" label:"定义方式"`
	SQLTemplate string                 `json:"sql_template" validate:"omitempty,max=8000" label:"SQL 模板"`
	TargetPath  string                 `json:"target_path" validate:"omitempty,min=1,max=255" label:"转发目标路径"`
	Params      map[string]interface{} `json:"params" validate:"omitempty" label:"转发参数模板"`
	Status      int                    `json:"status" validate:"omitempty,oneof=0 1" label:"状态"`
	Sort        int                    `json:"sort" validate:"omitempty" label:"排序"`
	Remark      string                 `json:"remark" validate:"omitempty,max=255" label:"备注"`
	Category    string                 `json:"category" validate:"omitempty,max=64" label:"分类"`
}

type ApiDefinitionListReq struct {
	BaseListReq
	Keyword  string `json:"keyword" form:"keyword" validate:"omitempty" label:"关键字"`
	Method   string `json:"method" form:"method" validate:"omitempty" label:"请求方法"`
	Type     string `json:"type" form:"type" validate:"omitempty,oneof=sql http" label:"定义方式"`
	Category string `json:"category" form:"category" validate:"omitempty" label:"分类"`
	Status   *int   `json:"status" form:"status" validate:"omitempty,oneof=0 1" label:"状态"`
}

// ApiDefinitionDebugReq 接口试调：按接口 ID 加载定义执行，params 作为 ${form.xxx} 求值的上下文
type ApiDefinitionDebugReq struct {
	ID     uint                   `json:"id" validate:"required" label:"接口ID"`
	Params map[string]interface{} `json:"params" validate:"omitempty" label:"试调参数(form上下文)"`
}

// ApiDefinitionDebugResult 试调/分发结果：原始响应 + 错误信息
type ApiDefinitionDebugResult struct {
	Raw       interface{} `json:"raw"`
	Error     string      `json:"error,omitempty"`
	Forwarded bool        `json:"-"` // HTTP 转发结果标记：统一分发时原样透传目标响应体，避免双重包裹
}

// 角色编码常量
const (
	RoleCodeAdmin = "admin" // 超级管理员角色编码
)

// 数据范围常量
const (
	DataScopeAll          = 1 // 全部数据
	DataScopeCustom       = 2 // 自定义部门
	DataScopeDept         = 3 // 仅本部门
	DataScopeDeptAndBelow = 4 // 本部门及下级
	DataScopeSelf         = 5 // 仅本人
)

// Menu 导航/菜单：目录、页面菜单、按钮/权限标识，parent_id 自关联成树
type Menu struct {
	BaseModel
	ParentID uint   `gorm:"index;default:0;comment:父级ID(包含子节点 parent_id)" json:"parent_id"`
	Name     string `gorm:"size:64;not null;comment:菜单名称" json:"name"`
	Type     int    `gorm:"comment:类型 1目录 2页面菜单 3按钮/权限标识" json:"type"`
	Path     string `gorm:"size:255;comment:路由地址" json:"path"`
	Perm     string `gorm:"size:128;index;comment:权限标识 如 system:user:add" json:"perm"`
	LinkApp  string `gorm:"size:64;comment:关联应用" json:"link_app"`
	Icon     string `gorm:"size:64;comment:图标" json:"icon"`
	Sort     int    `gorm:"default:1;comment:排序" json:"sort"`
	Status   int    `gorm:"default:1;comment:状态 1启用 0停用" json:"status"`
	Hidden   int    `gorm:"default:0;comment:是否隐藏 1是 0否" json:"hidden"`

	Children []*Menu `gorm:"foreignKey:ParentID" json:"children,omitempty"`
}

// 菜单类型常量
const (
	MenuTypeDir    = 1 // 目录
	MenuTypeMenu   = 2 // 页面菜单
	MenuTypeButton = 3 // 按钮/权限标识
)

// Dept 公司/部门，parent_id 自关联成树
type Dept struct {
	BaseModel
	ParentID uint   `gorm:"index;default:0;comment:父级ID" json:"parent_id"`
	Name     string `gorm:"size:64;not null;comment:部门名称" json:"name"`
	Leader   *uint  `gorm:"comment:负责人" json:"leader"`
	Sort     int    `gorm:"default:1;comment:排序" json:"sort"`
	Status   int    `gorm:"default:1;comment:状态 1启用 0停用" json:"status"`

	LeaderName string  `gorm:"-" json:"leader_name,omitempty"` // 负责人昵称（联查填充，不入库）
	Children   []*Dept `gorm:"foreignKey:ParentID" json:"children,omitempty"`
}

// 组织架构树节点类型（GET /depts/users、GET /roles/users 混合树）
const (
	OrgNodeTypeDept = "dept" // 部门节点
	OrgNodeTypeUser = "user" // 用户节点
	OrgNodeTypeRole = "role" // 角色节点（GET /roles/users）
)

// OrgNode 部门与用户混合树节点：
// 部门节点的 Children 同时包含子部门节点与用户节点，前端可统一遍历 children 获取完整组织架构；
// 通过 Type 区分节点身份，部门/用户各自的专属字段以 omitempty 输出
type OrgNode struct {
	Type     string     `json:"type"` // dept 部门 / user 用户
	ID       uint       `json:"id"`   // 部门 ID 或用户 ID
	Name     string     `json:"name"` // 部门名称或用户名
	Children []*OrgNode `json:"children,omitempty"`

	// 部门/角色专属字段
	ParentID uint   `json:"parent_id,omitempty"`
	Leader   string `json:"leader,omitempty"`
	Code     string `json:"code,omitempty"` // 角色编码（角色节点输出）
	Sort     int    `json:"sort,omitempty"`

	// 用户专属字段
	Username string `json:"username,omitempty"`
	Email    string `json:"email,omitempty"`
	Phone    string `json:"phone,omitempty"`

	Status int `json:"status,omitempty"` // 部门状态(1启用 0停用)或用户状态(1启用 0停用)
}

// ------------------------------------------------------------
// 请求结构（带参数校验 tag，非法参数自动拦截）
// ------------------------------------------------------------

type LoginReq struct {
	Username string `json:"username" validate:"required,min=2,max=64" label:"用户名"`
	Password string `json:"password" validate:"required,min=6,max=64" label:"密码"`
}

type UserCreateReq struct {
	Username string `json:"username" validate:"required,min=2,max=64" label:"用户名"`
	Email    string `json:"email" validate:"omitempty,email" label:"邮箱"`
	Phone    string `json:"phone" validate:"omitempty,max=20" label:"手机号"`
	Password string `json:"password" validate:"required,min=6,max=64" label:"密码"`
	Status   int    `json:"status" validate:"omitempty,oneof=0 1" label:"状态"`
	DeptID   uint   `json:"dept_id" validate:"omitempty" label:"当前部门ID"`
	DeptIDs  []uint `json:"dept_ids" validate:"omitempty,dive,gt=0" label:"所属部门ID列表"`
	RoleIDs  []uint `json:"role_ids" validate:"omitempty" label:"角色ID列表"`
}

type UserUpdateReq struct {
	Username string `json:"username" validate:"omitempty,min=2,max=64" label:"用户名"`
	Email    string `json:"email" validate:"omitempty,email" label:"邮箱"`
	Phone    string `json:"phone" validate:"omitempty,max=20" label:"手机号"`
	Status   *int   `json:"status" validate:"omitempty,oneof=0 1" label:"状态"`
	DeptID   uint   `json:"dept_id" validate:"omitempty" label:"当前部门ID"`
	DeptIDs  []uint `json:"dept_ids" validate:"omitempty,dive,gt=0" label:"所属部门ID列表"` // nil 表示不修改多部门归属
	Password string `json:"password" validate:"omitempty,min=6,max=64" label:"密码"`
}

type UserListReq struct {
	BaseListReq
	Username string `json:"username" form:"username" validate:"omitempty" label:"用户名"`
	DeptID   uint   `json:"dept_id" form:"dept_id" validate:"omitempty" label:"部门ID"`
}

// SwitchDeptReq 切换当前部门请求：目标部门必须属于用户的多部门归属列表
type SwitchDeptReq struct {
	DeptID uint `json:"dept_id" validate:"required,gt=0" label:"目标部门ID"`
}

type AssignRolesReq struct {
	RoleIDs []uint `json:"role_ids" validate:"required,min=1" label:"角色ID列表"`
}

type UpdatePasswordReq struct {
	OldPassword string `json:"old_password" validate:"required,min=6,max=64" label:"旧密码"`
	NewPassword string `json:"new_password" validate:"required,min=6,max=64" label:"新密码"`
}

type ResetPasswordReq struct {
	NewPassword string `json:"new_password" validate:"required,min=6,max=64" label:"新密码"`
}

type UpdateProfileReq struct {
	Nickname         string `json:"nickname" validate:"omitempty,max=64" label:"姓名"`
	Avatar           string `json:"avatar" validate:"omitempty,max=255" label:"头像"`
	Gender           int    `json:"gender" validate:"omitempty,oneof=1 2" label:"性别"`
	Birthday         string `json:"birthday" validate:"omitempty,max=10" label:"出生日期"`
	Address          string `json:"address" validate:"omitempty,max=255" label:"联系地址"`
	JoinDate         string `json:"join_date" validate:"omitempty,max=10" label:"入职日期"`
	EmergencyContact string `json:"emergency_contact" validate:"omitempty,max=64" label:"紧急联系人"`
}

type RoleCreateReq struct {
	Name      string `json:"name" validate:"required,min=2,max=64" label:"角色名称"`
	Code      string `json:"code" validate:"required,min=2,max=64" label:"角色编码"`
	Sort      int    `json:"sort" validate:"omitempty" label:"排序"`
	Status    int    `json:"status" validate:"omitempty,oneof=0 1" label:"状态"`
	DataScope int    `json:"data_scope" validate:"omitempty,oneof=1 2 3 4 5" label:"数据范围"`
	Remark    string `json:"remark" validate:"omitempty,max=255" label:"备注"`
}

type RoleUpdateReq struct {
	Name      string `json:"name" validate:"omitempty,min=2,max=64" label:"角色名称"`
	Code      string `json:"code" validate:"omitempty,min=2,max=64" label:"角色编码"`
	Sort      int    `json:"sort" validate:"omitempty" label:"排序"`
	Status    *int   `json:"status" validate:"omitempty,oneof=0 1" label:"状态"`
	DataScope int    `json:"data_scope" validate:"omitempty,oneof=1 2 3 4 5" label:"数据范围"`
	Remark    string `json:"remark" validate:"omitempty,max=255" label:"备注"`
}

type RoleListReq struct {
	BaseListReq
	Name   string `json:"name" form:"name" validate:"omitempty" label:"角色名称"`
	Status *int   `json:"status" form:"status" validate:"omitempty,oneof=0 1" label:"状态"`
}

type AssignMenusReq struct {
	MenuIDs []uint `json:"menu_ids" validate:"required,min=1" label:"菜单ID列表"`
}

type AssignDeptsReq struct {
	DeptIDs []uint `json:"dept_ids" validate:"omitempty" label:"部门ID列表"`
}

type ExamineGroupCreateReq struct {
	Name        string `json:"name" validate:"required,min=1,max=64" label:"审核人员组名称"`
	Code        string `json:"code" validate:"required,min=1,max=64" label:"编号"`
	ApproverIDs []uint `json:"approver_ids" validate:"omitempty,dive,gt=0" label:"审核人"`
	Sort        int    `json:"sort" validate:"omitempty" label:"排序"`
	Status      int    `json:"status" validate:"omitempty,oneof=0 1" label:"状态"`
}

type ExamineGroupUpdateReq struct {
	Name        string `json:"name" validate:"omitempty,min=1,max=64" label:"审核人员组名称"`
	Code        string `json:"code" validate:"omitempty,min=1,max=64" label:"编号"`
	ApproverIDs []uint `json:"approver_ids" validate:"omitempty,dive,gt=0" label:"审核人"`
	Sort        int    `json:"sort" validate:"omitempty" label:"排序"`
	Status      *int   `json:"status" validate:"omitempty,oneof=0 1" label:"状态"`
}

type ExamineGroupListReq struct {
	BaseListReq
	Name   string `json:"name" form:"name" validate:"omitempty" label:"审核人员组名称"`
	Status *int   `json:"status" form:"status" validate:"omitempty,oneof=0 1" label:"状态"`
}

type MenuCreateReq struct {
	ParentID uint   `json:"parent_id" validate:"omitempty" label:"父级ID"`
	Name     string `json:"name" validate:"required,min=1,max=64" label:"菜单名称"`
	Type     int    `json:"type" validate:"required,oneof=1 2 3" label:"菜单类型"`
	Path     string `json:"path" validate:"omitempty,max=255" label:"路由地址"`
	Perm     string `json:"perm" validate:"omitempty,max=128" label:"权限标识"`
	LinkApp  string `json:"link_app" validate:"omitempty,max=64" label:"关联应用"`
	Icon     string `json:"icon" validate:"omitempty,max=64" label:"图标"`
	Sort     int    `json:"sort" validate:"omitempty" label:"排序"`
	Status   int    `json:"status" validate:"omitempty,oneof=0 1" label:"状态"`
	Hidden   int    `json:"hidden" validate:"omitempty,oneof=0 1" label:"是否隐藏"`
}

type MenuUpdateReq struct {
	ParentID uint   `json:"parent_id" validate:"omitempty" label:"父级ID"`
	Name     string `json:"name" validate:"omitempty,min=1,max=64" label:"菜单名称"`
	Type     int    `json:"type" validate:"omitempty,oneof=1 2 3" label:"菜单类型"`
	Path     string `json:"path" validate:"omitempty,max=255" label:"路由地址"`
	Perm     string `json:"perm" validate:"omitempty,max=128" label:"权限标识"`
	LinkApp  string `json:"link_app" validate:"omitempty,max=64" label:"关联应用"`
	Icon     string `json:"icon" validate:"omitempty,max=64" label:"图标"`
	Sort     int    `json:"sort" validate:"omitempty" label:"排序"`
	Status   *int   `json:"status" validate:"omitempty,oneof=0 1" label:"状态"`
	Hidden   int    `json:"hidden" validate:"omitempty,oneof=0 1" label:"是否隐藏"`
}

type DeptCreateReq struct {
	ParentID uint   `json:"parent_id" validate:"omitempty" label:"父级ID"`
	Name     string `json:"name" validate:"required,min=1,max=64" label:"部门名称"`
	Leader   *uint  `json:"leader" validate:"omitempty" label:"负责人"`
	Sort     int    `json:"sort" validate:"omitempty" label:"排序"`
	Status   int    `json:"status" validate:"omitempty,oneof=0 1" label:"状态"`
}

type DeptUpdateReq struct {
	ParentID uint   `json:"parent_id" validate:"omitempty" label:"父级ID"`
	Name     string `json:"name" validate:"omitempty,min=1,max=64" label:"部门名称"`
	Leader   *uint  `json:"leader" validate:"omitempty" label:"负责人"`
	Sort     int    `json:"sort" validate:"omitempty" label:"排序"`
	Status   *int   `json:"status" validate:"omitempty,oneof=0 1" label:"状态"`
}

type DeptListReq struct {
	Name string `json:"name" form:"name" validate:"omitempty" label:"部门名称"`
}

// Application 页面配置：对应表，供低代码/表单引擎使用
type Application struct {
	BaseModel
	Name             string                 `gorm:"size:64;not null;comment:页面名称" json:"name"`
	Code             string                 `gorm:"size:64;uniqueIndex;not null;comment:页面编码" json:"code"`
	TableName        string                 `gorm:"size:128;not null;comment:对应表" json:"table_name"`
	BillPrefix       string                 `gorm:"size:32;comment:单号前缀" json:"bill_prefix"`
	SubTableName     string                 `gorm:"size:255;comment:子表(多个用逗号分隔)" json:"sub_table_name"`
	Status           int                    `gorm:"default:1;comment:状态 1启用 0停用" json:"status"`
	FormLayoutJSON   map[string]interface{} `gorm:"serializer:json;type:json;comment:表单页布局配置(草稿)" json:"form_layout_json"`
	DetailLayoutJSON map[string]interface{} `gorm:"serializer:json;type:json;comment:详情页布局配置(草稿)" json:"detail_layout_json"`
	ApprovalFlowJSON any                    `gorm:"serializer:json;type:json;comment:审批流配置(草稿)" json:"approval_flow_json"`
	CurrentVersionID uint                   `gorm:"default:0;index;comment:当前生效版本ID" json:"current_version_id"`
	CurrentVersionNo  string                 `gorm:"size:32;comment:当前生效版本号" json:"current_version_no"`
}

// ApplicationVersion 流程配置版本快照：每次「发布」把草稿快照成一条版本，
// 到 effective_at 后由定时任务自动切换为当前生效版本。
type ApplicationVersion struct {
	BaseModel
	ApplicationID    uint                   `gorm:"not null;uniqueIndex:uk_app_version;index;comment:应用ID" json:"application_id"`
	VersionNo        string                 `gorm:"size:32;not null;uniqueIndex:uk_app_version;comment:版本号(应用内自增)" json:"version_no"`
	Remark           string                 `gorm:"size:255;comment:版本说明" json:"remark"`
	FormLayoutJSON   map[string]interface{} `gorm:"serializer:json;type:json;comment:表单页快照" json:"form_layout_json"`
	DetailLayoutJSON map[string]interface{} `gorm:"serializer:json;type:json;comment:详情页快照" json:"detail_layout_json"`
	ApprovalFlowJSON any                    `gorm:"serializer:json;type:json;comment:审批流快照" json:"approval_flow_json"`
	Status           int                    `gorm:"default:0;index;comment:0待生效 1已生效 2已失效" json:"status"`
	EffectiveAt      time.Time              `gorm:"comment:生效时间" json:"effective_at"`
	ExpiredAt        *time.Time             `gorm:"comment:失效时间" json:"expired_at"`
	CreatedBy        uint                   `gorm:"comment:创建人" json:"created_by"`
}

const (
	AppVersionStatusScheduled = 0 // 待生效
	AppVersionStatusActive    = 1 // 已生效
	AppVersionStatusExpired   = 2 // 已失效
)

type ApplicationCreateReq struct {
	Name             string                 `json:"name" validate:"required,min=2,max=64" label:"页面名称"`
	Code             string                 `json:"code" validate:"omitempty,min=2,max=64" label:"页面编码"` // 新增时后端自动生成，忽略前端传入
	TableName        string                 `json:"table_name" validate:"required,max=128" label:"对应表"`
	BillPrefix       string                 `json:"bill_prefix" validate:"omitempty,max=32" label:"单号前缀"`
	SubTableName     string                 `json:"sub_table_name" validate:"omitempty,max=255" label:"子表"`
	Status           int                    `json:"status" validate:"omitempty,oneof=0 1" label:"状态"`
	FormLayoutJSON   map[string]interface{} `json:"form_layout_json" validate:"omitempty" label:"表单页布局"`
	DetailLayoutJSON map[string]interface{} `json:"detail_layout_json" validate:"omitempty" label:"详情页布局"`
	ApprovalFlowJSON any                    `json:"approval_flow_json" validate:"omitempty" label:"审批流配置"`
}

type ApplicationUpdateReq struct {
	Name             *string                 `json:"name" validate:"omitempty,min=2,max=64" label:"页面名称"`
	Code             string                  `json:"code" validate:"omitempty,min=2,max=64" label:"页面编码"`
	TableName        *string                 `json:"table_name" validate:"omitempty,max=128" label:"对应表"`
	BillPrefix       *string                 `json:"bill_prefix" validate:"omitempty,max=32" label:"单号前缀"`
	SubTableName     *string                 `json:"sub_table_name" validate:"omitempty,max=255" label:"子表"`
	Status           *int                    `json:"status" validate:"omitempty,oneof=0 1" label:"状态"`
	FormLayoutJSON   *map[string]interface{} `json:"form_layout_json" validate:"omitempty" label:"表单页布局"`
	DetailLayoutJSON *map[string]interface{} `json:"detail_layout_json" validate:"omitempty" label:"详情页布局"`
	ApprovalFlowJSON *any                    `json:"approval_flow_json" validate:"omitempty" label:"审批流配置"`
}

type ApplicationListReq struct {
	BaseListReq
	Keyword string `json:"keyword" form:"keyword" validate:"omitempty" label:"关键词"`
	Status  *int   `json:"status" form:"status" validate:"omitempty,oneof=0 1" label:"状态"`
}

// BillSequence 单号序列：按「应用 + 期间(YYYYMMDD)」维度记录当前流水号，
// 提交审核时在事务内行锁自增，保证同一应用同一天的单号不重号。
type BillSequence struct {
	BaseModel
	AppID  uint   `gorm:"not null;uniqueIndex:uk_bill_seq_app_period;comment:应用ID" json:"app_id"`
	Period string `gorm:"size:8;not null;uniqueIndex:uk_bill_seq_app_period;comment:期间(YYYYMMDD)" json:"period"`
	Seq    int64  `gorm:"not null;default:0;comment:当前序号" json:"seq"`
}

// 动态业务数据审核状态（approval_status 列取值）
const (
	ApprovalStatusDraft     = 0 // 草稿（未提交审核，可编辑；提交后进入待审核）
	ApprovalStatusPending   = 1 // 待审核（数据创建时默认，重新提交后回到此状态）
	ApprovalStatusReviewing = 2 // 审核中（审核人开始审核）
	ApprovalStatusPassed    = 3 // 已通过（审核通过，终态）
	ApprovalStatusRejected  = 4 // 不通过（审核拒绝，终态）
	ApprovalStatusReturned  = 5 // 已驳回（退回修改，可重新提交回到待审核）
	ApprovalStatusVoided    = 6 // 已作废（终态）
	ApprovalStatusDeleted   = 7 // 已删除（由删除接口自动置位，终态）
	ApprovalStatusWithdrawn = 8 // 已撤回（发起人撤回，可编辑/重新提交/删除）
)

// ApplicationDataListReq 动态数据列表查询：分页 + 目标表名 + 动态搜索字段
// 动态搜索字段以 field_key 作为 Query 参数名，由 handler 从 URL 提取后填充到 Filters
type ApplicationDataListReq struct {
	BaseListReq
	TableName    string            `json:"table_name" form:"table_name" validate:"required" label:"表名"`
	Status       *int              `json:"status" form:"status" validate:"omitempty,oneof=0 1 2 3 4 5 6 7 8" label:"审核状态"` // nil 表示不过滤；0 草稿 1 待审核 2 审核中 3 已通过 4 不通过 5 已驳回 6 已作废 7 已删除 8 已撤回
	ExcludeDraft bool              `json:"exclude_draft" form:"exclude_draft" label:"是否排除草稿"`                            // 为 true 时不返回草稿(0)数据（如审核人视角的已提交列表）
	Filters      map[string]string `json:"-" form:"-"`                                                                   // 动态搜索字段（field_key → 值）
}

// ApplicationDataDetailReq 动态数据详情查询：主键为路径参数 dataId，目标表以应用配置为准
type ApplicationDataDetailReq struct {
	TableName string `json:"table_name" form:"table_name" validate:"omitempty" label:"表名"`
}

// ApplicationByCodeResult 按页面编码查询应用配置的响应：
// 嵌入基础信息（id/name/table_name/sub_table_name/status 等），按 state 裁剪布局 JSON；
// state=list 时额外附带 search_fields（搜索项）、columns（表格表头）与主表数据列表
type ApplicationByCodeResult struct {
	Application
	SearchFields []ApplicationElement     `json:"search_fields,omitempty"`
	Columns      []ApplicationElement     `json:"columns,omitempty"`
	List         []map[string]interface{} `json:"list,omitempty"`
	Total        int64                    `json:"total,omitempty"`
	Page         int                      `json:"page,omitempty"`
	Size         int                      `json:"size,omitempty"`
}

// TableColumn 物理业务表列定义（来源：information_schema.columns）
// ID 为列名，作为前端编辑/删除的路径标识
type TableColumn struct {
	ID           string `json:"id"`
	Name         string `json:"name"`
	Type         string `json:"type"`
	Length       int    `json:"length"`
	NotNull      int    `json:"not_null"`
	DefaultValue string `json:"default_value"`
	Comment      string `json:"comment"`
}

type TableFieldCreateReq struct {
	TableName    string `json:"table_name" validate:"required" label:"表名"` // 主表或子表
	Name         string `json:"name" validate:"required,min=1,max=64" label:"字段名称"`
	Type         string `json:"type" validate:"required" label:"字段类型"`
	Length       int    `json:"length" validate:"omitempty,min=1,max=10000" label:"长度"`
	NotNull      int    `json:"not_null" validate:"omitempty,oneof=0 1" label:"是否非空"`
	DefaultValue string `json:"default_value" validate:"omitempty,max=255" label:"默认值"`
	Comment      string `json:"comment" validate:"omitempty,max=255" label:"字段注释"`
}

type TableFieldUpdateReq struct {
	TableName    string `json:"table_name" validate:"required" label:"表名"` // 主表或子表
	Name         string `json:"name" validate:"omitempty,min=1,max=64" label:"字段名称"`
	Type         string `json:"type" validate:"omitempty" label:"字段类型"`
	Length       int    `json:"length" validate:"omitempty,min=1,max=10000" label:"长度"`
	NotNull      *int   `json:"not_null" validate:"omitempty,oneof=0 1" label:"是否非空"` // 指针区分未传与 0，避免零值覆盖
	DefaultValue string `json:"default_value" validate:"omitempty,max=255" label:"默认值"`
	Comment      string `json:"comment" validate:"omitempty,max=255" label:"字段注释"`
}

type TableFieldListReq struct {
	BaseListReq
	Name      string `json:"name" form:"name" validate:"omitempty" label:"字段名称"`
	TableName string `json:"table_name" form:"table_name" validate:"required" label:"表名"` // 主表或子表
}

type TableFieldDeleteReq struct {
	TableName string `json:"table_name" form:"table_name" validate:"required" label:"表名"` // 主表或子表
}

// ApplicationElement 表单元素配置：绑定页面配置（Application）对应的物理表字段，用于低代码表单渲染
type ApplicationElement struct {
	BaseModel
	AppID             uint                   `gorm:"column:app_id;index;not null;comment:所属页面配置ID" json:"app_id"`
	Label             string                 `gorm:"size:64;not null;comment:字段标签" json:"label"`
	FieldKey          string                 `gorm:"size:64;not null;comment:关联物理表列名" json:"field_key"`
	TableKey          string                 `gorm:"size:64;not null;comment:关联物理表" json:"table_key"`
	ElementType       string                 `gorm:"size:32;not null;comment:元素类型" json:"element_type"`
	Placeholder       string                 `gorm:"size:255;comment:占位提示" json:"placeholder"`
	Required          int                    `gorm:"default:0;comment:是否必填 1是 0否" json:"required"`
	DefaultValue      string                 `gorm:"size:255;comment:默认值" json:"default_value"`
	ValidationRule    string                 `gorm:"size:255;comment:校验规则" json:"validation_rule"`
	ValidationMessage string                 `gorm:"size:255;comment:错误提示" json:"validation_message"`
	Visibility        map[string]interface{} `gorm:"serializer:json;type:json;comment:列表与搜索行为" json:"visibility"`
	DynamicStates     map[string]interface{} `gorm:"serializer:json;type:json;comment:动态状态控制" json:"dynamic_states"`
	DataSource        map[string]interface{} `gorm:"serializer:json;type:json;comment:数据源配置" json:"data_source"`
	Actions           map[string]interface{} `gorm:"serializer:json;type:json;comment:事件驱动配置" json:"actions"`
}

// ApplicationElementListItem 表单元素列表项
type ApplicationElementListItem struct {
	ID                uint                   `json:"id"`
	AppID             uint                   `json:"app_id"`
	Label             string                 `json:"label"`
	FieldKey          string                 `json:"field_key"`
	TableKey          string                 `json:"table_key"`
	ElementType       string                 `json:"element_type"`
	Placeholder       string                 `json:"placeholder"`
	Required          int                    `json:"required"`
	DefaultValue      string                 `json:"default_value"`
	ValidationRule    string                 `json:"validation_rule"`
	ValidationMessage string                 `json:"validation_message"`
	Visibility        map[string]interface{} `json:"visibility"`
	DynamicStates     map[string]interface{} `json:"dynamic_states"`
	DataSource        map[string]interface{} `json:"data_source"`
	Actions           map[string]interface{} `json:"actions"`
}

type ApplicationElementCreateReq struct {
	Label             string                 `json:"label" validate:"required,min=1,max=64" label:"名称"`
	FieldKey          string                 `json:"field_key" validate:"required,min=1,max=64" label:"对应字段"`
	TableKey          string                 `json:"table_key" validate:"required,min=1,max=64" label:"分类表"`
	ElementType       string                 `json:"element_type" validate:"required" label:"元素类型"`
	Placeholder       string                 `json:"placeholder" validate:"omitempty,max=255" label:"占位提示"`
	Required          int                    `json:"required" validate:"omitempty,oneof=0 1" label:"是否必填"`
	DefaultValue      string                 `json:"default_value" validate:"omitempty,max=255" label:"默认值"`
	ValidationRule    string                 `json:"validation_rule" validate:"omitempty,max=255" label:"校验规则"`
	ValidationMessage string                 `json:"validation_message" validate:"omitempty,max=255" label:"错误提示"`
	Visibility        map[string]interface{} `json:"visibility" validate:"omitempty" label:"可见性"`
	DynamicStates     map[string]interface{} `json:"dynamic_states" validate:"omitempty" label:"动态状态"`
	DataSource        map[string]interface{} `json:"data_source" validate:"omitempty" label:"数据源"`
	Actions           map[string]interface{} `json:"actions" validate:"omitempty" label:"事件"`
}

type ApplicationElementUpdateReq struct {
	Label             string                 `json:"label" validate:"omitempty,min=1,max=64" label:"名称"`
	FieldKey          string                 `json:"field_key" validate:"omitempty,min=1,max=64" label:"对应字段"`
	TableKey          string                 `json:"table_key" validate:"omitempty,min=1,max=64" label:"分类表"`
	ElementType       string                 `json:"element_type" validate:"omitempty" label:"元素类型"`
	Placeholder       string                 `json:"placeholder" validate:"omitempty,max=255" label:"占位提示"`
	Required          *int                   `json:"required" validate:"omitempty,oneof=0 1" label:"是否必填"` // 指针区分未传与 0
	DefaultValue      string                 `json:"default_value" validate:"omitempty,max=255" label:"默认值"`
	ValidationRule    string                 `json:"validation_rule" validate:"omitempty,max=255" label:"校验规则"`
	ValidationMessage string                 `json:"validation_message" validate:"omitempty,max=255" label:"错误提示"`
	Visibility        map[string]interface{} `json:"visibility" validate:"omitempty" label:"可见性"`
	DynamicStates     map[string]interface{} `json:"dynamic_states" validate:"omitempty" label:"动态状态"`
	DataSource        map[string]interface{} `json:"data_source" validate:"omitempty" label:"数据源"`
	Actions           map[string]interface{} `json:"actions" validate:"omitempty" label:"事件"`
}

type ApplicationElementListReq struct {
	BaseListReq
	Keyword  string `json:"keyword" form:"keyword" validate:"omitempty" label:"关键词"`
	TableKey string `json:"table_key" form:"table_key" validate:"omitempty" label:"表分类"`
}

// ============================================================
// 审批模块模型
// ============================================================

// ApprovalCategory 审批分类
type ApprovalCategory struct {
	BaseModel
	Name string `gorm:"size:64;not null;comment:分类名称" json:"name"`
	Sort int    `gorm:"default:1;comment:排序" json:"sort"`
}

type ApprovalCategoryCreateReq struct {
	Name string `json:"name" validate:"required,min=1,max=64" label:"分类名称"`
	Sort int    `json:"sort" validate:"omitempty" label:"排序"`
}

type ApprovalCategoryUpdateReq struct {
	Name string `json:"name" validate:"omitempty,min=1,max=64" label:"分类名称"`
	Sort int    `json:"sort" validate:"omitempty" label:"排序"`
}

type ApprovalCategoryListReq struct {
	BaseListReq
}

// ApprovalCategoryItem 申请项
type ApprovalCategoryItem struct {
	BaseModel
	Name       string `gorm:"size:64;not null;comment:申请项名称" json:"name"`
	Code       string `gorm:"size:64;comment:关联应用页面编码" json:"code"`
	CategoryID uint   `gorm:"index;not null;comment:所属分类ID" json:"category_id"`
	Icon       string `gorm:"size:64;comment:图标" json:"icon"`
	Sort       int    `gorm:"default:1;comment:排序" json:"sort"`

	Category *ApprovalCategory `gorm:"foreignKey:CategoryID" json:"category,omitempty"`
}

type ApprovalCategoryItemCreateReq struct {
	Name       string `json:"name" validate:"required,min=1,max=64" label:"申请项名称"`
	Code       string `json:"code" validate:"required,min=1,max=64" label:"页面编码"`
	CategoryID uint   `json:"category_id" validate:"required" label:"所属分类"`
	Icon       string `json:"icon" validate:"omitempty,max=64" label:"图标"`
	Sort       int    `json:"sort" validate:"omitempty" label:"排序"`
}

type ApprovalCategoryItemUpdateReq struct {
	Name       string `json:"name" validate:"omitempty,min=1,max=64" label:"申请项名称"`
	Code       string `json:"code" validate:"omitempty,min=1,max=64" label:"页面编码"`
	CategoryID uint   `json:"category_id" validate:"omitempty" label:"所属分类"`
	Icon       string `json:"icon" validate:"omitempty,max=64" label:"图标"`
	Sort       int    `json:"sort" validate:"omitempty" label:"排序"`
}

type ApprovalCategoryItemListReq struct {
	BaseListReq
	CategoryID uint `json:"category_id" form:"category_id" validate:"omitempty" label:"所属分类"`
}

// ============================================================
// 流程实例 & 审批任务模型
// ============================================================

// 流程实例状态常量
const (
	InstanceStatusRunning   = 0 // 进行中
	InstanceStatusPassed    = 1 // 已通过（终态）
	InstanceStatusRejected  = 2 // 已拒绝（终态）
	InstanceStatusReturned  = 3 // 已驳回（可重新提交）
	InstanceStatusVoided    = 4 // 已作废（终态）
	InstanceStatusWithdrawn = 5 // 已撤回（回退为草稿）
	InstanceStatusDraft     = 6 // 草稿（未正式启动，不生成审批任务）
)

// 审批任务状态常量
const (
	TaskStatusPending   = 0 // 待处理
	TaskStatusApproved  = 1 // 已通过
	TaskStatusRejected  = 2 // 已拒绝
	TaskStatusReturned  = 3 // 已驳回
	TaskStatusDelegated = 4 // 已转交
	TaskStatusCancelled = 5 // 已取消
	TaskStatusWaiting   = 6 // 加签等待（前加签：原任务挂起等待加签人处理）
)

// ApprovalInstance 流程实例：一次审批流转的运行时载体
type ApprovalInstance struct {
	BaseModel
	AppID                uint              `gorm:"index;not null;comment:关联页面配置ID" json:"app_id"`
	BusinessTable        string            `gorm:"size:128;not null;comment:业务表名(不含前缀)" json:"business_table"`
	BusinessDataID       uint              `gorm:"not null;comment:业务数据主键ID" json:"business_data_id"`
	ApprovalFlowJSON     any               `gorm:"column:approval_flow_json;serializer:json;type:json;comment:审批流配置快照(提交时冻结)" json:"approval_flow_json"`
	FormLayoutJSON       any               `gorm:"column:form_layout_json;serializer:json;type:json;comment:表单页布局快照(提交时冻结)" json:"form_layout_json,omitempty"`
	DetailLayoutJSON     any               `gorm:"column:detail_layout_json;serializer:json;type:json;comment:详情页布局快照(提交时冻结)" json:"detail_layout_json,omitempty"`
	ExecutionPath        []string          `gorm:"serializer:json;type:json;comment:条件评估后的命中节点ID链(JSON数组)" json:"execution_path,omitempty"`
	CurrentNodeIdx       int               `gorm:"default:0;comment:当前执行到节点链的索引" json:"current_node_idx"`
	Status               int               `gorm:"default:0;comment:实例状态 0进行中 1已通过 2已拒绝 3已驳回 4已作废 5已撤回 6草稿" json:"status"`
	Result               string            `gorm:"size:255;comment:最终审批意见" json:"result"`
	FinishedAt           *time.Time        `gorm:"comment:流程结束时间" json:"finished_at"`
	ApprovalDraftMembers map[string][]uint `gorm:"column:approval_draft_members;serializer:json;type:json;comment:发起人自选审批人(仅草稿暂存，提交后注入approval_flow_json)" json:"approval_draft_members,omitempty"`
	DeptID               uint              `gorm:"index;comment:发起人当时的部门ID(快照)" json:"dept_id"`

	App *Application `gorm:"foreignKey:AppID" json:"app,omitempty"`
}

// ApprovalInstanceTask 审批任务：流程实例中每个审批节点生成的待办任务
type ApprovalInstanceTask struct {
	BaseModel
	InstanceID    uint       `gorm:"index;not null;comment:所属流程实例ID" json:"instance_id"`
	NodeID        string     `gorm:"size:64;not null;comment:流程节点ID(对应approval_flow_json中的节点id)" json:"node_id"`
	NodeName      string     `gorm:"size:64;comment:节点名称" json:"node_name"`
	Sort          int        `gorm:"default:1;comment:节点在execution_path中的序号" json:"sort"`
	AssigneeID    uint       `gorm:"index;not null;comment:审批人用户ID" json:"assignee_id"`
	Status        int        `gorm:"default:0;comment:任务状态 0待处理 1已通过 2已拒绝 3已驳回 4已转交 5已取消" json:"status"`
	Comment       string     `gorm:"size:500;comment:审批意见" json:"comment"`
	OperatedAt    *time.Time `gorm:"comment:操作时间" json:"operated_at"`
	DelegatedFrom uint       `gorm:"comment:转交来源任务ID" json:"delegated_from"`
	AddSignFrom   uint       `gorm:"default:0;comment:加签来源任务ID(0=普通任务)" json:"add_sign_from"`
	AddSignType   int        `gorm:"default:0;comment:加签类型 1-前加签 2-后加签" json:"add_sign_type"`

	Instance *ApprovalInstance `gorm:"foreignKey:InstanceID" json:"instance,omitempty"`
}

// ApprovalInstanceCreateReq 发起审批 / 保存草稿请求
// BusinessDataID 与 BusinessData 二选一：
//   - 传 BusinessDataID：业务数据已存在，直接关联
//   - 传 BusinessData：业务数据不存在，由后端自动创建后关联
type ApprovalInstanceCreateReq struct {
	AppID                uint                   `json:"app_id" validate:"required" label:"页面配置ID"`
	BusinessDataID       uint                   `json:"business_data_id" label:"业务数据ID"`
	BusinessData         map[string]interface{} `json:"business_data" label:"业务数据"`
	ApprovalDraftMembers map[string][]uint      `json:"approval_draft_members" validate:"omitempty" label:"发起人自选审批人"` // nodeId -> 用户ID列表
	// InstanceID 草稿实例ID：仅保存草稿（POST /approval/instance/draft）时使用——
	// 传 0（默认）新建草稿实例；传已有草稿实例 ID 时严格更新（Update）该草稿，不新增记录。
	// 发起审批（POST /approval/instance）忽略该字段。
	InstanceID uint `json:"instance_id" label:"草稿实例ID"`
}

// ApprovalInstanceSubmitDraftReq 从草稿提交发起审批请求
// 允许覆盖草稿暂存的发起人自选审批人；其余配置（流程快照/表单数据/执行路径）在提交时重新评估
type ApprovalInstanceSubmitDraftReq struct {
	ApprovalDraftMembers map[string][]uint `json:"approval_draft_members" validate:"omitempty" label:"发起人自选审批人"` // nodeId -> 用户ID列表，覆盖草稿暂存值
	BusinessData         map[string]interface{} `json:"business_data" validate:"omitempty" label:"业务数据"` // 发起人在编辑抽屉中修改后的表单数据，可选
}

// ApprovalInstanceResubmitReq 已驳回实例重新提交请求（发起人修改表单数据后从驳回节点继续审批）
type ApprovalInstanceResubmitReq struct {
	BusinessData map[string]interface{} `json:"business_data" validate:"omitempty" label:"业务数据"` // 发起人修改后的表单数据，可选
}

// ApprovalInstanceTaskApproveReq 审批操作请求
type ApprovalInstanceTaskApproveReq struct {
	Action       int                    `json:"action" validate:"required,oneof=1 2 3" label:"操作"` // 1-通过 2-拒绝 3-退回
	Comment      string                 `json:"comment" validate:"omitempty,max=500" label:"审批意见"`
	BusinessData map[string]interface{} `json:"business_data" validate:"omitempty" label:"业务数据"` // 审批人修改后的业务数据（字段权限 perm=2 可编辑字段），可选
}

// ApprovalInstanceTaskDelegateReq 转交请求
type ApprovalInstanceTaskDelegateReq struct {
	ToUserID uint `json:"to_user_id" validate:"required,gt=0" label:"转交目标用户ID"`
}

// ApprovalInstanceTaskAddSignReq 加签请求
type ApprovalInstanceTaskAddSignReq struct {
	UserID uint `json:"user_id" validate:"required,gt=0" label:"加签用户ID"`
	Type   int  `json:"type" validate:"required,oneof=1 2" label:"加签类型"` // 1-前加签（加签人先审，通过后原审批人再审） 2-后加签（原审批人通过后加签人再审）
}

// ApprovalCCRecord 抄送记录：抄送时机到达后写入
// ccTiming=1（审批通过后抄送）：节点被推进经过时写入；ccTiming=2（流程结束时统一抄送）：实例终结时写入
type ApprovalCCRecord struct {
	BaseModel
	InstanceID uint       `gorm:"index;not null;comment:流程实例ID" json:"instance_id"`
	NodeID     string     `gorm:"size:64;not null;comment:抄送节点ID" json:"node_id"`
	NodeName   string     `gorm:"size:64;comment:节点名称" json:"node_name"`
	UserID     uint       `gorm:"index;not null;comment:抄送用户ID" json:"user_id"`
	NotifiedAt *time.Time `gorm:"comment:抄送时间" json:"notified_at"`
}

// ApprovalInstanceTaskResult 审批任务响应 DTO：剥离 BaseModel 中的审计字段（created_at/updated_at/created_by/updated_by/deleted_at），前端无需感知。
// 注意：不输出 ApprovalInstanceTask.Instance 关联对象——该对象内嵌 BaseModel，
// 一旦任务查询加上 Preload("Instance") 就会把审计字段重新带回响应；前端亦无消费。
type ApprovalInstanceTaskResult struct {
	ID            uint       `json:"id"`
	InstanceID    uint       `json:"instance_id"`
	NodeID        string     `json:"node_id"`
	NodeName      string     `json:"node_name"`
	Sort          int        `json:"sort"`
	AssigneeID    uint       `json:"assignee_id"`
	Status        int        `json:"status"`
	Comment       string     `json:"comment"`
	OperatedAt    *time.Time `json:"operated_at"`
	DelegatedFrom uint       `json:"delegated_from"`
	AddSignFrom   uint       `json:"add_sign_from"`
	AddSignType   int        `json:"add_sign_type"`
	// CreatedBy 加签发起人（add_sign_from>0 时记录是谁发起的加签）；普通任务为审批人本人
	CreatedBy     uint       `json:"created_by"`
}

// ApprovalInstanceDetailResult 实例详情响应（含任务列表+审批记录）
type ApprovalInstanceDetailResult struct {
	ApprovalInstance
	AppName          string                       `json:"app_name"`
	CreatedByName    string                       `json:"created_by_name"`              // 发起人姓名
	BusinessData     map[string]interface{}       `json:"business_data,omitempty"`      // 业务数据（含子表）
	DetailLayoutJSON any                          `json:"detail_layout_json,omitempty"` // 详情页布局快照（只读展示）
	FormLayoutJSON   any                          `json:"form_layout_json,omitempty"`   // 表单页布局（草稿/退回编辑用，可交互）
	Tasks            []ApprovalInstanceTaskResult `json:"approval_flow_tasks,omitempty"`
	AssigneeNameMap  map[string]string            `json:"assignee_name_map,omitempty"` // 用户ID -> 姓名
	FieldPerms       []interface{}                `json:"field_perms,omitempty"`       // 当前执行节点的表单字段权限 [{field, perm}]
}

// ApprovalRecord 审批列表聚合记录（跨应用汇总动态业务数据，供我的发起/待办/已办/抄送/草稿箱使用）
type ApprovalRecord struct {
	ID             uint                   `json:"id"`                    // 动态业务数据行 ID 或任务 ID
	InstanceID     uint                   `json:"instance_id,omitempty"` // 流程实例 ID
	NodeName       string                 `json:"node_name,omitempty"`   // 当前节点名称（待办场景）
	BusinessDataID uint                   `json:"data_id,omitempty"`     // 业务数据主键 ID（供详情/审批 Drawer 使用）
	AppID          uint                   `json:"app_id"`                // 页面配置 ID
	AppCode        string                 `json:"code"`                  // 页面编码
	AppName        string                 `json:"app_name"`              // 页面名称
	ItemName       string                 `json:"item_name"`             // 申请项名称
	Status         int                    `json:"approval_status"`       // 审核状态 0草稿 1待审核 2审核中 3已通过 4不通过 5已驳回 6已作废 7已删除
	StatusName     string                 `json:"status_name"`           // 审核状态中文名
	CreatedBy      uint                   `json:"created_by"`            // 发起人 ID
	CreatedName    string                 `json:"created_name"`          // 发起人姓名
	BillNo         string                 `json:"bill_no"`               // 业务单号（提交审核时生成，展示在申请人之后）
	DeptID         uint                   `json:"dept_id"`               // 发起人部门 ID（快照）
	DeptName       string                 `json:"dept_name"`             // 发起人部门名称
	FinishedAt     *time.Time             `json:"finished_at"`           // 完成时间
	UpdatedAt      *time.Time             `json:"-"`                     // 底层记录更新时间（终态时作为完成时间，不对外输出）
	CreatedAt      *time.Time             `json:"created_at"`            // 发起时间
	Data           map[string]interface{} `json:"data,omitempty"`        // 业务数据摘要（不含系统列与审核状态）

	// 实例状态原值（仅服务端内部用于推导下面的能力标记，不对外输出）
	InstanceStatus int `json:"-"`
	// 操作能力标记：由实例状态计算，前端据此渲染「作废/撤回/编辑/删除」按钮
	CanVoid     bool `json:"can_void"`     // 可作废：仅已撤回（审核中一律只能撤回）
	CanWithdraw bool `json:"can_withdraw"` // 可撤回：进行中
	CanEdit     bool `json:"can_edit"`     // 可编辑：已驳回 / 已撤回
	CanDelete   bool `json:"can_delete"`   // 可删除：已撤回（草稿在草稿箱页面处理）
}

// ApprovalListReq 审批列表请求（分页）
type ApprovalListReq struct {
	BaseListReq
	Scope   string `json:"scope" form:"scope" validate:"required" label:"范围"`
	Keyword string `json:"keyword" form:"keyword" validate:"omitempty,max=64" label:"关键词"`
}

// Notification 站内通知
type Notification struct {
	ID         uint       `json:"id" gorm:"primaryKey"`
	UserID     uint       `json:"user_id" gorm:"index;not null;comment:接收人ID"`
	Type       int        `json:"type" gorm:"not null;comment:通知类型 1待办 2退回 3抄送 4结果"`
	Title      string     `json:"title" gorm:"size:200;comment:标题（应用名）"`
	Msg        string     `json:"msg" gorm:"size:200;comment:消息描述"`
	InstanceID uint       `json:"instance_id" gorm:"index;comment:关联审批实例ID"`
	ReadAt     *time.Time `json:"read_at" gorm:"comment:阅读时间"`
	CreatedAt  time.Time  `json:"created_at"`
}

func (Notification) TableName() string { return "oa_notifications" }
