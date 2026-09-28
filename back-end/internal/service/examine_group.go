package service

import (
	"errors"

	"back-end/internal/database"
	"back-end/internal/model"
)

// attachExamineGroupApprovers 把各组审核人用户ID批量翻译为 {id, name, username} 列表（避免 N+1）
func attachExamineGroupApprovers(groups []*model.ExamineGroup) error {
	seen := map[uint]bool{}
	var ids []uint
	for _, g := range groups {
		for _, uid := range g.ApproverIDs {
			if !seen[uid] {
				seen[uid] = true
				ids = append(ids, uid)
			}
		}
	}
	if len(ids) == 0 {
		return nil
	}
	var users []model.User
	if err := database.DB.Preload("Profile").Where("id IN ?", ids).Find(&users).Error; err != nil {
		return err
	}
	byID := map[uint]model.User{}
	for _, u := range users {
		byID[u.ID] = u
	}
	for _, g := range groups {
		approvers := make([]model.ExamineGroupApprover, 0, len(g.ApproverIDs))
		for _, uid := range g.ApproverIDs {
			u, ok := byID[uid]
			if !ok {
				continue
			}
			approvers = append(approvers, model.ExamineGroupApprover{
				ID:       u.ID,
				Name:     userNickname(u),
				Username: u.Username,
			})
		}
		g.Approvers = approvers
	}
	return nil
}

// ExamineGroupList 审核人员组分页列表
func ExamineGroupList(req *model.ExamineGroupListReq) ([]model.ExamineGroup, int64, error) {
	db := database.DB.Model(&model.ExamineGroup{})
	if req.Name != "" {
		db = db.Where("name LIKE ?", "%"+req.Name+"%")
	}
	var total int64
	if err := db.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var list []model.ExamineGroup
	err := db.Order("sort ASC, id ASC").Offset(req.Offset()).Limit(req.Limit()).Find(&list).Error
	if err != nil {
		return nil, 0, err
	}
	ptrs := make([]*model.ExamineGroup, 0, len(list))
	for i := range list {
		ptrs = append(ptrs, &list[i])
	}
	if err := attachExamineGroupApprovers(ptrs); err != nil {
		return nil, 0, err
	}
	return list, total, nil
}

// ExamineGroupDetail 审核人员组详情（含审核人信息）
func ExamineGroupDetail(id uint) (*model.ExamineGroup, error) {
	var group model.ExamineGroup
	if err := database.DB.First(&group, id).Error; err != nil {
		return nil, errors.New("审核人员组不存在")
	}
	if err := attachExamineGroupApprovers([]*model.ExamineGroup{&group}); err != nil {
		return nil, err
	}
	return &group, nil
}

// 名称/编号唯一性校验：与角色同理，唯一索引覆盖软删除行，查重必须 Unscoped
func checkExamineGroupNameCodeExists(name, code string, excludeID uint) (nameExists, codeExists bool) {
	db := database.DB.Unscoped().Model(&model.ExamineGroup{})
	if excludeID > 0 {
		db = db.Where("id <> ?", excludeID)
	}
	var nameCount, codeCount int64
	db.Where("name = ?", name).Count(&nameCount)
	db.Where("code = ?", code).Count(&codeCount)
	return nameCount > 0, codeCount > 0
}

// ExamineGroupCreate 新增审核人员组
func ExamineGroupCreate(curUserID uint, req *model.ExamineGroupCreateReq) (*model.ExamineGroup, error) {
	nameExists, codeExists := checkExamineGroupNameCodeExists(req.Name, req.Code, 0)
	if nameExists || codeExists {
		return nil, errors.New("审核人员组名称或编号已存在")
	}
	status := req.Status
	if status == 0 {
		status = 1
	}
	group := model.ExamineGroup{
		Name:        req.Name,
		Code:        req.Code,
		ApproverIDs: req.ApproverIDs,
		Sort:        req.Sort,
		Status:      status,
	}
	group.CreatedBy, group.UpdatedBy = curUserID, curUserID
	if err := database.DB.Create(&group).Error; err != nil {
		return nil, err
	}
	return ExamineGroupDetail(group.ID)
}

// ExamineGroupUpdate 修改审核人员组
func ExamineGroupUpdate(curUserID, id uint, req *model.ExamineGroupUpdateReq) (*model.ExamineGroup, error) {
	var group model.ExamineGroup
	if err := database.DB.First(&group, id).Error; err != nil {
		return nil, errors.New("审核人员组不存在")
	}
	if req.Name != "" && req.Name != group.Name || req.Code != "" && req.Code != group.Code {
		newName := group.Name
		if req.Name != "" {
			newName = req.Name
		}
		newCode := group.Code
		if req.Code != "" {
			newCode = req.Code
		}
		nameExists, codeExists := checkExamineGroupNameCodeExists(newName, newCode, id)
		if nameExists {
			return nil, errors.New("审核人员组名称已存在")
		}
		if codeExists {
			return nil, errors.New("编号已存在")
		}
		group.Name, group.Code = newName, newCode
	}
	if req.ApproverIDs != nil {
		group.ApproverIDs = req.ApproverIDs
	}
	if req.Sort > 0 {
		group.Sort = req.Sort
	}
	if req.Status == 0 || req.Status == 1 {
		group.Status = req.Status
	}
	group.UpdatedBy = curUserID
	if err := database.DB.Save(&group).Error; err != nil {
		return nil, err
	}
	return ExamineGroupDetail(id)
}

// ExamineGroupDelete 删除审核人员组（软删除）
func ExamineGroupDelete(id uint) error {
	var group model.ExamineGroup
	if err := database.DB.First(&group, id).Error; err != nil {
		return errors.New("审核人员组不存在")
	}
	return database.DB.Delete(&model.ExamineGroup{}, id).Error
}
