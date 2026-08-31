package service

import (
	"errors"

	"back-end/internal/database"
	"back-end/internal/model"
)

// RoleList 角色分页列表
func RoleList(req *model.RoleListReq) ([]model.Role, int64, error) {
	db := database.DB.Model(&model.Role{})
	if req.Name != "" {
		db = db.Where("name LIKE ?", "%"+req.Name+"%")
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

// 角色名称/编码唯一性校验：与用户名同理，唯一索引覆盖软删除行，查重必须 Unscoped
func checkRoleNameCodeExists(name, code string, excludeID uint) (nameExists, codeExists bool) {
	db := database.DB.Unscoped().Model(&model.Role{})
	if excludeID > 0 {
		db = db.Where("id <> ?", excludeID)
	}
	var nameCount, codeCount int64
	db.Where("name = ?", name).Count(&nameCount)
	db.Where("code = ?", code).Count(&codeCount)
	return nameCount > 0, codeCount > 0
}

// RoleCreate 新增角色
func RoleCreate(curUserID uint, req *model.RoleCreateReq) (*model.Role, error) {
	nameExists, codeExists := checkRoleNameCodeExists(req.Name, req.Code, 0)
	if nameExists || codeExists {
		return nil, errors.New("角色名称或编码已存在")
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
		Name: req.Name, Code: req.Code, Sort: req.Sort,
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
	if req.Name != "" && req.Name != role.Name || req.Code != "" && req.Code != role.Code {
		newName := role.Name
		if req.Name != "" {
			newName = req.Name
		}
		newCode := role.Code
		if req.Code != "" {
			newCode = req.Code
		}
		nameExists, codeExists := checkRoleNameCodeExists(newName, newCode, id)
		if nameExists {
			return nil, errors.New("角色名称已存在")
		}
		if codeExists {
			return nil, errors.New("角色编码已存在")
		}
		role.Name, role.Code = newName, newCode
	}
	if req.Sort > 0 {
		role.Sort = req.Sort
	}
	if req.Status == 0 || req.Status == 1 {
		role.Status = req.Status
	}
	if req.DataScope >= 1 && req.DataScope <= 4 {
		role.DataScope = req.DataScope
	}
	role.Remark = req.Remark
	role.UpdatedBy = curUserID
	if err := database.DB.Save(&role).Error; err != nil {
		return nil, err
	}
	return RoleDetail(id)
}

// RoleDelete 删除角色（软删除），内置 admin 角色不可删
func RoleDelete(id uint) error {
	var role model.Role
	if err := database.DB.First(&role, id).Error; err != nil {
		return errors.New("角色不存在")
	}
	if role.Code == "admin" {
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
