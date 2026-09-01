package model

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
	DeptID   uint   `gorm:"index;comment:所属部门ID(属于 dept_id)" json:"dept_id"`

	Roles []*Role `gorm:"many2many:sys_user_role;" json:"roles,omitempty"`
	Dept  *Dept   `gorm:"foreignKey:DeptID" json:"dept,omitempty"`
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
	Sort      int    `gorm:"default:0;comment:排序" json:"sort"`
	Status    int    `gorm:"default:1;comment:状态 1启用 0停用" json:"status"`
	DataScope int    `gorm:"default:3;comment:数据范围 1全部 2自定义 3仅本部门 4本部门及下级" json:"data_scope"`
	Remark    string `gorm:"size:255;comment:备注" json:"remark"`

	Menus []*Menu `gorm:"many2many:sys_role_menu;" json:"menus,omitempty"`
	Depts []*Dept `gorm:"many2many:sys_role_dept;" json:"depts,omitempty"` // 自定义数据范围绑定的部门
}

// 数据范围常量
const (
	DataScopeAll          = 1 // 全部数据
	DataScopeCustom       = 2 // 自定义部门
	DataScopeDept         = 3 // 仅本部门
	DataScopeDeptAndBelow = 4 // 本部门及下级
)

// Menu 导航/菜单：目录、页面菜单、按钮/权限标识，parent_id 自关联成树
type Menu struct {
	BaseModel
	ParentID uint   `gorm:"index;default:0;comment:父级ID(包含子节点 parent_id)" json:"parent_id"`
	Name     string `gorm:"size:64;not null;comment:菜单名称" json:"name"`
	Type     int    `gorm:"comment:类型 1目录 2页面菜单 3按钮/权限标识" json:"type"`
	Path     string `gorm:"size:255;comment:路由地址" json:"path"`
	Perm     string `gorm:"size:128;index;comment:权限标识 如 system:user:add" json:"perm"`
	Icon     string `gorm:"size:64;comment:图标" json:"icon"`
	Sort     int    `gorm:"default:0;comment:排序" json:"sort"`
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
	Leader   string `gorm:"size:64;comment:负责人" json:"leader"`
	Sort     int    `gorm:"default:0;comment:排序" json:"sort"`
	Status   int    `gorm:"default:1;comment:状态 1启用 0停用" json:"status"`

	Children []*Dept `gorm:"foreignKey:ParentID" json:"children,omitempty"`
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
	DeptID   uint   `json:"dept_id" validate:"omitempty" label:"部门ID"`
	RoleIDs  []uint `json:"role_ids" validate:"omitempty" label:"角色ID列表"`
}

type UserUpdateReq struct {
	Username string `json:"username" validate:"omitempty,min=2,max=64" label:"用户名"`
	Email    string `json:"email" validate:"omitempty,email" label:"邮箱"`
	Phone    string `json:"phone" validate:"omitempty,max=20" label:"手机号"`
	Status   *int   `json:"status" validate:"omitempty,oneof=0 1" label:"状态"`
	DeptID   uint   `json:"dept_id" validate:"omitempty" label:"部门ID"`
	Password string `json:"password" validate:"omitempty,min=6,max=64" label:"密码"`
}

type UserListReq struct {
	BaseListReq
	Username string `json:"username" form:"username" validate:"omitempty" label:"用户名"`
	DeptID   uint   `json:"dept_id" form:"dept_id" validate:"omitempty" label:"部门ID"`
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
	DataScope int    `json:"data_scope" validate:"omitempty,oneof=1 2 3 4" label:"数据范围"`
	Remark    string `json:"remark" validate:"omitempty,max=255" label:"备注"`
}

type RoleUpdateReq struct {
	Name      string `json:"name" validate:"omitempty,min=2,max=64" label:"角色名称"`
	Code      string `json:"code" validate:"omitempty,min=2,max=64" label:"角色编码"`
	Sort      int    `json:"sort" validate:"omitempty" label:"排序"`
	Status    int    `json:"status" validate:"omitempty,oneof=0 1" label:"状态"`
	DataScope int    `json:"data_scope" validate:"omitempty,oneof=1 2 3 4" label:"数据范围"`
	Remark    string `json:"remark" validate:"omitempty,max=255" label:"备注"`
}

type RoleListReq struct {
	BaseListReq
	Name string `json:"name" form:"name" validate:"omitempty" label:"角色名称"`
}

type AssignMenusReq struct {
	MenuIDs []uint `json:"menu_ids" validate:"required,min=1" label:"菜单ID列表"`
}

type AssignDeptsReq struct {
	DeptIDs []uint `json:"dept_ids" validate:"omitempty" label:"部门ID列表"`
}

type MenuCreateReq struct {
	ParentID uint   `json:"parent_id" validate:"omitempty" label:"父级ID"`
	Name     string `json:"name" validate:"required,min=1,max=64" label:"菜单名称"`
	Type     int    `json:"type" validate:"required,oneof=1 2 3" label:"菜单类型"`
	Path     string `json:"path" validate:"omitempty,max=255" label:"路由地址"`
	Perm     string `json:"perm" validate:"omitempty,max=128" label:"权限标识"`
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
	Icon     string `json:"icon" validate:"omitempty,max=64" label:"图标"`
	Sort     int    `json:"sort" validate:"omitempty" label:"排序"`
	Status   int    `json:"status" validate:"omitempty,oneof=0 1" label:"状态"`
	Hidden   int    `json:"hidden" validate:"omitempty,oneof=0 1" label:"是否隐藏"`
}

type DeptCreateReq struct {
	ParentID uint   `json:"parent_id" validate:"omitempty" label:"父级ID"`
	Name     string `json:"name" validate:"required,min=1,max=64" label:"部门名称"`
	Leader   string `json:"leader" validate:"omitempty,max=64" label:"负责人"`
	Sort     int    `json:"sort" validate:"omitempty" label:"排序"`
	Status   int    `json:"status" validate:"omitempty,oneof=0 1" label:"状态"`
}

type DeptUpdateReq struct {
	ParentID uint   `json:"parent_id" validate:"omitempty" label:"父级ID"`
	Name     string `json:"name" validate:"omitempty,min=1,max=64" label:"部门名称"`
	Leader   string `json:"leader" validate:"omitempty,max=64" label:"负责人"`
	Sort     int    `json:"sort" validate:"omitempty" label:"排序"`
	Status   int    `json:"status" validate:"omitempty,oneof=0 1" label:"状态"`
}

type DeptListReq struct {
	Name string `json:"name" form:"name" validate:"omitempty" label:"部门名称"`
}
