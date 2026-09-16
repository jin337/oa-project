package service

// ============================================================
// 审批分类、申请项、审批列表聚合
// ============================================================
// 流程实例生命周期与任务流转引擎已拆分至独立文件：
//   - approval_flow.go：流程定义模型 / 解析 / 条件评估 / 执行路径 / 自选成员注入
//   - approval_member.go：审批人解析
//   - approval_instance.go：流程实例生命周期（创建/草稿/提交/详情/撤回/删除）
//   - approval_task.go：审批任务流转引擎（生成/推进/自动通过/审批/转交）
// ============================================================

import (
	"errors"
	"time"

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
	database.DB.Model(&model.ApprovalCategoryItem{}).Where("category_id = ?", id).Count(&itemCount)
	if itemCount > 0 {
		return errors.New("该分类下存在申请项，请先删除申请项")
	}
	return database.DB.Delete(&model.ApprovalCategory{}, id).Error
}

// ApprovalCategoryItemList 申请项分页列表
func ApprovalCategoryItemList(req *model.ApprovalCategoryItemListReq) ([]model.ApprovalCategoryItem, int64, error) {
	db := database.DB.Model(&model.ApprovalCategoryItem{})
	if req.CategoryID > 0 {
		db = db.Where("category_id = ?", req.CategoryID)
	}
	var total int64
	if err := db.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var list []model.ApprovalCategoryItem
	err := db.Order("sort ASC, id ASC").Offset(req.Offset()).Limit(req.Limit()).Find(&list).Error
	return list, total, err
}

// ApprovalCategoryItemCreate 新增申请项
func ApprovalCategoryItemCreate(curUserID uint, req *model.ApprovalCategoryItemCreateReq) (*model.ApprovalCategoryItem, error) {
	// 校验分类是否存在
	var cat model.ApprovalCategory
	if err := database.DB.First(&cat, req.CategoryID).Error; err != nil {
		return nil, errors.New("所属分类不存在")
	}
	// 同一分类下名称唯一性校验
	var count int64
	database.DB.Unscoped().Model(&model.ApprovalCategoryItem{}).
		Where("name = ? AND category_id = ?", req.Name, req.CategoryID).Count(&count)
	if count > 0 {
		return nil, errors.New("该分类下已存在同名申请项")
	}
	item := model.ApprovalCategoryItem{
		Name:       req.Name,
		Code:       req.Code,
		CategoryID: req.CategoryID,
		Icon:       req.Icon,
		Sort:       req.Sort,
	}
	item.CreatedBy, item.UpdatedBy = curUserID, curUserID
	if err := database.DB.Create(&item).Error; err != nil {
		return nil, err
	}
	return &item, nil
}

// ApprovalCategoryItemUpdate 修改申请项
func ApprovalCategoryItemUpdate(curUserID, id uint, req *model.ApprovalCategoryItemUpdateReq) (*model.ApprovalCategoryItem, error) {
	var item model.ApprovalCategoryItem
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
		database.DB.Unscoped().Model(&model.ApprovalCategoryItem{}).
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

// ApprovalCategoryItemDelete 删除申请项（软删除）
func ApprovalCategoryItemDelete(id uint) error {
	var item model.ApprovalCategoryItem
	if err := database.DB.First(&item, id).Error; err != nil {
		return errors.New("申请项不存在")
	}
	return database.DB.Delete(&model.ApprovalCategoryItem{}, id).Error
}

// ==================== 审批列表（跨应用聚合） ====================

// ApprovalList 审批列表跨应用聚合查询：
//   - todo      我的待办  ：从 approval_task 表查 assignee_id=当前用户 AND status=0（精确到审批人维度）
//   - initiated 我的发起  ：从 approval_instance 表查 created_by=当前用户
//   - approved  我审批的  ：保持原逻辑（查业务表终态 + updated_by=当前用户）
//   - cc        抄送我的  ：当前无抄送人字段，返回空列表（结构预留）
//   - drafts    草稿箱    ：created_by=当前用户 且 status=6 草稿（保持原逻辑）
func ApprovalList(curUserID uint, req *model.ApprovalListReq) ([]model.ApprovalRecord, int64, error) {
	switch req.Scope {
	case "todo":
		return approvalListTodo(curUserID, req)
	case "initiated":
		return approvalListInitiated(curUserID, req)
	case "cc":
		return []model.ApprovalRecord{}, 0, nil
	case "approved", "drafts":
		return approvalListFromInstances(curUserID, req)
	default:
		return nil, 0, errors.New("非法的审批列表类型")
	}
}

// approvalListTodo 待办列表：从 approval_task 表查询当前用户的待处理任务
func approvalListTodo(curUserID uint, req *model.ApprovalListReq) ([]model.ApprovalRecord, int64, error) {
	var total int64
	if err := database.DB.Model(&model.ApprovalInstanceTask{}).
		Where("assignee_id = ? AND status = ?", curUserID, model.TaskStatusPending).
		Count(&total).Error; err != nil {
		return nil, 0, err
	}

	var tasks []model.ApprovalInstanceTask
	if err := database.DB.
		Where("assignee_id = ? AND status = ?", curUserID, model.TaskStatusPending).
		Order("id DESC").
		Offset(req.Offset()).Limit(req.Limit()).
		Find(&tasks).Error; err != nil {
		return nil, 0, err
	}

	records := make([]model.ApprovalRecord, 0, len(tasks))
	for _, t := range tasks {
		var inst model.ApprovalInstance
		if err := database.DB.First(&inst, t.InstanceID).Error; err != nil {
			continue
		}
		var app model.Application
		if err := database.DB.First(&app, inst.AppID).Error; err != nil {
			continue
		}
		rec := model.ApprovalRecord{
			ID:             t.ID,
			InstanceID:     inst.ID,
			NodeName:       t.NodeName,
			BusinessDataID: inst.BusinessDataID,
			AppID:          app.ID,
			AppCode:        app.Code,
			AppName:        app.Name,
			Status:         model.ApprovalStatusReviewing,
			StatusName:     approvalStatusName(model.ApprovalStatusReviewing),
			CreatedBy:      inst.CreatedBy,
			CreatedAt:      &inst.CreatedAt,
		}
		records = append(records, rec)
	}

	fillApprovalUserInfo(records)
	return records, total, nil
}

// approvalListInitiated 我的发起列表：从 approval_instance 表查询当前用户发起的实例
func approvalListInitiated(curUserID uint, req *model.ApprovalListReq) ([]model.ApprovalRecord, int64, error) {
	var total int64
	if err := database.DB.Model(&model.ApprovalInstance{}).
		Where("created_by = ? AND deleted_at IS NULL AND status != ?", curUserID, model.InstanceStatusDraft).
		Count(&total).Error; err != nil {
		return nil, 0, err
	}

	var instances []model.ApprovalInstance
	if err := database.DB.
		Where("created_by = ? AND deleted_at IS NULL AND status != ?", curUserID, model.InstanceStatusDraft).
		Order("id DESC").
		Offset(req.Offset()).Limit(req.Limit()).
		Find(&instances).Error; err != nil {
		return nil, 0, err
	}

	records := make([]model.ApprovalRecord, 0, len(instances))
	for _, inst := range instances {
		var app model.Application
		if err := database.DB.First(&app, inst.AppID).Error; err != nil {
			continue
		}
		bizStatus := instanceStatusToBizStatus(inst.Status)
		rec := model.ApprovalRecord{
			ID:             inst.ID,
			InstanceID:     inst.ID,
			BusinessDataID: inst.BusinessDataID,
			AppID:          app.ID,
			AppCode:        app.Code,
			AppName:        app.Name,
			Status:         bizStatus,
			StatusName:     approvalStatusName(bizStatus),
			CreatedBy:      inst.CreatedBy,
			CreatedAt:      &inst.CreatedAt,
			FinishedAt:     inst.FinishedAt,
		}
		records = append(records, rec)
	}

	fillApprovalUserInfo(records)
	return records, total, nil
}

// approvalListFromInstances 从 approval_instances 表聚合审批列表（approved / drafts 场景）
func approvalListFromInstances(curUserID uint, req *model.ApprovalListReq) ([]model.ApprovalRecord, int64, error) {
	// 按 scope 确定实例状态过滤条件
	var statusFilter string
	var statusArgs []interface{}
	switch req.Scope {
	case "approved":
		statusFilter = "status IN (?, ?, ?, ?)"
		statusArgs = []interface{}{
			model.InstanceStatusPassed, model.InstanceStatusRejected,
			model.InstanceStatusReturned, model.InstanceStatusVoided,
		}
	case "drafts":
		statusFilter = "status = ?"
		statusArgs = []interface{}{model.InstanceStatusDraft}
	default:
		return nil, 0, errors.New("非法的审批列表类型")
	}

	baseWhere := "created_by = ? AND deleted_at IS NULL AND " + statusFilter
	countArgs := append([]interface{}{curUserID}, statusArgs...)

	var total int64
	if err := database.DB.Model(&model.ApprovalInstance{}).
		Where(baseWhere, countArgs...).
		Count(&total).Error; err != nil {
		return nil, 0, err
	}

	var instances []model.ApprovalInstance
	queryArgs := append([]interface{}{curUserID}, statusArgs...)
	if err := database.DB.
		Where(baseWhere, queryArgs...).
		Order("id DESC").
		Offset(req.Offset()).Limit(req.Limit()).
		Find(&instances).Error; err != nil {
		return nil, 0, err
	}

	records := make([]model.ApprovalRecord, 0, len(instances))
	for _, inst := range instances {
		var app model.Application
		if err := database.DB.First(&app, inst.AppID).Error; err != nil {
			continue
		}
		bizStatus := instanceStatusToBizStatus(inst.Status)
		rec := model.ApprovalRecord{
			ID:             inst.ID,
			InstanceID:     inst.ID,
			BusinessDataID: inst.BusinessDataID,
			AppID:          app.ID,
			AppCode:        app.Code,
			AppName:        app.Name,
			Status:         bizStatus,
			StatusName:     approvalStatusName(bizStatus),
			CreatedBy:      inst.CreatedBy,
			CreatedAt:      &inst.CreatedAt,
			FinishedAt:     inst.FinishedAt,
		}
		records = append(records, rec)
	}

	fillApprovalUserInfo(records)
	return records, total, nil
}

// fillApprovalUserInfo 批量填充审批记录的发起人信息与完成时间：
//   - 发起人姓名：一次 `WHERE id IN (...)` 批量查询 User（Preload 档案），姓名规则与部门树一致
//     （优先档案 Nickname，无档案回退 Username），使用 Unscoped 保证软删用户的历史记录仍可显示姓名
//   - 发起人部门名称：收集去重后的 dept_id，再一次 `WHERE id IN (...)` 批量查询 Dept 名称
//   - 完成时间：仅终态（已通过/不通过/已驳回/已作废）取记录 updated_at，草稿/待审核/审核中置空
func fillApprovalUserInfo(records []model.ApprovalRecord) {
	if len(records) == 0 {
		return
	}
	// 收集所有涉及的发起人 ID（去重）
	uidSet := map[uint]bool{}
	for _, r := range records {
		if r.CreatedBy > 0 {
			uidSet[r.CreatedBy] = true
		}
	}
	if len(uidSet) == 0 {
		return
	}
	uidList := make([]uint, 0, len(uidSet))
	for uid := range uidSet {
		uidList = append(uidList, uid)
	}

	// 批量查询用户（含档案）：一次 IN 查询，避免 N+1
	var users []model.User
	if err := database.DB.Unscoped().Preload("Profile").Where("id IN ?", uidList).Find(&users).Error; err != nil {
		return
	}
	userName := map[uint]string{} // 用户ID -> 姓名
	userDept := map[uint]uint{}   // 用户ID -> 部门ID
	deptIDSet := map[uint]bool{}
	for _, u := range users {
		userName[u.ID] = userNickname(u)
		userDept[u.ID] = u.DeptID
		if u.DeptID > 0 {
			deptIDSet[u.DeptID] = true
		}
	}

	// 批量查询部门名称：一次 IN 查询
	deptName := map[uint]string{}
	if len(deptIDSet) > 0 {
		deptIDList := make([]uint, 0, len(deptIDSet))
		for did := range deptIDSet {
			deptIDList = append(deptIDList, did)
		}
		var depts []model.Dept
		if err := database.DB.Unscoped().Where("id IN ?", deptIDList).Find(&depts).Error; err == nil {
			for _, d := range depts {
				deptName[d.ID] = d.Name
			}
		}
	}

	// 回填姓名、部门与完成时间
	for i := range records {
		r := &records[i]
		r.CreatedName = userName[r.CreatedBy]
		if did, ok := userDept[r.CreatedBy]; ok {
			r.DeptName = deptName[did]
		}
		switch r.Status {
		case model.ApprovalStatusPassed, model.ApprovalStatusRejected,
			model.ApprovalStatusReturned, model.ApprovalStatusVoided:
			// 终态：完成时间取底层记录更新时间
			r.FinishedAt = r.UpdatedAt
		}
	}
}

// rowUint 从动态数据行中提取 uint 字段（tinyint/int/float 等类型兼容）
func rowUint(row map[string]interface{}, key string) uint {
	switch v := row[key].(type) {
	case int8:
		return uint(v)
	case int16:
		return uint(v)
	case int32:
		return uint(v)
	case int64:
		return uint(v)
	case int:
		return uint(v)
	case uint8:
		return uint(v)
	case uint16:
		return uint(v)
	case uint32:
		return uint(v)
	case uint64:
		return uint(v)
	case uint:
		return v
	case float64:
		return uint(v)
	case nil:
		return 0
	default:
		return 0
	}
}

// rowTime 从动态数据行中提取时间字段
func rowTime(row map[string]interface{}, key string) *time.Time {
	switch v := row[key].(type) {
	case time.Time:
		t := v
		return &t
	case *time.Time:
		return v
	default:
		return nil
	}
}

// rowBizData 从动态数据行中剥离系统列与审核状态，仅保留业务字段作为列表摘要
func rowBizData(row map[string]interface{}) map[string]interface{} {
	biz := make(map[string]interface{}, len(row))
	for k, v := range row {
		switch k {
		case "id", "created_at", "updated_at", "created_by", "updated_by", "deleted_at", "parent_id":
			continue
		}
		biz[k] = v
	}
	if len(biz) == 0 {
		return nil
	}
	return biz
}
