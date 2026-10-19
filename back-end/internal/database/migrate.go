package database

import (
	"errors"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"time"

	"back-end/internal/config"
	"back-end/internal/model"

	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

// MigrateVersion 迁移版本记录表：支持版本管理，可回溯升级历史
type MigrateVersion struct {
	ID        uint      `gorm:"primarykey" json:"id"`
	Version   int       `gorm:"uniqueIndex;not null" json:"version"`
	Name      string    `gorm:"size:128;not null" json:"name"`
	AppliedAt time.Time `json:"applied_at"`
}

// migration 一个迁移步骤
type migration struct {
	Version int
	Name    string
	// seed 只在 full 模式且首次执行时运行（初始化数据），AutoMigrate 本身即增量安全
	Up   func(db *gorm.DB) error
	Seed func(db *gorm.DB) error
}

// migrations 迁移清单：新增表结构变更时按版本号追加，只增不改
// 核心规则：GORM AutoMigrate 只增改、不自动删表删字段，最大程度保护数据安全
var migrations = []migration{
	{
		Version: 1,
		Name:    "init_main",
		Up: func(db *gorm.DB) error {
			return db.AutoMigrate(
				&model.User{},
				&model.UserProfile{},
				&model.Role{},
				&model.Menu{},
				&model.Dept{},
				&model.Application{},
				&model.ApplicationElement{},
				&model.ApprovalCategory{},
				&model.ApprovalCategoryItem{},
				&model.ApprovalInstance{},
				&model.ApprovalInstanceTask{},
				&model.ApprovalCCRecord{},
				&model.Notification{},
				&model.ExamineGroup{},
				&model.ApiDefinition{},
				&MigrateVersion{},
			)
		},
		Seed: seedInitData,
	},
}

// migrateLogger 迁移日志（可开关、可自定义路径）
var migrateLogger *log.Logger

func setupMigrateLog(cfg config.MigrateConfig) {
	migrateLogger = log.New(os.Stdout, "[migrate] ", log.LstdFlags)
	if cfg.LogEnable && cfg.LogPath != "" {
		_ = os.MkdirAll(filepath.Dir(cfg.LogPath), 0o755)
		if f, err := os.OpenFile(cfg.LogPath, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644); err == nil {
			migrateLogger = log.New(f, "[migrate] ", log.LstdFlags)
		}
	}
}

// Migrate 执行自动迁移：
// - enable=false 时直接跳过（生产保守）
// - mode=full：全新环境全量建表 + 初始化数据
// - mode=incremental：只增量执行未应用的版本，不灌初始数据（已有数据的表跳过 seed）
// 单个版本失败即返回错误，调用方可选择回滚/停止启动
func Migrate(db *gorm.DB, cfg config.MigrateConfig) error {
	if !cfg.Enable {
		return nil
	}
	setupMigrateLog(cfg)

	// 确保版本表存在
	if err := db.AutoMigrate(&MigrateVersion{}); err != nil {
		return fmt.Errorf("migrate version table: %w", err)
	}

	applied := map[int]bool{}
	var records []MigrateVersion
	if err := db.Find(&records).Error; err != nil {
		return fmt.Errorf("load migrate versions: %w", err)
	}
	for _, r := range records {
		applied[r.Version] = true
	}

	for _, m := range migrations {
		if applied[m.Version] {
			continue
		}
		start := time.Now()
		migrateLogger.Printf("apply migration v%d %s (mode=%s)", m.Version, m.Name, cfg.Mode)

		err := db.Transaction(func(tx *gorm.DB) error {
			// 结构变更（失败整体回滚）
			if err := m.Up(tx); err != nil {
				return fmt.Errorf("up: %w", err)
			}
			// 初始数据：仅 full 模式执行
			if cfg.Mode == "full" && m.Seed != nil {
				if err := m.Seed(tx); err != nil {
					return fmt.Errorf("seed: %w", err)
				}
			}
			return tx.Create(&MigrateVersion{Version: m.Version, Name: m.Name, AppliedAt: time.Now()}).Error
		})
		if err != nil {
			migrateLogger.Printf("migration v%d failed: %v", m.Version, err)
			return fmt.Errorf("migration v%d %s: %w", m.Version, m.Name, err)
		}
		migrateLogger.Printf("migration v%d done in %s", m.Version, time.Since(start).Round(time.Millisecond))
	}
	return nil
}

// seedInitData 初始化数据：admin 用户 + 超级管理员角色 + 基础菜单 + 基础部门
func seedInitData(db *gorm.DB) error {
	// 已存在数据则跳过（幂等）
	var userCount int64
	db.Model(&model.User{}).Count(&userCount)
	if userCount > 0 {
		return nil
	}

	// 部门树
	rootDept := model.Dept{Name: "总公司", Sort: 1, Status: 1}
	if err := db.Create(&rootDept).Error; err != nil {
		return err
	}
	childDepts := []model.Dept{
		{Name: "研发部", ParentID: rootDept.ID, Sort: 1, Status: 1},
		{Name: "市场部", ParentID: rootDept.ID, Sort: 2, Status: 1},
	}
	if err := db.Create(&childDepts).Error; err != nil {
		return err
	}

	// 角色
	adminRole := model.Role{Name: "超级管理员", Code: model.RoleCodeAdmin, Sort: 1, Status: 1, DataScope: model.DataScopeAll, Remark: "拥有全部权限"}
	if err := db.Create([]*model.Role{&adminRole}).Error; err != nil {
		return err
	}

	// 菜单树：目录 -> 页面菜单 -> 按钮/权限标识
	// 设计（与业务/前端动态路由对齐）：
	// - 审批管理：目录，下挂 申请/我的发起/我的待办/我审批的/抄送我的/草稿箱
	// - 应用配置：页面菜单（/application 应用配置页），下挂 表管理/表单元素/布局/审批管理/列表页（hidden=1）+ 管理按钮
	// - 接口管理：页面菜单（/interface 接口管理页）+ 管理按钮
	// - 用户设置：页面菜单（/profile，hidden=1，HeaderBar 头像下拉入口）
	// 所有菜单创建后统一收集 ID，一次性绑定给超级管理员（避免遗漏目录/页面/按钮导致菜单不显示）
	var allMenuIDs []uint
	collectMenuIDs := func(ms ...model.Menu) {
		for _, m := range ms {
			allMenuIDs = append(allMenuIDs, m.ID)
		}
	}

	userProfile := model.Menu{Name: "用户设置", Type: model.MenuTypeMenu, Path: "/profile", Perm: "profile", Sort: 1, Status: 1, Hidden: 1}
	approvalDir := model.Menu{Name: "审批管理", Type: model.MenuTypeDir, Path: "/approval", Perm: "approval", Sort: 2, Status: 1, Hidden: 0}
	interfacePage := model.Menu{Name: "接口管理", Type: model.MenuTypeMenu, Path: "/interface", Perm: "interface", Sort: 3, Status: 1, Hidden: 0}
	applicationPage := model.Menu{Name: "流程配置", Type: model.MenuTypeMenu, Path: "/application", Perm: "application", Sort: 4, Status: 1, Hidden: 0}
	systemDir := model.Menu{Name: "系统管理", Type: model.MenuTypeDir, Path: "/system", Perm: "system", Sort: 5, Status: 1, Hidden: 0}
	if err := db.Create([]*model.Menu{&userProfile, &approvalDir, &interfacePage, &applicationPage, &systemDir}).Error; err != nil {
		return err
	}
	collectMenuIDs(userProfile, approvalDir, interfacePage, applicationPage, systemDir)

	// 页面菜单：系统管理 / 流程配置 / 审批管理 三组合并为一个切片一次创建
	// 索引顺序：0-4 系统管理、5-9 流程配置、10-15 审批管理（按钮引用依赖此顺序）
	pageMenus := []model.Menu{
		// 系统管理
		{ParentID: systemDir.ID, Name: "用户管理", Type: model.MenuTypeMenu, Path: "/system/user", Perm: "system:user", Sort: 1, Status: 1, Hidden: 0},
		{ParentID: systemDir.ID, Name: "角色管理", Type: model.MenuTypeMenu, Path: "/system/role", Perm: "system:role", Sort: 2, Status: 1, Hidden: 0},
		{ParentID: systemDir.ID, Name: "菜单管理", Type: model.MenuTypeMenu, Path: "/system/menu", Perm: "system:menu", Sort: 3, Status: 1, Hidden: 0},
		{ParentID: systemDir.ID, Name: "部门管理", Type: model.MenuTypeMenu, Path: "/system/dept", Perm: "system:dept", Sort: 4, Status: 1, Hidden: 0},
		{ParentID: systemDir.ID, Name: "审核人员组", Type: model.MenuTypeMenu, Path: "/system/examine", Perm: "system:examine", Sort: 5, Status: 1, Hidden: 0},
		// 流程配置
		{ParentID: applicationPage.ID, Name: "表管理", Type: model.MenuTypeMenu, Path: "/application/:id/tables", Perm: "application:tables", Sort: 1, Status: 1, Hidden: 1},
		{ParentID: applicationPage.ID, Name: "表单元素管理", Type: model.MenuTypeMenu, Path: "/application/:id/elements", Perm: "application:elements", Sort: 2, Status: 1, Hidden: 1},
		{ParentID: applicationPage.ID, Name: "表单设计", Type: model.MenuTypeMenu, Path: "/application/:id/design", Perm: "application:design", Sort: 3, Status: 1, Hidden: 1},
		{ParentID: applicationPage.ID, Name: "数据", Type: model.MenuTypeMenu, Path: "/application/list", Perm: "application:list", Sort: 5, Status: 1, Hidden: 1},
		// 审批管理
		{ParentID: approvalDir.ID, Name: "申请", Type: model.MenuTypeMenu, Path: "/approval/apply", Perm: "approval:apply", Sort: 1, Status: 1, Hidden: 0},
		{ParentID: approvalDir.ID, Name: "我的发起", Type: model.MenuTypeMenu, Path: "/approval/initiated", Perm: "approval:initiated", Sort: 2, Status: 1, Hidden: 0},
		{ParentID: approvalDir.ID, Name: "我的待办", Type: model.MenuTypeMenu, Path: "/approval/todo", Perm: "approval:todo", Sort: 3, Status: 1, Hidden: 0},
		{ParentID: approvalDir.ID, Name: "我审批的", Type: model.MenuTypeMenu, Path: "/approval/workplace", Perm: "approval:workplace", Sort: 4, Status: 1, Hidden: 0},
		{ParentID: approvalDir.ID, Name: "抄送我的", Type: model.MenuTypeMenu, Path: "/approval/tome", Perm: "approval:tome", Sort: 5, Status: 1, Hidden: 0},
		{ParentID: approvalDir.ID, Name: "草稿箱", Type: model.MenuTypeMenu, Path: "/approval/drafts", Perm: "approval:drafts", Sort: 6, Status: 1, Hidden: 0},
	}
	if err := db.Create(&pageMenus).Error; err != nil {
		return err
	}
	collectMenuIDs(pageMenus...)

	// 按钮/权限标识：挂在所属页面菜单下（type=3 不参与路由，仅用于按钮级权限判断）
	buttons := []model.Menu{
		// 系统管理（pageMenus: 0 用户管理 / 1 角色管理 / 2 菜单管理 / 3 部门管理 / 4 审核人员组）
		{ParentID: pageMenus[0].ID, Name: "管理", Type: model.MenuTypeButton, Perm: "system:user:edit", Sort: 1, Status: 1, Hidden: 0},
		{ParentID: pageMenus[0].ID, Name: "详情", Type: model.MenuTypeButton, Perm: "system:user:detail", Sort: 2, Status: 1, Hidden: 0},
		{ParentID: pageMenus[0].ID, Name: "重置密码", Type: model.MenuTypeButton, Perm: "system:user:resetPwd", Sort: 3, Status: 1, Hidden: 0},
		{ParentID: pageMenus[1].ID, Name: "管理", Type: model.MenuTypeButton, Perm: "system:role:edit", Sort: 1, Status: 1, Hidden: 0},
		{ParentID: pageMenus[1].ID, Name: "分配菜单", Type: model.MenuTypeButton, Perm: "system:role:assignMenu", Sort: 2, Status: 1, Hidden: 0},
		{ParentID: pageMenus[2].ID, Name: "管理", Type: model.MenuTypeButton, Perm: "system:menu:edit", Sort: 1, Status: 1, Hidden: 0},
		{ParentID: pageMenus[3].ID, Name: "管理", Type: model.MenuTypeButton, Perm: "system:dept:edit", Sort: 1, Status: 1, Hidden: 0},
		{ParentID: pageMenus[4].ID, Name: "管理", Type: model.MenuTypeButton, Perm: "system:examine:edit", Sort: 1, Status: 1, Hidden: 0},
		// 流程配置页：管理按钮
		{ParentID: applicationPage.ID, Name: "管理", Type: model.MenuTypeButton, Perm: "application:edit", Sort: 1, Status: 1, Hidden: 0},
		// 审批-申请页：管理按钮
		{ParentID: pageMenus[10].ID, Name: "管理", Type: model.MenuTypeButton, Perm: "approval:edit", Sort: 1, Status: 1, Hidden: 0},
		// 接口管理页：管理按钮
		{ParentID: interfacePage.ID, Name: "管理", Type: model.MenuTypeButton, Perm: "interface:edit", Sort: 1, Status: 1, Hidden: 0},
	}
	if err := db.Create(&buttons).Error; err != nil {
		return err
	}
	collectMenuIDs(buttons...)

	// 超级管理员绑定全部菜单（目录 + 页面 + 按钮）
	if err := db.Model(&adminRole).Association("Menus").Append(menuPtrs(db, allMenuIDs)); err != nil {
		return err
	}

	// admin 用户（密码 admin123）
	hash, err := bcrypt.GenerateFromPassword([]byte("admin123"), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	admin := model.User{
		Username: "admin", Email: "admin@example.com",
		Password: string(hash), Status: 1, DeptID: rootDept.ID,
	}
	if err := db.Create(&admin).Error; err != nil {
		return err
	}
	if err := db.Model(&admin).Association("DeptIDs").Append(&rootDept); err != nil {
		return err
	}
	return db.Model(&admin).Association("Roles").Append(&adminRole)
}

func menuPtrs(db *gorm.DB, ids []uint) []*model.Menu {
	var menus []*model.Menu
	db.Where("id IN ?", ids).Find(&menus)
	return menus
}

// seedApiDefinitionMenu 接口管理菜单：页面菜单(/interface) + 按钮权限(interface:edit) + 绑定超级管理员（幂等）
// 新环境已由 seedInitData 统一创建，此处仅兜底：已存在则复用/跳过，不重复创建
func seedApiDefinitionMenu(db *gorm.DB) error {
	// 页面菜单：path=/interface（已存在则复用其 ID）
	var menu model.Menu
	err := db.Where("path = ?", "/interface").First(&menu).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		menu = model.Menu{Name: "接口管理", Type: model.MenuTypeMenu, Path: "/interface", Perm: "interface", Sort: 3, Status: 1, Hidden: 0}
		if err := db.Create(&menu).Error; err != nil {
			return err
		}
	} else if err != nil {
		return err
	}
	// 按钮权限：不存在才创建并绑定超级管理员
	var btnCount int64
	if err := db.Model(&model.Menu{}).Where("perm = ?", "interface:edit").Count(&btnCount).Error; err != nil {
		return err
	}
	if btnCount > 0 {
		return nil
	}
	btn := model.Menu{ParentID: menu.ID, Name: "管理", Type: model.MenuTypeButton, Perm: "interface:edit", Sort: 1, Status: 1, Hidden: 0}
	if err := db.Create(&btn).Error; err != nil {
		return err
	}
	var adminRole model.Role
	if err := db.Where("code = ?", model.RoleCodeAdmin).First(&adminRole).Error; err != nil {
		return err
	}
	return db.Model(&adminRole).Association("Menus").Append(&btn)
}
