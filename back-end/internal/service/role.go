package service

import (
	"errors"

	"back-end/internal/database"
	"back-end/internal/model"
)

// RoleUsers GET /{APIPrefix}/roles/users 所有角色 + 每个角色下的用户列表（参考 DeptUsers 混合树）：
// 角色节点（type=role）的 Children 为该角色下的用户节点（type=user），批量查询关联避免 N+1
func RoleUsers() ([]*model.OrgNode, error) {
	var roles []model.Role
	if err := database.DB.Order("sort ASC, id ASC").Find(&roles).Error; err != nil {
		return nil, err
	}

	var users []model.User
	if err := database.DB.Preload("Profile").Order("id ASC").Find(&users).Error; err != nil {
		return nil, err
	}
	userMap := map[uint]model.User{}
	for _, u := range users {
		userMap[u.ID] = u
	}

	// 批量查询角色-用户关联（many2many join 表 oa_sys_user_role，GORM 对显式表名会加 oa_ 前缀）
	var rels []struct {
		UserID uint
		RoleID uint
	}
	if err := database.DB.Table("oa_sys_user_role").Scan(&rels).Error; err != nil {
		return nil, err
	}
	byRole := map[uint][]model.User{}
	for _, r := range rels {
		if u, ok := userMap[r.UserID]; ok {
			byRole[r.RoleID] = append(byRole[r.RoleID], u)
		}
	}

	nodes := make([]*model.OrgNode, 0, len(roles))
	for _, r := range roles {
		node := &model.OrgNode{
			Type:   model.OrgNodeTypeRole,
			ID:     r.ID,
			Name:   r.Name,
			Sort:   r.Sort,
			Status: r.Status,
		}
		for _, u := range byRole[r.ID] {
			node.Children = append(node.Children, &model.OrgNode{
				Type:     model.OrgNodeTypeUser,
				ID:       u.ID,
				Name:     userNickname(u),
				Username: u.Username,
				Email:    u.Email,
				Phone:    u.Phone,
				ParentID: r.ID,
				Status:   u.Status,
			})
		}
		nodes = append(nodes, node)
	}
	return nodes, nil
}

// RoleList 角色分页列表
func RoleList(req *model.RoleListReq) ([]model.Role, int64, error) {
	db := database.DB.Model(&model.Role{})
	if req.Name != "" {
		db = db.Where("name LIKE ?", "%"+req.Name+"%")
	}
	if req.Status != nil {
		db = db.Where("status = ?", *req.Status)
	}
	var total int64
	if err := db.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var list []model.Role
	err := db.Order("sort ASC, id ASC").Offset(req.Offset()).Limit(req.Limit()).Find(&list).Error
	return list, total, err
}

// RoleDetail 角色详情（含菜单与自定义部门）
func RoleDetail(id uint) (*model.Role, error) {
	var role model.Role
	if err := database.DB.Preload("Menus").Preload("Depts").First(&role, id).Error; err != nil {
		return nil, errors.New("角色不存在")
	}
	return &role, nil
}

// 角色名称唯一性校验：唯一索引覆盖软删除行，查重必须 Unscoped
func checkRoleNameExists(name string, excludeID uint) (bool, error) {
	db := database.DB.Unscoped().Model(&model.Role{}).Where("name = ?", name)
	if excludeID > 0 {
		db = db.Where("id <> ?", excludeID)
	}
	var count int64
	if err := db.Count(&count).Error; err != nil {
		return false, err
	}
	return count > 0, nil
}

// RoleCreate 新增角色
func RoleCreate(curUserID uint, req *model.RoleCreateReq) (*model.Role, error) {
	nameExists, err := checkRoleNameExists(req.Name, 0)
	if err != nil {
		return nil, err
	}
	if nameExists {
		return nil, errors.New("角色名称已存在")
	}
	status := req.Status
	if status == 0 {
		status = 1
	}
	scope := req.DataScope
	if scope == 0 {
		scope = model.DataScopeDept
	}
	role := model.Role{
		Name: req.Name, Sort: req.Sort,
		Status: status, DataScope: scope, Remark: req.Remark,
	}
	role.CreatedBy, role.UpdatedBy = curUserID, curUserID
	if err := database.DB.Create(&role).Error; err != nil {
		return nil, err
	}
	return &role, nil
}

// RoleUpdate 修改角色
func RoleUpdate(curUserID, id uint, req *model.RoleUpdateReq) (*model.Role, error) {
	var role model.Role
	if err := database.DB.First(&role, id).Error; err != nil {
		return nil, errors.New("角色不存在")
	}
	if req.Name != "" && req.Name != role.Name {
		nameExists, err := checkRoleNameExists(req.Name, id)
		if err != nil {
			return nil, err
		}
		if nameExists {
			return nil, errors.New("角色名称已存在")
		}
		role.Name = req.Name
	}
	if req.Sort > 0 {
		role.Sort = req.Sort
	}
	if req.Status != nil {
		role.Status = *req.Status
	}
	if req.DataScope >= 1 && req.DataScope <= model.DataScopeSelf {
		role.DataScope = req.DataScope
	}
	role.Remark = req.Remark
	role.UpdatedBy = curUserID
	if err := database.DB.Save(&role).Error; err != nil {
		return nil, err
	}
	return RoleDetail(id)
}

// RoleDelete 删除角色（软删除），内置超管角色不可删
func RoleDelete(id uint) error {
	var role model.Role
	if err := database.DB.First(&role, id).Error; err != nil {
		return errors.New("角色不存在")
	}
	if role.IsSuper {
		return errors.New("内置管理员角色不可删除")
	}
	return database.DB.Delete(&model.Role{}, id).Error
}

// RoleAssignMenus 给角色分配菜单（覆盖式）
func RoleAssignMenus(roleID uint, menuIDs []uint) error {
	var role model.Role
	if err := database.DB.First(&role, roleID).Error; err != nil {
		return errors.New("角色不存在")
	}
	var menus []*model.Menu
	database.DB.Where("id IN ?", menuIDs).Find(&menus)
	return database.DB.Model(&role).Association("Menus").Replace(menus)
}

// RoleAssignDepts 设置角色自定义数据范围绑定的部门（覆盖式）
func RoleAssignDepts(roleID uint, deptIDs []uint) error {
	var role model.Role
	if err := database.DB.First(&role, roleID).Error; err != nil {
		return errors.New("角色不存在")
	}
	var depts []*model.Dept
	if len(deptIDs) > 0 {
		database.DB.Where("id IN ?", deptIDs).Find(&depts)
	}
	return database.DB.Model(&role).Association("Depts").Replace(depts)
}
