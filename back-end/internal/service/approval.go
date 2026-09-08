package service

import (
	"errors"

	"back-end/internal/database"
	"back-end/internal/model"
)

// ApprovalCategoryList 审批分类分页列表
func ApprovalCategoryList(req *model.ApprovalCategoryListReq) ([]model.ApprovalCategory, int64, error) {
	db := database.DB.Model(&model.ApprovalCategory{})
	var total int64
	if err := db.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var list []model.ApprovalCategory
	err := db.Order("sort ASC, id ASC").Offset(req.Offset()).Limit(req.Limit()).Find(&list).Error
	return list, total, err
}

// ApprovalCategoryCreate 新增审批分类
func ApprovalCategoryCreate(curUserID uint, req *model.ApprovalCategoryCreateReq) (*model.ApprovalCategory, error) {
	// 名称唯一性校验
	var count int64
	database.DB.Unscoped().Model(&model.ApprovalCategory{}).Where("name = ?", req.Name).Count(&count)
	if count > 0 {
		return nil, errors.New("分类名称已存在")
	}
	cat := model.ApprovalCategory{
		Name: req.Name,
		Sort: req.Sort,
	}
	cat.CreatedBy, cat.UpdatedBy = curUserID, curUserID
	if err := database.DB.Create(&cat).Error; err != nil {
		return nil, err
	}
	return &cat, nil
}

// ApprovalCategoryUpdate 修改审批分类
func ApprovalCategoryUpdate(curUserID, id uint, req *model.ApprovalCategoryUpdateReq) (*model.ApprovalCategory, error) {
	var cat model.ApprovalCategory
	if err := database.DB.First(&cat, id).Error; err != nil {
		return nil, errors.New("分类不存在")
	}
	if req.Name != "" && req.Name != cat.Name {
		var count int64
		database.DB.Unscoped().Model(&model.ApprovalCategory{}).Where("name = ? AND id <> ?", req.Name, id).Count(&count)
		if count > 0 {
			return nil, errors.New("分类名称已存在")
		}
		cat.Name = req.Name
	}
	if req.Sort > 0 {
		cat.Sort = req.Sort
	}
	cat.UpdatedBy = curUserID
	if err := database.DB.Save(&cat).Error; err != nil {
		return nil, err
	}
	return &cat, nil
}

// ApprovalCategoryDelete 删除审批分类（软删除）
func ApprovalCategoryDelete(id uint) error {
	var cat model.ApprovalCategory
	if err := database.DB.First(&cat, id).Error; err != nil {
		return errors.New("分类不存在")
	}
	// 检查分类下是否还有申请项
	var itemCount int64
	database.DB.Model(&model.ApprovalItem{}).Where("category_id = ?", id).Count(&itemCount)
	if itemCount > 0 {
		return errors.New("该分类下存在申请项，请先删除申请项")
	}
	return database.DB.Delete(&model.ApprovalCategory{}, id).Error
}

// ApprovalItemList 申请项分页列表
func ApprovalItemList(req *model.ApprovalItemListReq) ([]model.ApprovalItem, int64, error) {
	db := database.DB.Model(&model.ApprovalItem{})
	if req.CategoryID > 0 {
		db = db.Where("category_id = ?", req.CategoryID)
	}
	var total int64
	if err := db.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var list []model.ApprovalItem
	err := db.Order("sort ASC, id ASC").Offset(req.Offset()).Limit(req.Limit()).Find(&list).Error
	return list, total, err
}

// ApprovalItemCreate 新增申请项
func ApprovalItemCreate(curUserID uint, req *model.ApprovalItemCreateReq) (*model.ApprovalItem, error) {
	// 校验分类是否存在
	var cat model.ApprovalCategory
	if err := database.DB.First(&cat, req.CategoryID).Error; err != nil {
		return nil, errors.New("所属分类不存在")
	}
	// 同一分类下名称唯一性校验
	var count int64
	database.DB.Unscoped().Model(&model.ApprovalItem{}).
		Where("name = ? AND category_id = ?", req.Name, req.CategoryID).Count(&count)
	if count > 0 {
		return nil, errors.New("该分类下已存在同名申请项")
	}
	item := model.ApprovalItem{
		Name:        req.Name,
		Code:        req.Code,
		CategoryID:  req.CategoryID,
		Icon:        req.Icon,
		Sort:        req.Sort,
	}
	item.CreatedBy, item.UpdatedBy = curUserID, curUserID
	if err := database.DB.Create(&item).Error; err != nil {
		return nil, err
	}
	return &item, nil
}

// ApprovalItemUpdate 修改申请项
func ApprovalItemUpdate(curUserID, id uint, req *model.ApprovalItemUpdateReq) (*model.ApprovalItem, error) {
	var item model.ApprovalItem
	if err := database.DB.First(&item, id).Error; err != nil {
		return nil, errors.New("申请项不存在")
	}
	// 若修改了分类，校验新分类是否存在
	catID := item.CategoryID
	if req.CategoryID > 0 {
		var cat model.ApprovalCategory
		if err := database.DB.First(&cat, req.CategoryID).Error; err != nil {
			return nil, errors.New("所属分类不存在")
		}
		catID = req.CategoryID
	}
	// 同分类下名称唯一性校验
	name := item.Name
	if req.Name != "" {
		name = req.Name
	}
	if (req.Name != "" && req.Name != item.Name) || (req.CategoryID > 0 && req.CategoryID != item.CategoryID) {
		var count int64
		database.DB.Unscoped().Model(&model.ApprovalItem{}).
			Where("name = ? AND category_id = ? AND id <> ?", name, catID, id).Count(&count)
		if count > 0 {
			return nil, errors.New("该分类下已存在同名申请项")
		}
	}
	if req.Name != "" {
		item.Name = req.Name
	}
	if req.Code != "" {
		item.Code = req.Code
	}
	if req.CategoryID > 0 {
		item.CategoryID = req.CategoryID
	}
	if req.Icon != "" {
		item.Icon = req.Icon
	}
	if req.Sort > 0 {
		item.Sort = req.Sort
	}
	item.UpdatedBy = curUserID
	if err := database.DB.Save(&item).Error; err != nil {
		return nil, err
	}
	return &item, nil
}

// ApprovalItemDelete 删除申请项（软删除）
func ApprovalItemDelete(id uint) error {
	var item model.ApprovalItem
	if err := database.DB.First(&item, id).Error; err != nil {
		return errors.New("申请项不存在")
	}
	return database.DB.Delete(&model.ApprovalItem{}, id).Error
}
