package database

import (
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
		Name:    "init_rbac_tables",
		Up: func(db *gorm.DB) error {
			return db.AutoMigrate(
				&model.User{},
				&model.Role{},
				&model.Menu{},
				&model.Dept{},
				&MigrateVersion{},
			)
		},
		Seed: seedInitData,
	},
	// 示例：后续迭代追加增量迁移，只加表/加字段，不删数据
	// {
	// 	Version: 2,
	// 	Name:    "add_user_avatar",
	// 	Up: func(db *gorm.DB) error {
	// 		return db.Exec("ALTER TABLE oa_users ADD COLUMN avatar varchar(255) DEFAULT '' COMMENT '头像'").Error
	// 	},
	// },
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
	rootDept := model.Dept{Name: "总公司", Sort: 0, Status: 1}
	rdDept := model.Dept{Name: "研发部", ParentID: 1, Sort: 1, Status: 1}
	mkDept := model.Dept{Name: "市场部", ParentID: 1, Sort: 2, Status: 1}
	if err := db.Create(&rootDept).Error; err != nil {
		return err
	}
	rdDept.ParentID = rootDept.ID
	mkDept.ParentID = rootDept.ID
	if err := db.Create([]*model.Dept{&rdDept, &mkDept}).Error; err != nil {
		return err
	}

	// 角色
	adminRole := model.Role{Name: "超级管理员", Code: "admin", Sort: 1, Status: 1, DataScope: model.DataScopeAll, Remark: "拥有全部权限"}
	commonRole := model.Role{Name: "普通员工", Code: "common", Sort: 2, Status: 1, DataScope: model.DataScopeDept, Remark: "仅本部门数据"}
	if err := db.Create([]*model.Role{&adminRole, &commonRole}).Error; err != nil {
		return err
	}

	// 菜单树：目录 -> 页面菜单 -> 按钮/权限标识
	dir := model.Menu{Name: "系统管理", Type: model.MenuTypeDir, Path: "/system", Icon: "setting", Sort: 1, Status: 1, Hidden: 0}
	if err := db.Create(&dir).Error; err != nil {
		return err
	}
	menus := []model.Menu{
		{ParentID: dir.ID, Name: "用户管理", Type: model.MenuTypeMenu, Path: "/system/user", Sort: 1, Status: 1, Hidden: 0},
		{ParentID: dir.ID, Name: "角色管理", Type: model.MenuTypeMenu, Path: "/system/role", Sort: 2, Status: 1, Hidden: 0},
		{ParentID: dir.ID, Name: "菜单管理", Type: model.MenuTypeMenu, Path: "/system/menu", Sort: 3, Status: 1, Hidden: 0},
		{ParentID: dir.ID, Name: "部门管理", Type: model.MenuTypeMenu, Path: "/system/dept", Sort: 4, Status: 1, Hidden: 0},
	}
	if err := db.Create(&menus).Error; err != nil {
		return err
	}
	buttons := []model.Menu{
		{ParentID: menus[0].ID, Name: "用户新增", Type: model.MenuTypeButton, Perm: "system:user:add", Sort: 1, Status: 1, Hidden: 0},
		{ParentID: menus[0].ID, Name: "用户修改", Type: model.MenuTypeButton, Perm: "system:user:edit", Sort: 2, Status: 1, Hidden: 0},
		{ParentID: menus[0].ID, Name: "用户删除", Type: model.MenuTypeButton, Perm: "system:user:remove", Sort: 3, Status: 1, Hidden: 0},
	}
	if err := db.Create(&buttons).Error; err != nil {
		return err
	}

	// 超级管理员绑定全部菜单
	allMenuIDs := []uint{dir.ID}
	for _, m := range menus {
		allMenuIDs = append(allMenuIDs, m.ID)
	}
	for _, b := range buttons {
		allMenuIDs = append(allMenuIDs, b.ID)
	}
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
	return db.Model(&admin).Association("Roles").Append(&adminRole)
}

func menuPtrs(db *gorm.DB, ids []uint) []*model.Menu {
	var menus []*model.Menu
	db.Where("id IN ?", ids).Find(&menus)
	return menus
}
