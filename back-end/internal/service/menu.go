package service

import (
	"errors"

	"back-end/internal/database"
	"back-end/internal/model"
)

// MenuTree 全量菜单树（目录/页面菜单/按钮，parent_id 自关联）
func MenuTree(req *model.DeptListReq) ([]*model.Menu, error) {
	db := database.DB.Model(&model.Menu{})
	if req.Name != "" {
		db = db.Where("name LIKE ?", "%"+req.Name+"%")
	}
	var list []*model.Menu
	if err := db.Order("sort ASC, id ASC").Find(&list).Error; err != nil {
		return nil, err
	}
	return buildMenuTree(list, 0), nil
}

// MenuDetail 菜单详情
func MenuDetail(id uint) (*model.Menu, error) {
	var menu model.Menu
	if err := database.DB.First(&menu, id).Error; err != nil {
		return nil, errors.New("菜单不存在")
	}
	return &menu, nil
}

// MenuCreate 新增菜单
func MenuCreate(curUserID uint, req *model.MenuCreateReq) (*model.Menu, error) {
	if req.ParentID > 0 {
		if err := checkMenuExists(req.ParentID); err != nil {
			return nil, err
		}
	}
	if req.Perm != "" {
		var count int64
		database.DB.Model(&model.Menu{}).Where("perm = ?", req.Perm).Count(&count)
		if count > 0 {
			return nil, errors.New("权限标识已存在")
		}
	}
	status := req.Status
	if status == 0 {
		status = 1
	}
	menu := model.Menu{
		ParentID: req.ParentID, Name: req.Name, Type: req.Type,
		Path: req.Path, Perm: req.Perm, Icon: req.Icon, Sort: req.Sort, Status: status,
	}
	menu.CreatedBy, menu.UpdatedBy = curUserID, curUserID
	if err := database.DB.Create(&menu).Error; err != nil {
		return nil, err
	}
	return &menu, nil
}

// MenuUpdate 修改菜单（校验不能把父级设为自己或自己的子级）
func MenuUpdate(curUserID, id uint, req *model.MenuUpdateReq) (*model.Menu, error) {
	var menu model.Menu
	if err := database.DB.First(&menu, id).Error; err != nil {
		return nil, errors.New("菜单不存在")
	}
	if req.ParentID > 0 {
		if req.ParentID == id || isDescendant(req.ParentID, id) {
			return nil, errors.New("父级菜单不能为自身或其子级")
		}
		if err := checkMenuExists(req.ParentID); err != nil {
			return nil, err
		}
		menu.ParentID = req.ParentID
	}
	if req.Name != "" {
		menu.Name = req.Name
	}
	if req.Type >= 1 && req.Type <= 3 {
		menu.Type = req.Type
	}
	menu.Path = req.Path
	menu.Perm = req.Perm
	menu.Icon = req.Icon
	if req.Sort > 0 {
		menu.Sort = req.Sort
	}
	if req.Status == 0 || req.Status == 1 {
		menu.Status = req.Status
	}
	menu.UpdatedBy = curUserID
	if err := database.DB.Save(&menu).Error; err != nil {
		return nil, err
	}
	return &menu, nil
}

// MenuDelete 删除菜单，存在子节点时禁止删除
func MenuDelete(id uint) error {
	var count int64
	database.DB.Model(&model.Menu{}).Where("parent_id = ?", id).Count(&count)
	if count > 0 {
		return errors.New("存在子菜单，请先删除子菜单")
	}
	return database.DB.Delete(&model.Menu{}, id).Error
}

func checkMenuExists(id uint) error {
	var count int64
	database.DB.Model(&model.Menu{}).Where("id = ?", id).Count(&count)
	if count == 0 {
		return errors.New("父级菜单不存在")
	}
	return nil
}

// isDescendant 判断 target 是否是 rootID 的后代节点
func isDescendant(target, rootID uint) bool {
	queue := []uint{rootID}
	for len(queue) > 0 {
		var children []model.Menu
		database.DB.Where("parent_id IN ?", queue).Find(&children)
		queue = queue[:0]
		for _, c := range children {
			if c.ID == target {
				return true
			}
			queue = append(queue, c.ID)
		}
	}
	return false
}
