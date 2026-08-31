package service

import (
	"errors"

	"back-end/internal/database"
	"back-end/internal/middleware"
	"back-end/internal/model"

	"golang.org/x/crypto/bcrypt"
)

// LoginResult 登录返回
type LoginResult struct {
	Token string `json:"token"`
	User  *model.User `json:"user"`
}

// Login 用户名+密码登录
func Login(req *model.LoginReq) (*LoginResult, error) {
	var user model.User
	if err := database.DB.Preload("Roles").Where("username = ?", req.Username).First(&user).Error; err != nil {
		return nil, errors.New("用户名或密码错误")
	}
	if user.Status != 1 {
		return nil, errors.New("账号已被停用")
	}
	if err := bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(req.Password)); err != nil {
		return nil, errors.New("用户名或密码错误")
	}
	token, err := middleware.GenerateToken(user.ID, user.Username)
	if err != nil {
		return nil, errors.New("生成登录凭证失败")
	}
	return &LoginResult{Token: token, User: &user}, nil
}

// Profile 当前登录用户资料：用户 + 角色 + 部门 + 菜单树 + 权限标识
func Profile(userID uint) (map[string]any, error) {
	var user model.User
	if err := database.DB.Preload("Roles").Preload("Dept").First(&user, userID).Error; err != nil {
		return nil, errors.New("用户不存在")
	}
	menus, perms := UserMenus(userID)
	return map[string]any{
		"user":  user,
		"menus": menus,
		"perms": perms,
	}, nil
}

// UserMenus 用户可见菜单树 + 权限标识集合（角色并集，仅启用）
func UserMenus(userID uint) ([]*model.Menu, []string) {
	var user model.User
	if err := database.DB.Preload("Roles.Menus", "status = 1").First(&user, userID).Error; err != nil {
		return nil, nil
	}
	seen := map[uint]*model.Menu{}
	perms := map[string]bool{}
	var roots []*model.Menu
	for _, role := range user.Roles {
		if role.Status != 1 {
			continue
		}
		for _, m := range role.Menus {
			if m.Perm != "" {
				perms[m.Perm] = true
			}
			if _, ok := seen[m.ID]; !ok {
				seen[m.ID] = m
			}
		}
	}
	all := make([]*model.Menu, 0, len(seen))
	for _, m := range seen {
		all = append(all, m)
	}
	roots = buildMenuTree(all, 0)
	permList := make([]string, 0, len(perms))
	for p := range perms {
		permList = append(permList, p)
	}
	return roots, permList
}

// buildMenuTree 内存组装菜单树
func buildMenuTree(menus []*model.Menu, parentID uint) []*model.Menu {
	var nodes []*model.Menu
	for _, m := range menus {
		if m.ParentID == parentID {
			m.Children = buildMenuTree(menus, m.ID)
			nodes = append(nodes, m)
		}
	}
	return nodes
}
