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
	"fmt"
	"time"

	"back-end/internal/database"
	"back-end/internal/middleware"
	"back-end/internal/model"

	"gorm.io/gorm"
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

// ApprovalCategoryItemList 申请项分页列表（带发起人权限过滤）
func ApprovalCategoryItemList(curUserID uint, req *model.ApprovalCategoryItemListReq) ([]model.ApprovalCategoryItem, int64, error) {
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
	if err != nil {
		return nil, 0, err
	}

	// 管理员可以看到所有申请项
	if isAdmin(curUserID) {
		return list, total, nil
	}

	// 获取当前用户的角色和部门
	user, err := getUserWithRolesAndDepts(curUserID)
	if err != nil {
		return nil, 0, err
	}
	userRoleIDs := getUserRoleIDs(user)
	userDeptIDs := getUserDeptIDs(user)

	// 过滤申请项：只保留用户有权限发起的
	filteredList := make([]model.ApprovalCategoryItem, 0, len(list))
	for _, item := range list {
		canStart, err := canUserStartApproval(item.Code, curUserID, userRoleIDs, userDeptIDs)
		if err != nil {
			continue // 出错的项暂时跳过
		}
		if canStart {
			filteredList = append(filteredList, item)
		}
	}

	return filteredList, int64(len(filteredList)), nil
}

// getUserWithRolesAndDepts 获取用户及其角色和部门
func getUserWithRolesAndDepts(userID uint) (*model.User, error) {
	var user model.User
	if err := database.DB.Preload("Roles").Preload("DeptIDs").First(&user, userID).Error; err != nil {
		return nil, err
	}
	return &user, nil
}

// getUserRoleIDs 获取用户的角色 ID 列表
func getUserRoleIDs(user *model.User) []uint {
	roleIDs := make([]uint, 0, len(user.Roles))
	for _, role := range user.Roles {
		roleIDs = append(roleIDs, role.ID)
	}
	return roleIDs
}

// getUserDeptIDs 获取用户的部门 ID 列表
func getUserDeptIDs(user *model.User) []uint {
	deptIDs := make([]uint, 0, len(user.DeptIDs))
	for _, dept := range user.DeptIDs {
		deptIDs = append(deptIDs, dept.ID)
	}
	return deptIDs
}

// canUserStartApproval 检查用户是否有权限发起某个审批
// appCode: 应用编码
// userID: 用户 ID
// userRoleIDs: 用户的角色 ID 列表
// userDeptIDs: 用户的部门 ID 列表
func canUserStartApproval(appCode string, userID uint, userRoleIDs, userDeptIDs []uint) (bool, error) {
	// 查询应用配置
	var app model.Application
	if err := database.DB.Where("code = ?", appCode).First(&app).Error; err != nil {
		return false, err
	}

	// 如果没有配置审批流，默认允许
	if app.ApprovalFlowJSON == nil {
		return true, nil
	}

	// 解析审批流节点
	nodes, err := parseFlowNodes(app.ApprovalFlowJSON)
	if err != nil {
		return false, err
	}

	// 找到发起人节点（type=1）
	var creatorNode *flowNode
	for i := range nodes {
		if nodes[i].Type == 1 {
			creatorNode = &nodes[i]
			break
		}
	}

	// 如果没有发起人节点，默认允许
	if creatorNode == nil {
		return true, nil
	}

	// 检查发起人成员列表
	for _, member := range creatorNode.Members {
		switch member.Type {
		case 1: // 人员
			// 提取用户 ID（格式：user_1）
			var memberUserID uint
			if _, err := fmt.Sscanf(member.Key, "user_%d", &memberUserID); err == nil {
				if memberUserID == userID {
					return true, nil
				}
			}
		case 2: // 部门
			// 提取部门 ID（格式：dept_2）
			var memberDeptID uint
			if _, err := fmt.Sscanf(member.Key, "dept_%d", &memberDeptID); err == nil {
				for _, userDeptID := range userDeptIDs {
					if userDeptID == memberDeptID {
						return true, nil
					}
				}
			}
		case 3: // 角色
			// 提取角色 ID（格式：role_3）
			var memberRoleID uint
			if _, err := fmt.Sscanf(member.Key, "role_%d", &memberRoleID); err == nil {
				for _, userRoleID := range userRoleIDs {
					if userRoleID == memberRoleID {
						return true, nil
					}
				}
			}
		}
	}

	// 如果发起人成员列表为空，默认允许（向后兼容）
	if len(creatorNode.Members) == 0 {
		return true, nil
	}

	return false, nil
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

// buildApprovalRecord 从流程实例与应用构造列表聚合记录。
// 各列表作用域（我的发起/草稿箱/我审批的/抄送我的）共用，保证字段口径与排序字段一致。
func buildApprovalRecord(inst model.ApprovalInstance, app model.Application) model.ApprovalRecord {
	bizStatus := instanceStatusToBizStatus(inst.Status)
	// 根据 app.Code 关联查申请项名称
	var item model.ApprovalCategoryItem
	database.DB.Where("code = ?", app.Code).First(&item)
	return model.ApprovalRecord{
		ID:             inst.ID,
		InstanceID:     inst.ID,
		BusinessDataID: inst.BusinessDataID,
		AppID:          app.ID,
		AppCode:        app.Code,
		AppName:        app.Name,
		ItemName:       item.Name,
		Status:         bizStatus,
		StatusName:     approvalStatusName(bizStatus),
		CreatedBy:      inst.CreatedBy,
		CreatedAt:      &inst.CreatedAt,
		FinishedAt:     inst.FinishedAt,
	}
}

// applyApprovalKeyword 审批列表关键词过滤：按应用名 / 发起人用户名 / 昵称 LIKE 匹配。
// 复用 JOIN 引用 oa_approval_instances 的 app_id / created_by，适用于全部列表作用域。
func applyApprovalKeyword(db *gorm.DB, keyword string) *gorm.DB {
	if keyword == "" {
		return db
	}
	like := "%" + keyword + "%"
	return db.
		Joins("JOIN oa_applications AS ka ON ka.id = oa_approval_instances.app_id AND ka.deleted_at IS NULL").
		Joins("LEFT JOIN oa_users AS ku ON ku.id = oa_approval_instances.created_by").
		Joins("LEFT JOIN oa_user_profiles AS kp ON kp.user_id = ku.id").
		Where("(ka.name LIKE ? OR ku.username LIKE ? OR kp.nickname LIKE ?)", like, like, like)
}

// ApprovalList 审批列表跨应用聚合查询：
//   - todo      我的待办  ：从 approval_task 表查 assignee_id=当前用户 AND status=待处理
//   - initiated 我的发起  ：从 approval_instance 表查 created_by=当前用户（非草稿）
//   - approved  我审批的  ：从 approval_task 表查 assignee_id=当前用户且已处理（通过/拒绝/驳回）的任务，按实例去重
//   - cc        抄送我的  ：从实例执行路径中的抄送节点（type=3）解析抄送人，匹配当前用户
//   - drafts    草稿箱    ：created_by=当前用户 且 status=草稿
func ApprovalList(curUserID uint, req *model.ApprovalListReq) ([]model.ApprovalRecord, int64, error) {
	switch req.Scope {
	case "todo":
		return approvalListTodo(curUserID, req)
	case "initiated":
		return approvalListInitiated(curUserID, req)
	case "cc":
		return approvalListCC(curUserID, req)
	case "approved":
		return approvalListApproved(curUserID, req)
	case "drafts":
		return approvalListFromInstances(curUserID, req)
	default:
		return nil, 0, errors.New("非法的审批列表类型")
	}
}

// approvalListTodo 待办列表：从 approval_task 表查询当前用户的待处理任务
func approvalListTodo(curUserID uint, req *model.ApprovalListReq) ([]model.ApprovalRecord, int64, error) {
	// JOIN 实例表过滤已删除实例的孤儿任务，保证 total 与列表一致
	var total int64
	if err := applyApprovalKeyword(database.DB.Model(&model.ApprovalInstanceTask{}).
		Joins("JOIN oa_approval_instances ON oa_approval_instances.id = oa_approval_instance_tasks.instance_id AND oa_approval_instances.deleted_at IS NULL"),
		req.Keyword).
		Where("oa_approval_instance_tasks.assignee_id = ? AND oa_approval_instance_tasks.status = ?", curUserID, model.TaskStatusPending).
		Count(&total).Error; err != nil {
		return nil, 0, err
	}

	var tasks []model.ApprovalInstanceTask
	if err := applyApprovalKeyword(database.DB.
		Joins("JOIN oa_approval_instances ON oa_approval_instances.id = oa_approval_instance_tasks.instance_id AND oa_approval_instances.deleted_at IS NULL"),
		req.Keyword).
		Where("oa_approval_instance_tasks.assignee_id = ? AND oa_approval_instance_tasks.status = ?", curUserID, model.TaskStatusPending).
		Order("oa_approval_instance_tasks.id DESC").
		Offset(req.Offset()).Limit(req.Limit()).
		Find(&tasks).Error; err != nil {
		return nil, 0, err
	}

	records := make([]model.ApprovalRecord, 0, len(tasks))
	// 待办场景：审批节点列显示当前待办任务的审批人姓名
	nameMap := queryUserNames(map[uint]bool{curUserID: true})
	assigneeName := nameMap[curUserID]
	for _, t := range tasks {
		var inst model.ApprovalInstance
		if err := database.DB.First(&inst, t.InstanceID).Error; err != nil {
			continue
		}
		var app model.Application
		if err := database.DB.First(&app, inst.AppID).Error; err != nil {
			continue
		}
		// 查询申请项名称
		var item model.ApprovalCategoryItem
		database.DB.Where("code = ?", app.Code).First(&item)
		
		rec := model.ApprovalRecord{
			ID:             t.ID,
			InstanceID:     inst.ID,
			NodeName:       assigneeName,
			BusinessDataID: inst.BusinessDataID,
			AppID:          app.ID,
			AppCode:        app.Code,
			AppName:        app.Name,
			ItemName:       item.Name,
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
	// 数据权限：部门主管能看本部门所有人发起的审批单
	userIDs := getUserIDsByDataScope(curUserID)

	var total int64
	if err := applyApprovalKeyword(database.DB.Model(&model.ApprovalInstance{}), req.Keyword).
		Where("oa_approval_instances.created_by IN ? AND oa_approval_instances.deleted_at IS NULL AND oa_approval_instances.status != ?", userIDs, model.InstanceStatusDraft).
		Count(&total).Error; err != nil {
		return nil, 0, err
	}

	var instances []model.ApprovalInstance
	if err := applyApprovalKeyword(database.DB.Model(&model.ApprovalInstance{}), req.Keyword).
		Where("oa_approval_instances.created_by IN ? AND oa_approval_instances.deleted_at IS NULL AND oa_approval_instances.status != ?", userIDs, model.InstanceStatusDraft).
		Order("oa_approval_instances.id DESC").
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
		records = append(records, buildApprovalRecord(inst, app))
	}

	fillApprovalUserInfo(records)
	return records, total, nil
}

// approvalListFromInstances 从 approval_instances 表聚合审批列表（草稿箱场景）
func approvalListFromInstances(curUserID uint, req *model.ApprovalListReq) ([]model.ApprovalRecord, int64, error) {
	baseWhere := "oa_approval_instances.created_by = ? AND oa_approval_instances.deleted_at IS NULL AND oa_approval_instances.status = ?"
	baseArgs := []interface{}{curUserID, model.InstanceStatusDraft}

	var total int64
	if err := applyApprovalKeyword(database.DB.Model(&model.ApprovalInstance{}), req.Keyword).
		Where(baseWhere, baseArgs...).
		Count(&total).Error; err != nil {
		return nil, 0, err
	}

	var instances []model.ApprovalInstance
	if err := applyApprovalKeyword(database.DB.Model(&model.ApprovalInstance{}), req.Keyword).
		Where(baseWhere, baseArgs...).
		Order("oa_approval_instances.id DESC").
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
		records = append(records, buildApprovalRecord(inst, app))
	}

	fillApprovalUserInfo(records)
	return records, total, nil
}

// approvalListApproved 我审批的：从审批任务表查询当前用户已处理（通过/拒绝/驳回）过的任务，
// 按实例去重后聚合实例信息。实例可能仍在流转中（我处理完前序节点）或已终结。
func approvalListApproved(curUserID uint, req *model.ApprovalListReq) ([]model.ApprovalRecord, int64, error) {
	handled := []int{model.TaskStatusApproved, model.TaskStatusRejected, model.TaskStatusReturned}

	// 总数：当前用户已处理任务的去重实例数（JOIN 实例表过滤已删除实例的孤儿任务）
	var total int64
	if err := applyApprovalKeyword(database.DB.Model(&model.ApprovalInstanceTask{}).
		Joins("JOIN oa_approval_instances ON oa_approval_instances.id = oa_approval_instance_tasks.instance_id AND oa_approval_instances.deleted_at IS NULL"),
		req.Keyword).
		Where("oa_approval_instance_tasks.assignee_id = ? AND oa_approval_instance_tasks.status IN ?", curUserID, handled).
		Distinct("oa_approval_instance_tasks.instance_id").
		Count(&total).Error; err != nil {
		return nil, 0, err
	}

	// 分页：按实例分组，取每实例最近处理时间排序
	type handledGroup struct {
		InstanceID uint
		LastOp     *time.Time
	}
	var groups []handledGroup
	if err := applyApprovalKeyword(database.DB.Model(&model.ApprovalInstanceTask{}).
		Select("oa_approval_instance_tasks.instance_id, MAX(oa_approval_instance_tasks.operated_at) AS last_op").
		Joins("JOIN oa_approval_instances ON oa_approval_instances.id = oa_approval_instance_tasks.instance_id AND oa_approval_instances.deleted_at IS NULL"),
		req.Keyword).
		Where("oa_approval_instance_tasks.assignee_id = ? AND oa_approval_instance_tasks.status IN ?", curUserID, handled).
		Group("oa_approval_instance_tasks.instance_id").
		Order("last_op DESC, oa_approval_instance_tasks.instance_id DESC").
		Offset(req.Offset()).Limit(req.Limit()).
		Scan(&groups).Error; err != nil {
		return nil, 0, err
	}

	records := make([]model.ApprovalRecord, 0, len(groups))
	for _, g := range groups {
		var inst model.ApprovalInstance
		if err := database.DB.First(&inst, g.InstanceID).Error; err != nil {
			continue
		}
		var app model.Application
		if err := database.DB.First(&app, inst.AppID).Error; err != nil {
			continue
		}
		records = append(records, buildApprovalRecord(inst, app))
	}

	fillApprovalUserInfo(records)
	return records, total, nil
}

// approvalListCC 抄送我的：抄送记录表（oa_approval_cc_records）命中 ∪ 执行路径解析命中。
// 抄送时机到达后由流程引擎写入抄送记录（ccTiming=1 节点到达时 / ccTiming=2 流程终结时）；
// 执行路径解析兜底兼容存量实例（引擎写入前配置的实例），避免功能回退。
func approvalListCC(curUserID uint, req *model.ApprovalListReq) ([]model.ApprovalRecord, int64, error) {
	// 1. 抄送记录表命中的实例 ID 集合
	recordHit := map[uint]bool{}
	var ccRecords []model.ApprovalCCRecord
	if err := database.DB.Where("user_id = ?", curUserID).Find(&ccRecords).Error; err == nil {
		for _, r := range ccRecords {
			recordHit[r.InstanceID] = true
		}
	}

	// 2. 执行路径解析命中（兼容存量实例 / 抄送记录未写入的实例）
	parseHit := map[uint]bool{}
	userKey := fmt.Sprintf("\"user_%d\"", curUserID)
	var instances []model.ApprovalInstance
	if err := applyApprovalKeyword(database.DB.Model(&model.ApprovalInstance{}), req.Keyword).
		Where("oa_approval_instances.deleted_at IS NULL AND oa_approval_instances.status != ? AND oa_approval_instances.approval_flow_json LIKE ?", model.InstanceStatusDraft, "%"+userKey+"%").
		Order("oa_approval_instances.id DESC").
		Find(&instances).Error; err != nil {
		return nil, 0, err
	}
	for _, inst := range instances {
		if instanceCCContainsUser(inst, curUserID) {
			parseHit[inst.ID] = true
		}
	}

	// 3. 并集（保持 id 倒序展示：解析命中已按 id DESC，记录表命中按实例 id 插入）
	hit := make([]model.ApprovalInstance, 0, len(parseHit)+len(recordHit))
	seen := map[uint]bool{}
	addInst := func(id uint) {
		if seen[id] {
			return
		}
		seen[id] = true
		var inst model.ApprovalInstance
		if err := database.DB.First(&inst, id).Error; err == nil && !inst.DeletedAt.Valid {
			hit = append(hit, inst)
		}
	}
	// 先解析命中（已按 id DESC），再补记录表命中的实例（按 id DESC 排序后追加）
	for _, inst := range instances {
		if parseHit[inst.ID] {
			addInst(inst.ID)
		}
	}
	var recordInstances []model.ApprovalInstance
	if len(recordHit) > 0 {
		ids := make([]uint, 0, len(recordHit))
		for id := range recordHit {
			ids = append(ids, id)
		}
		applyApprovalKeyword(database.DB.Model(&model.ApprovalInstance{}), req.Keyword).Where("oa_approval_instances.id IN ?", ids).Order("oa_approval_instances.id DESC").Find(&recordInstances)
	}
	for _, inst := range recordInstances {
		addInst(inst.ID)
	}

	total := int64(len(hit))
	start := req.Offset()
	if start > len(hit) {
		start = len(hit)
	}
	end := start + req.Limit()
	if end > len(hit) {
		end = len(hit)
	}

	records := make([]model.ApprovalRecord, 0, end-start)
	for _, inst := range hit[start:end] {
		var app model.Application
		if err := database.DB.First(&app, inst.AppID).Error; err != nil {
			continue
		}
		records = append(records, buildApprovalRecord(inst, app))
	}

	fillApprovalUserInfo(records)
	return records, total, nil
}

// instanceCCContainsUser 判断实例执行路径中是否有抄送节点（type=3）将当前用户列为抄送人
func instanceCCContainsUser(inst model.ApprovalInstance, userID uint) bool {
	pathIDs := inst.ExecutionPath
	nodes, err := parseFlowNodes(inst.ApprovalFlowJSON)
	if err != nil {
		return false
	}
	for _, pid := range pathIDs {
		node := findNodeByID(nodes, pid)
		if node == nil || node.Type != 3 {
			continue
		}
		ids, err := resolveMembersUserIDs(node.Members)
		if err != nil {
			continue
		}
		for _, id := range ids {
			if id == userID {
				return true
			}
		}
	}
	return false
}

// fillApprovalUserInfo 批量填充审批记录的发起人信息与完成时间：
//   - 发起人姓名：一次 `WHERE id IN (...)` 批量查询 User（Preload 档案），姓名规则与部门树一致
//     （优先档案 Nickname，无档案回退 Username），使用 Unscoped 保证软删用户的历史记录仍可显示姓名
//   - 发起人部门名称：收集去重后的 dept_id，再一次 `WHERE id IN (...)` 批量查询 Dept 名称
//   - 完成时间：仅终态（已通过/不通过/已驳回/已作废）取记录 updated_at，草稿/待审核/审核中置空
// queryUserNames 批量查询用户姓名（用户ID -> 姓名，含已删除用户），列表/详情共用
func queryUserNames(uidSet map[uint]bool) map[uint]string {
	nameMap := make(map[uint]string, len(uidSet))
	if len(uidSet) == 0 {
		return nameMap
	}
	uidList := make([]uint, 0, len(uidSet))
	for uid := range uidSet {
		uidList = append(uidList, uid)
	}
	var users []model.User
	if err := database.DB.Unscoped().Preload("Profile").Where("id IN ?", uidList).Find(&users).Error; err != nil {
		return nameMap
	}
	for _, u := range users {
		nameMap[u.ID] = userNickname(u)
	}
	return nameMap
}

// queryDeptNames 批量查询部门名称（部门ID -> 名称，含已删除部门），列表回填部门列共用
func queryDeptNames(deptIDSet map[uint]bool) map[uint]string {
	deptName := map[uint]string{}
	if len(deptIDSet) == 0 {
		return deptName
	}
	deptIDList := make([]uint, 0, len(deptIDSet))
	for did := range deptIDSet {
		deptIDList = append(deptIDList, did)
	}
	var depts []model.Dept
	if err := database.DB.Unscoped().Where("id IN ?", deptIDList).Find(&depts).Error; err != nil {
		return deptName
	}
	for _, d := range depts {
		deptName[d.ID] = d.Name
	}
	return deptName
}

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

	// 批量查询用户（姓名）：GORM IN 子句需要 slice
	userName := queryUserNames(uidSet)
	// 收集实例表中的部门 ID（快照）
	deptIDSet := map[uint]bool{}
	for i := range records {
		if records[i].DeptID > 0 {
			deptIDSet[records[i].DeptID] = true
		}
	}
	// 旧数据兼容：实例表 DeptID 为 0 的，实时查用户表部门
	needUserDept := []uint{}
	for i := range records {
		if records[i].DeptID == 0 {
			needUserDept = append(needUserDept, records[i].CreatedBy)
		}
	}
	userDept := map[uint]uint{}
	if len(needUserDept) > 0 {
		var users []model.User
		if err := database.DB.Unscoped().Select("id, dept_id").Where("id IN ?", needUserDept).Find(&users).Error; err == nil {
			for _, u := range users {
				userDept[u.ID] = u.DeptID
				if u.DeptID > 0 {
					deptIDSet[u.DeptID] = true
				}
			}
		}
	}
	deptName := queryDeptNames(deptIDSet)

	// 回填姓名与部门（完成时间直接使用实例表 finished_at，由 finishInstance 在流程终结时写入，
	// 历史逻辑曾以底层记录更新时间覆盖，但列表记录未携带 UpdatedAt 导致终态完成时间被置空）
	for i := range records {
		r := &records[i]
		r.CreatedName = userName[r.CreatedBy]
		// 优先用实例表快照的部门 ID
		if r.DeptID > 0 {
			r.DeptName = deptName[r.DeptID]
		} else if did, ok := userDept[r.CreatedBy]; ok {
			// 旧数据兼容：实时查用户表部门
			r.DeptName = deptName[did]
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


// getUserIDsByDataScope 根据当前用户数据范围获取可见的用户 ID 列表
// 部门主管能看本部门所有人，普通用户只能看自己
func getUserIDsByDataScope(curUserID uint) []uint {
	var user model.User
	if err := database.DB.Preload("Roles").First(&user, curUserID).Error; err != nil {
		return []uint{curUserID}
	}

	// 检查是否有"全部数据"或"本部门及以下"权限
	showAll := false
	showDeptAndBelow := false
	for _, role := range user.Roles {
		if role.Status != 1 {
			continue
		}
		switch role.DataScope {
		case model.DataScopeAll:
			showAll = true
		case model.DataScopeDeptAndBelow:
			showDeptAndBelow = true
		}
	}

	if showAll {
		// 全部数据：返回所有用户
		var users []model.User
		database.DB.Find(&users)
		ids := make([]uint, 0, len(users))
		for _, u := range users {
			ids = append(ids, u.ID)
		}
		return ids
	}

	if showDeptAndBelow {
		// 本部门及以下：返回本部门及子部门的所有用户
		deptIDs := middleware.CollectDeptAndBelow(user.DeptID)
		var users []model.User
		database.DB.Where("dept_id IN ?", deptIDs).Find(&users)
		ids := make([]uint, 0, len(users))
		for _, u := range users {
			ids = append(ids, u.ID)
		}
		return ids
	}

	// 默认：只看自己
	return []uint{curUserID}
}

