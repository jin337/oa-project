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
	if err := database.DB.Preload("Roles").Preload("Dept").Preload("DeptIDs").Preload("Profile").First(&user, userID).Error; err != nil {
		return nil, errors.New("用户不存在")
	}
	// 把用户多部门 dept_ids 中的 name 替换为从根到当前部门的全路径（如「总公司/市场部/A组」）
	enrichDeptPaths(user.DeptIDs)
	if user.Dept != nil {
		// 当前主部门也按全路径返回
		if path, ok := deptFullPath(user.Dept.ID); ok {
			user.Dept.Name = path
		}
	}
	menus, perms := UserMenus(userID)
	return map[string]any{
		"user":  user,
		"menus": menus,
		"perms": perms,
	}, nil
}

// enrichDeptPaths 原地把每个部门的 Name 改写为从根到该部门的「/」分隔全路径
func enrichDeptPaths(depts []*model.Dept) {
	for _, d := range depts {
		if d == nil {
			continue
		}
		if path, ok := deptFullPath(d.ID); ok {
			d.Name = path
		}
	}
}

// deptFullPath 查全部部门并沿 ParentID 向上回溯，返回「根/父/当前」格式路径
func deptFullPath(deptID uint) (string, bool) {
	var all []*model.Dept
	if err := database.DB.Find(&all).Error; err != nil {
		return "", false
	}
	byID := make(map[uint]*model.Dept, len(all))
	for _, d := range all {
		byID[d.ID] = d
	}
	// 向上收集，避免环
	var chain []string
	cur := byID[deptID]
	seen := map[uint]bool{}
	for cur != nil && !seen[cur.ID] {
		seen[cur.ID] = true
		chain = append([]string{cur.Name}, chain...)
		if cur.ParentID == 0 {
			break
		}
		cur = byID[cur.ParentID]
	}
	if len(chain) == 0 {
		return "", false
	}
	return joinStrings(chain, "/"), true
}

func joinStrings(parts []string, sep string) string {
	out := ""
	for i, p := range parts {
		if i > 0 {
			out += sep
		}
		out += p
	}
	return out
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
