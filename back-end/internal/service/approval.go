package service

import (
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	"back-end/internal/database"
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
//   - drafts    草稿箱    ：created_by=当前用户 且 status=0 草稿（保持原逻辑）
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

// ============================================================
// 条件评估引擎（与前端 DynamicFlowView.jsx 的 evaluateBranch 逻辑一致）
// ============================================================

// flowNode 审批流节点（从 flow_snapshot_json 反序列化后的结构）
type flowNode struct {
	ID           string        `json:"id"`
	Type         int           `json:"type"` // 1-发起人 2-审批人 3-抄送人 4-条件分支
	Label        string        `json:"label"`
	Members      []flowMember  `json:"members"`
	ApproverType int           `json:"approverType"` // 1-指定人员 2-指定角色 3-发起人自选
	SelfSelect   int           `json:"selfSelect"`   // 1-单选 2-多选
	Strategy     int           `json:"strategy"`     // 1-依次审批 2-会签 3-或签
	EmptyHandler int           `json:"emptyHandler"` // 审批人为空处理
	EmptyMembers []flowMember  `json:"emptyMembers"`
	Permissions  []int         `json:"permissions"`
	FieldPerms   []interface{} `json:"fieldPerms"`
	CCTiming     int           `json:"ccTiming"`
	Relation     int           `json:"relation"` // 1-且(AND) 2-或(OR)
	Branches     []flowBranch  `json:"branches"`
}

// flowMember 审批成员
type flowMember struct {
	Type  int    `json:"type"` // 1-人员 2-部门 3-角色
	Key   string `json:"key"`  // 如 user_1 / dept_2 / role_3
	Label string `json:"label"`
}

// flowBranch 条件分支
type flowBranch struct {
	ID        string     `json:"id"`
	Label     string     `json:"label"`
	IsDefault bool       `json:"isDefault"`
	Rules     []flowRule `json:"rules"`
	Children  []flowNode `json:"children"`
}

// flowRule 条件规则
type flowRule struct {
	Field    string `json:"field"`     // 表单字段标识（field_key）
	TableKey string `json:"table_key"` // 关联物理表（子表字段时有值）
	Operator int    `json:"operator"`  // 1-大于 2-小于 3-等于 4-不等于 5-包含 6-不包含
	Value    string `json:"value"`     // 条件值
}

// parseFlowNodes 解析 flow_snapshot_json 为节点数组（兼容 JSON 字符串与已解析结构）
func parseFlowNodes(raw any) ([]flowNode, error) {
	if raw == nil {
		return nil, nil
	}
	// 已经是 []interface{}（GORM JSON 反序列化后的结构）
	b, err := json.Marshal(raw)
	if err != nil {
		return nil, err
	}
	var nodes []flowNode
	if err := json.Unmarshal(b, &nodes); err != nil {
		return nil, err
	}
	return nodes, nil
}

// injectSelfSelectIntoNodes 将发起人自选审批人注入到 flow_snapshot 节点的 members 中，
// 使 approverType=3 的节点在快照中即包含最终确定的审批人，消除对 self_select_members_json 的运行时依赖。
// 同时查询用户姓名填充 Label 字段，确保前端可直接渲染。
func injectSelfSelectIntoNodes(nodes []flowNode, selfSelectMembers map[string][]uint) []flowNode {
	if len(selfSelectMembers) == 0 {
		return nodes
	}
	// 收集所有需要查询的用户 ID
	uidSet := map[uint]bool{}
	for _, uids := range selfSelectMembers {
		for _, uid := range uids {
			uidSet[uid] = true
		}
	}
	// 批量查询用户姓名
	uidList := make([]uint, 0, len(uidSet))
	for uid := range uidSet {
		uidList = append(uidList, uid)
	}
	nameMap := map[uint]string{}
	if len(uidList) > 0 {
		var users []model.User
		if err := database.DB.Unscoped().Preload("Profile").Where("id IN ?", uidList).Find(&users).Error; err == nil {
			for _, u := range users {
				nameMap[u.ID] = userNickname(u)
			}
		}
	}
	// 注入成员到 approverType=3 节点
	for i := range nodes {
		if nodes[i].ApproverType == 3 {
			if uids, ok := selfSelectMembers[nodes[i].ID]; ok && len(uids) > 0 {
				members := make([]flowMember, 0, len(uids))
				for _, uid := range uids {
					members = append(members, flowMember{
						Type:  1,
						Key:   fmt.Sprintf("user_%d", uid),
						Label: nameMap[uid],
					})
				}
				nodes[i].Members = members
			}
		}
	}
	return nodes
}

// resolveFieldValue 获取规则字段在表单数据中的实际值（与前端 resolveFieldValue 一致）
func resolveFieldValue(rule flowRule, formData map[string]interface{}) interface{} {
	if formData == nil {
		return nil
	}
	tk := rule.TableKey
	if tk != "" {
		if tableData, ok := formData[tk]; ok {
			if rows, ok := tableData.([]interface{}); ok && len(rows) > 0 {
				// 子表字段：多行按合计（数值）或首行值参与判断
				var values []interface{}
				for _, row := range rows {
					if rowMap, ok := row.(map[string]interface{}); ok {
						if v, exists := rowMap[rule.Field]; exists && v != nil && v != "" {
							values = append(values, v)
						}
					}
				}
				if len(values) > 0 {
					// 尝试数值合计
					sum := float64(0)
					allNum := true
					for _, v := range values {
						if n, ok := toFloat64(v); ok {
							sum += n
						} else {
							allNum = false
							break
						}
					}
					if allNum {
						return sum
					}
					return values[0]
				}
			}
		}
		// 主表字段回退
		if v, ok := formData[rule.Field]; ok {
			return v
		}
		return nil
	}
	return formData[rule.Field]
}

// toFloat64 尝试将任意类型转为 float64
func toFloat64(v interface{}) (float64, bool) {
	switch n := v.(type) {
	case int:
		return float64(n), true
	case int8:
		return float64(n), true
	case int16:
		return float64(n), true
	case int32:
		return float64(n), true
	case int64:
		return float64(n), true
	case uint:
		return float64(n), true
	case uint8:
		return float64(n), true
	case uint16:
		return float64(n), true
	case uint32:
		return float64(n), true
	case uint64:
		return float64(n), true
	case float64:
		return n, true
	case float32:
		return float64(n), true
	case string:
		if f, err := strconv.ParseFloat(n, 64); err == nil {
			return f, true
		}
	case json.Number:
		if f, err := n.Float64(); err == nil {
			return f, true
		}
	}
	return 0, false
}

// toStr 将值转为字符串
func toStr(v interface{}) string {
	if v == nil {
		return ""
	}
	return fmt.Sprintf("%v", v)
}

// compareEqual 宽松等值比较（与前端 compareEqual 一致）
func compareEqual(a, b interface{}) bool {
	sa, sb := toStr(a), toStr(b)
	na, oka := toFloat64(a)
	nb, okb := toFloat64(b)
	if sa != "" && sb != "" && oka && okb {
		return na == nb
	}
	return sa == sb
}

// evaluateRule 单条规则评估（operator: 1-大于 2-小于 3-等于 4-不等于 5-包含 6-不包含）
func evaluateRule(rule flowRule, formData map[string]interface{}) bool {
	actual := resolveFieldValue(rule, formData)
	cond := rule.Value
	switch rule.Operator {
	case 1: // 大于
		na, oka := toFloat64(actual)
		nc, okc := toFloat64(cond)
		if oka && okc {
			return na > nc
		}
		return false
	case 2: // 小于
		na, oka := toFloat64(actual)
		nc, okc := toFloat64(cond)
		if oka && okc {
			return na < nc
		}
		return false
	case 3: // 等于
		return compareEqual(actual, cond)
	case 4: // 不等于
		return !compareEqual(actual, cond)
	case 5: // 包含
		return strings.Contains(toStr(actual), toStr(cond))
	case 6: // 不包含
		return !strings.Contains(toStr(actual), toStr(cond))
	default:
		return false
	}
}

// evaluateBranch 分支命中评估：无条件（默认）分支视为命中；
// 有条件分支按节点 relation 综合判断——1-且(AND) 需全部规则满足，2-或(OR) 任一规则满足即可
func evaluateBranch(branch flowBranch, node flowNode, formData map[string]interface{}) bool {
	rules := branch.Rules
	if len(rules) == 0 {
		return true // 默认分支
	}
	relation := node.Relation
	if relation == 2 {
		// OR：任一规则满足
		for _, r := range rules {
			if evaluateRule(r, formData) {
				return true
			}
		}
		return false
	}
	// AND：全部规则满足
	for _, r := range rules {
		if !evaluateRule(r, formData) {
			return false
		}
	}
	return true
}

// pickHitBranches 命中分支选择（与前端 pickHitBranches 一致）
func pickHitBranches(node flowNode, formData map[string]interface{}) []flowBranch {
	branches := node.Branches
	var normalBranches []flowBranch
	var defaultBranch *flowBranch
	for i := range branches {
		if branches[i].IsDefault {
			defaultBranch = &branches[i]
		} else {
			normalBranches = append(normalBranches, branches[i])
		}
	}

	var hitBranches []flowBranch
	if formData != nil && len(formData) > 0 {
		for _, b := range normalBranches {
			if evaluateBranch(b, node, formData) {
				hitBranches = append(hitBranches, b)
			}
		}
	}
	if len(hitBranches) > 0 {
		return hitBranches
	}
	if defaultBranch != nil {
		return []flowBranch{*defaultBranch}
	}
	if len(normalBranches) > 0 {
		return []flowBranch{normalBranches[0]}
	}
	return nil
}

// flattenExecutionPath 条件评估后的命中节点 ID 链（只收集 type=2 审批人节点）
// 与前端 DynamicFlowView 的 flattenedNodes 逻辑一致：隐藏发起人(type=1)、穿透条件分支(type=4)
func flattenExecutionPath(nodes []flowNode, formData map[string]interface{}) []string {
	var path []string
	var walk func(list []flowNode)
	walk = func(list []flowNode) {
		for _, n := range list {
			if n.Type == 1 {
				continue // 跳过发起人
			}
			if n.Type == 4 {
				// 条件分支：穿透展开命中分支的 children
				hitBranches := pickHitBranches(n, formData)
				for _, b := range hitBranches {
					walk(b.Children)
				}
				continue
			}
			if n.Type == 2 || n.Type == 3 {
				path = append(path, n.ID)
			}
		}
	}
	walk(nodes)
	return path
}

// findNodeByID 从节点树（含条件分支嵌套）中按 ID 查找节点
func findNodeByID(nodes []flowNode, nodeID string) *flowNode {
	for i := range nodes {
		if nodes[i].ID == nodeID {
			return &nodes[i]
		}
		if nodes[i].Type == 4 {
			for j := range nodes[i].Branches {
				if found := findNodeByID(nodes[i].Branches[j].Children, nodeID); found != nil {
					return found
				}
			}
		}
	}
	return nil
}

// ============================================================
// 审批人解析
// ============================================================

// resolveApproverUserIDs 将节点的成员配置解析为实际用户 ID 列表
func resolveApproverUserIDs(node flowNode, selfSelectUserIDs []uint) ([]uint, error) {
	// 发起人自选：直接使用前端传入的用户 ID
	if node.ApproverType == 3 {
		if len(selfSelectUserIDs) > 0 {
			return selfSelectUserIDs, nil
		}
		// 未选择时按 emptyHandler 处理
		return resolveEmptyHandler(node)
	}

	// 从 members 中提取用户 ID
	var userIDs []uint
	for _, m := range node.Members {
		switch m.Type {
		case 1: // 人员：key 格式 "user_123"
			uid := parseMemberID(m.Key)
			if uid > 0 {
				userIDs = append(userIDs, uid)
			}
		case 2: // 部门：一期暂不展开为部门下用户，仅作为标记
			// 后续可扩展为查询部门下所有用户
		case 3: // 角色：展开为角色下所有用户
			rid := parseMemberID(m.Key)
			if rid > 0 {
				ids, err := getUserIDsByRole(rid)
				if err != nil {
					return nil, err
				}
				userIDs = append(userIDs, ids...)
			}
		}
	}

	// 去重
	userIDs = uniqueUintSlice(userIDs)

	if len(userIDs) == 0 {
		return resolveEmptyHandler(node)
	}
	return userIDs, nil
}

// resolveEmptyHandler 审批人为空时的兜底处理
func resolveEmptyHandler(node flowNode) ([]uint, error) {
	switch node.EmptyHandler {
	case 1: // 自动通过：返回空，由调用方判断
		return nil, nil
	case 4: // 指定人员
		var ids []uint
		for _, m := range node.EmptyMembers {
			uid := parseMemberID(m.Key)
			if uid > 0 {
				ids = append(ids, uid)
			}
		}
		return ids, nil
	default: // 2-自动拒绝 / 3-转交流程管理员：一期暂按自动拒绝处理
		return nil, nil
	}
}

// parseMemberID 从成员 key（如 "user_123" / "role_45"）中提取数字 ID
func parseMemberID(key string) uint {
	parts := strings.SplitN(key, "_", 2)
	if len(parts) < 2 {
		return 0
	}
	id, err := strconv.ParseUint(parts[1], 10, 64)
	if err != nil {
		return 0
	}
	return uint(id)
}

// getUserIDsByRole 查询角色下所有用户 ID
func getUserIDsByRole(roleID uint) ([]uint, error) {
	var userIDs []uint
	err := database.DB.Table("sys_user_role").
		Where("role_id = ?", roleID).
		Pluck("user_id", &userIDs).Error
	return userIDs, err
}

// uniqueUintSlice 去重
func uniqueUintSlice(ids []uint) []uint {
	seen := map[uint]bool{}
	var result []uint
	for _, id := range ids {
		if !seen[id] {
			seen[id] = true
			result = append(result, id)
		}
	}
	return result
}

// ============================================================
// 流程实例核心操作
// ============================================================

// resolveBusinessDataID 解析业务数据 ID：
//   - BusinessDataID > 0 且 BusinessData 非空：更新已有业务数据并返回 ID
//   - BusinessDataID > 0 且 BusinessData 为空：直接返回 ID
//   - BusinessDataID == 0 且 BusinessData 非空：自动创建业务数据行并返回新 ID
func resolveBusinessDataID(curUserID uint, req *model.ApprovalInstanceCreateReq) (uint, error) {
	if req.BusinessDataID > 0 {
		// 同时传了 business_data，先更新已有业务数据
		if len(req.BusinessData) > 0 {
			if err := ApplicationDataUpdate(req.AppID, req.BusinessDataID, curUserID, req.BusinessData); err != nil {
				return 0, fmt.Errorf("更新业务数据失败: %w", err)
			}
		}
		return req.BusinessDataID, nil
	}
	if len(req.BusinessData) == 0 {
		return 0, errors.New("business_data_id 与 business_data 必须提供其一")
	}
	// 自动创建业务数据行
	dataID, err := ApplicationDataCreate(req.AppID, curUserID, req.BusinessData)
	if err != nil {
		return 0, fmt.Errorf("自动创建业务数据失败: %w", err)
	}
	req.BusinessDataID = dataID
	return dataID, nil
}

// ApprovalInstanceCreate 发起审批：
//  1. 校验业务数据存在
//  2. 快照审批流配置 + 表单数据
//  3. 评估条件分支，得到执行路径
//  4. 创建流程实例
//  5. 为首个审批节点生成任务
func ApprovalInstanceCreate(curUserID uint, req *model.ApprovalInstanceCreateReq) (*model.ApprovalInstance, error) {
	// 0. 解析业务数据 ID（支持自动创建）
	if _, err := resolveBusinessDataID(curUserID, req); err != nil {
		return nil, err
	}

	// 1. 校验应用配置
	app, err := ApplicationDetail(req.AppID)
	if err != nil {
		return nil, err
	}
	if !isValidTableName(app.TableName) {
		return nil, errors.New("非法的表名")
	}
	if app.ApprovalFlowJSON == nil {
		return nil, errors.New("该应用未配置审批流程")
	}

	// 2. 校验业务数据存在
	real := bizTableName(app.TableName)
	if _, err := queryColumnSet(real); err != nil {
		return nil, fmt.Errorf("查询表结构失败: %w", err)
	}

	var cnt int64
	if err := database.DB.Raw("SELECT COUNT(*) FROM `"+real+"` WHERE `id` = ? AND `deleted_at` IS NULL", req.BusinessDataID).Scan(&cnt).Error; err != nil {
		return nil, err
	}
	if cnt == 0 {
		return nil, errors.New("业务数据不存在")
	}

	// 3. 解析流程节点 & 读取业务数据快照
	nodes, err := parseFlowNodes(app.ApprovalFlowJSON)
	if err != nil {
		return nil, fmt.Errorf("解析审批流配置失败: %w", err)
	}
	if len(nodes) == 0 {
		return nil, errors.New("审批流配置为空")
	}

	// 读取业务数据快照（含子表）
	formData, err := ApplicationDataDetail(req.AppID, req.BusinessDataID, &model.ApplicationDataDetailReq{})
	if err != nil {
		return nil, fmt.Errorf("读取业务数据快照失败: %w", err)
	}

	// 4. 评估条件分支，得到执行路径
	execPath := flattenExecutionPath(nodes, formData)
	if len(execPath) == 0 {
		return nil, errors.New("审批流评估后无审批节点，请检查流程配置")
	}
	execPathJSON, _ := json.Marshal(execPath)

	// 5. 将发起人自选审批人注入流程快照（approverType=3 节点的 members 直接包含最终选人）
	injectedNodes := injectSelfSelectIntoNodes(nodes, req.SelfSelectMembers)
	injectedFlowJSON, _ := json.Marshal(injectedNodes)

	// 6. 创建流程实例（事务）
	var instance model.ApprovalInstance
	err = database.DB.Transaction(func(tx *gorm.DB) error {
		instance = model.ApprovalInstance{
			AppID:            req.AppID,
			BusinessTable:    app.TableName,
			BusinessDataID:   req.BusinessDataID,
			FlowSnapshotJSON: injectedFlowJSON,
			FormDataSnapshot: formData,
			ExecutionPath:    string(execPathJSON),
			CurrentNodeIdx:   0,
			Status:           model.InstanceStatusRunning,
		}
		instance.CreatedBy, instance.UpdatedBy = curUserID, curUserID
		if err := tx.Create(&instance).Error; err != nil {
			return err
		}

		// 7. 为首个审批节点生成任务（自选成员已在快照 members 中，无需额外传入）
		if err := generateTasksForCurrentNode(tx, &instance, injectedNodes, curUserID); err != nil {
			return err
		}

		return nil
	})
	if err != nil {
		return nil, err
	}
	return &instance, nil
}

// ApprovalInstanceSaveDraft 保存审批草稿：
//  1. 校验业务数据存在
//  2. 快照审批流配置 + 表单数据 + 评估执行路径
//  3. 创建流程实例（状态=草稿），不生成审批任务
//  4. 暂存发起人自选审批人，供后续从草稿提交时使用
func ApprovalInstanceSaveDraft(curUserID uint, req *model.ApprovalInstanceCreateReq) (*model.ApprovalInstance, error) {
	// 0. 解析业务数据 ID（支持自动创建）
	if _, err := resolveBusinessDataID(curUserID, req); err != nil {
		return nil, err
	}

	// 1. 校验应用配置
	app, err := ApplicationDetail(req.AppID)
	if err != nil {
		return nil, err
	}
	if !isValidTableName(app.TableName) {
		return nil, errors.New("非法的表名")
	}
	if app.ApprovalFlowJSON == nil {
		return nil, errors.New("该应用未配置审批流程")
	}

	// 2. 校验业务数据存在
	real := bizTableName(app.TableName)
	if _, err := queryColumnSet(real); err != nil {
		return nil, fmt.Errorf("查询表结构失败: %w", err)
	}

	var cnt int64
	if err := database.DB.Raw("SELECT COUNT(*) FROM `"+real+"` WHERE `id` = ? AND `deleted_at` IS NULL", req.BusinessDataID).Scan(&cnt).Error; err != nil {
		return nil, err
	}
	if cnt == 0 {
		return nil, errors.New("业务数据不存在")
	}

	// 3. 解析流程节点 & 读取业务数据快照 & 评估执行路径
	nodes, err := parseFlowNodes(app.ApprovalFlowJSON)
	if err != nil {
		return nil, fmt.Errorf("解析审批流配置失败: %w", err)
	}
	if len(nodes) == 0 {
		return nil, errors.New("审批流配置为空")
	}

	formData, err := ApplicationDataDetail(req.AppID, req.BusinessDataID, &model.ApplicationDataDetailReq{})
	if err != nil {
		return nil, fmt.Errorf("读取业务数据快照失败: %w", err)
	}

	execPath := flattenExecutionPath(nodes, formData)
	execPathJSON, _ := json.Marshal(execPath)

	// 将发起人自选审批人注入流程快照（approverType=3 节点的 members 直接包含最终选人）
	injectedNodes := injectSelfSelectIntoNodes(nodes, req.SelfSelectMembers)
	injectedFlowBytes, _ := json.Marshal(injectedNodes)

	// 4. 创建草稿实例
	instance := model.ApprovalInstance{
		AppID:                 req.AppID,
		BusinessTable:         app.TableName,
		BusinessDataID:        req.BusinessDataID,
		FlowSnapshotJSON:      injectedFlowBytes,
		FormDataSnapshot:      formData,
		ExecutionPath:         string(execPathJSON),
		CurrentNodeIdx:        0,
		Status:                model.InstanceStatusDraft,
		SelfSelectMembersJSON: req.SelfSelectMembers,
	}
	instance.CreatedBy, instance.UpdatedBy = curUserID, curUserID
	if err := database.DB.Create(&instance).Error; err != nil {
		return nil, err
	}
	return &instance, nil
}

// ApprovalInstanceSubmitDraft 从草稿提交发起审批：
//  1. 校验草稿实例存在、状态=草稿、属于当前用户
//  2. 重新读取业务数据、重新评估执行路径（业务数据可能已修改）
//  3. 更新实例状态为进行中，生成首个审批节点任务
func ApprovalInstanceSubmitDraft(curUserID uint, instanceID uint, req *model.ApprovalInstanceSubmitDraftReq) (*model.ApprovalInstance, error) {
	// 1. 加载草稿实例
	var instance model.ApprovalInstance
	if err := database.DB.First(&instance, instanceID).Error; err != nil {
		return nil, errors.New("流程实例不存在")
	}
	if instance.Status != model.InstanceStatusDraft {
		return nil, errors.New("仅草稿状态的实例可提交")
	}
	if instance.CreatedBy != curUserID {
		return nil, errors.New("只能提交自己发起的草稿")
	}

	// 2. 校验应用配置
	app, err := ApplicationDetail(instance.AppID)
	if err != nil {
		return nil, err
	}
	if !isValidTableName(app.TableName) {
		return nil, errors.New("非法的表名")
	}

	real := bizTableName(app.TableName)
	if _, err := queryColumnSet(real); err != nil {
		return nil, fmt.Errorf("查询表结构失败: %w", err)
	}

	// 校验业务数据存在
	var cnt int64
	if err := database.DB.Raw("SELECT COUNT(*) FROM `"+real+"` WHERE `id` = ? AND `deleted_at` IS NULL", instance.BusinessDataID).Scan(&cnt).Error; err != nil {
		return nil, err
	}
	if cnt == 0 {
		return nil, errors.New("业务数据不存在")
	}

	// 3. 重新解析流程节点 & 读取业务数据 & 评估执行路径
	nodes, err := parseFlowNodes(app.ApprovalFlowJSON)
	if err != nil {
		return nil, fmt.Errorf("解析审批流配置失败: %w", err)
	}
	if len(nodes) == 0 {
		return nil, errors.New("审批流配置为空")
	}

	formData, err := ApplicationDataDetail(instance.AppID, instance.BusinessDataID, &model.ApplicationDataDetailReq{})
	if err != nil {
		return nil, fmt.Errorf("读取业务数据快照失败: %w", err)
	}

	execPath := flattenExecutionPath(nodes, formData)
	if len(execPath) == 0 {
		return nil, errors.New("审批流评估后无审批节点，请检查流程配置")
	}
	execPathJSON, _ := json.Marshal(execPath)

	// 合并发起人自选审批人：提交时传入 > 草稿暂存
	selfSelectMembers := instance.SelfSelectMembersJSON
	if req.SelfSelectMembers != nil {
		selfSelectMembers = req.SelfSelectMembers
	}

	// 5. 将发起人自选审批人注入流程快照（approverType=3 节点的 members 直接包含最终选人）
	injectedNodes := injectSelfSelectIntoNodes(nodes, selfSelectMembers)
	injectedFlowBytes, _ := json.Marshal(injectedNodes)
	injectedFlowJSON := string(injectedFlowBytes)

	// 序列化表单数据快照（map 需转为 JSON 字符串，SQL 驱动不支持 map 类型参数）
	formDataBytes, _ := json.Marshal(formData)
	formDataJSON := string(formDataBytes)

	// 6. 事务：更新实例 + 生成任务 + 更新业务表
	err = database.DB.Transaction(func(tx *gorm.DB) error {
		instance.FlowSnapshotJSON = injectedFlowJSON
		instance.FormDataSnapshot = formData
		instance.ExecutionPath = string(execPathJSON)
		instance.CurrentNodeIdx = 0
		instance.Status = model.InstanceStatusRunning
		instance.SelfSelectMembersJSON = nil // 已注入快照，清除独立字段

		if err := tx.Model(&instance).Updates(map[string]interface{}{
			"flow_snapshot_json":       injectedFlowJSON,
			"form_data_snapshot":       formDataJSON,
			"execution_path":           string(execPathJSON),
			"current_node_idx":         0,
			"status":                   model.InstanceStatusRunning,
			"self_select_members_json": nil, // 已注入快照，清除
			"updated_by":               curUserID,
		}).Error; err != nil {
			return err
		}

		// 生成首个审批节点任务（自选成员已在快照 members 中，无需额外传入）
		if err := generateTasksForCurrentNode(tx, &instance, injectedNodes, curUserID); err != nil {
			return err
		}

		return nil
	})
	if err != nil {
		return nil, err
	}
	return &instance, nil
}

// generateTasksForCurrentNode 为当前节点生成审批任务
func generateTasksForCurrentNode(tx *gorm.DB, instance *model.ApprovalInstance, allNodes []flowNode, curUserID uint) error {
	// 解析执行路径
	var pathNodeIDs []string
	if err := json.Unmarshal([]byte(instance.ExecutionPath), &pathNodeIDs); err != nil {
		return err
	}
	idx := instance.CurrentNodeIdx
	if idx >= len(pathNodeIDs) {
		return nil // 所有节点已处理
	}

	nodeID := pathNodeIDs[idx]
	node := findNodeByID(allNodes, nodeID)
	if node == nil {
		return fmt.Errorf("流程节点 %s 不存在", nodeID)
	}

	// 解析审批人（approverType=3 的自选成员已在提交时注入 node.Members）
	userIDs, err := resolveApproverUserIDs(*node, nil)
	if err != nil {
		return fmt.Errorf("解析审批人失败: %w", err)
	}

	// 审批人为空且 emptyHandler=1（自动通过）：直接跳过该节点
	if len(userIDs) == 0 {
		return handleAutoPassNode(tx, instance, allNodes, curUserID)
	}

	// 按审批方式生成任务
	strategy := node.Strategy
	if strategy == 0 {
		strategy = 1 // 默认依次审批
	}

	switch strategy {
	case 1: // 依次审批：只生成第一个人的任务
		task := model.ApprovalInstanceTask{
			InstanceID: instance.ID,
			NodeID:     nodeID,
			NodeName:   node.Label,
			Sort:       idx,
			AssigneeID: userIDs[0],
			Status:     model.TaskStatusPending,
		}
		task.CreatedBy, task.UpdatedBy = curUserID, curUserID
		if err := tx.Create(&task).Error; err != nil {
			return err
		}
	case 2, 3: // 会签 / 或签：同时生成所有人的任务
		for _, uid := range userIDs {
			task := model.ApprovalInstanceTask{
				InstanceID: instance.ID,
				NodeID:     nodeID,
				NodeName:   node.Label,
				Sort:       idx,
				AssigneeID: uid,
				Status:     model.TaskStatusPending,
			}
			task.CreatedBy, task.UpdatedBy = curUserID, curUserID
			if err := tx.Create(&task).Error; err != nil {
				return err
			}
		}
	}

	return nil
}

// handleAutoPassNode 审批人为空且自动通过：推进到下一个节点
func handleAutoPassNode(tx *gorm.DB, instance *model.ApprovalInstance, allNodes []flowNode, curUserID uint) error {
	// 推进到下一个节点
	instance.CurrentNodeIdx++
	var pathNodeIDs []string
	if err := json.Unmarshal([]byte(instance.ExecutionPath), &pathNodeIDs); err != nil {
		return err
	}

	if instance.CurrentNodeIdx >= len(pathNodeIDs) {
		// 所有节点都已处理完 -> 流程通过
		return finishInstance(tx, instance, model.InstanceStatusPassed, "自动通过", curUserID)
	}

	// 更新实例节点索引
	if err := tx.Model(instance).Updates(map[string]interface{}{
		"current_node_idx": instance.CurrentNodeIdx,
	}).Error; err != nil {
		return err
	}

	// 递归生成新节点的任务
	return generateTasksForCurrentNode(tx, instance, allNodes, curUserID)
}

// finishInstance 完成流程实例（通过/拒绝/驳回），同步更新业务表状态
func finishInstance(tx *gorm.DB, instance *model.ApprovalInstance, status int, result string, curUserID uint) error {
	now := time.Now()
	instance.Status = status
	instance.Result = result
	instance.FinishedAt = &now

	if err := tx.Model(instance).Updates(map[string]interface{}{
		"status":      status,
		"result":      result,
		"finished_at": now,
		"updated_by":  curUserID,
	}).Error; err != nil {
		return err
	}

	// 取消所有待处理任务
	if err := tx.Model(&model.ApprovalInstanceTask{}).
		Where("instance_id = ? AND status = ?", instance.ID, model.TaskStatusPending).
		Updates(map[string]interface{}{
			"status":     model.TaskStatusCancelled,
			"updated_at": now,
			"updated_by": curUserID,
		}).Error; err != nil {
		return err
	}

	return nil
}

// instanceStatusToBizStatus 实例状态 -> ApprovalStatus 映射（供 ApprovalRecord.Status 使用，前端 ApprovalStatusTag 依赖此映射）
func instanceStatusToBizStatus(instanceStatus int) int {
	switch instanceStatus {
	case model.InstanceStatusPassed:
		return model.ApprovalStatusPassed
	case model.InstanceStatusRejected:
		return model.ApprovalStatusRejected
	case model.InstanceStatusReturned:
		return model.ApprovalStatusReturned
	case model.InstanceStatusVoided:
		return model.ApprovalStatusVoided
	case model.InstanceStatusWithdrawn:
		return model.ApprovalStatusDraft
	case model.InstanceStatusDraft:
		return model.ApprovalStatusDraft
	default:
		return model.ApprovalStatusReviewing
	}
}

// ============================================================
// 审批操作（同意/拒绝/驳回/转交/撤回）
// ============================================================

// ApprovalTaskApprove 执行审批操作：
//  1. 校验任务存在、状态=待处理、assignee_id=当前用户
//  2. 更新任务状态
//  3. 按审批方式判断节点是否通过
//  4. 节点通过后推进到下一节点或结束流程
func ApprovalTaskApprove(curUserID uint, instanceID, taskID uint, req *model.ApprovalInstanceTaskApproveReq) error {
	return database.DB.Transaction(func(tx *gorm.DB) error {
		// 1. 校验任务
		var task model.ApprovalInstanceTask
		if err := tx.First(&task, taskID).Error; err != nil {
			return errors.New("审批任务不存在")
		}
		if task.InstanceID != instanceID {
			return errors.New("任务与实例不匹配")
		}
		if task.Status != model.TaskStatusPending {
			return errors.New("该任务已处理")
		}
		if task.AssigneeID != curUserID {
			return errors.New("您不是该任务的审批人")
		}

		// 2. 校验实例
		var instance model.ApprovalInstance
		if err := tx.First(&instance, instanceID).Error; err != nil {
			return errors.New("流程实例不存在")
		}
		if instance.Status != model.InstanceStatusRunning {
			return errors.New("该流程已结束")
		}

		now := time.Now()

		// 3. 更新任务状态
		task.Status = req.Action
		task.Comment = req.Comment
		task.OperatedAt = &now
		task.UpdatedBy = curUserID
		if err := tx.Save(&task).Error; err != nil {
			return err
		}

		// 4. 按操作类型处理流转
		switch req.Action {
		case model.TaskStatusApproved: // 通过
			return handleNodeApproval(tx, &instance, &task, curUserID)
		case model.TaskStatusRejected: // 拒绝
			return finishInstance(tx, &instance, model.InstanceStatusRejected, req.Comment, curUserID)
		case model.TaskStatusReturned: // 驳回
			return finishInstance(tx, &instance, model.InstanceStatusReturned, req.Comment, curUserID)
		default:
			return errors.New("非法的操作类型")
		}
	})
}

// handleNodeApproval 审批通过后判断节点是否完成，推进到下一节点或结束流程
func handleNodeApproval(tx *gorm.DB, instance *model.ApprovalInstance, task *model.ApprovalInstanceTask, curUserID uint) error {
	// 解析流程快照
	nodes, err := parseFlowNodes(instance.FlowSnapshotJSON)
	if err != nil {
		return err
	}

	node := findNodeByID(nodes, task.NodeID)
	if node == nil {
		return errors.New("流程节点不存在")
	}

	strategy := node.Strategy
	if strategy == 0 {
		strategy = 1
	}

	switch strategy {
	case 3: // 或签：任一人通过 -> 节点通过
		// 取消同节点其他待处理任务
		tx.Model(&model.ApprovalInstanceTask{}).
			Where("instance_id = ? AND node_id = ? AND id <> ? AND status = ?",
				instance.ID, task.NodeID, task.ID, model.TaskStatusPending).
			Updates(map[string]interface{}{
				"status":     model.TaskStatusCancelled,
				"updated_at": time.Now(),
				"updated_by": curUserID,
			})
		return advanceToNextNode(tx, instance, nodes, curUserID)

	case 2: // 会签：全部审批人通过 -> 节点通过
		var pendingCount int64
		tx.Model(&model.ApprovalInstanceTask{}).
			Where("instance_id = ? AND node_id = ? AND status = ?",
				instance.ID, task.NodeID, model.TaskStatusPending).
			Count(&pendingCount)
		if pendingCount > 0 {
			return nil // 还有人未审批，等待
		}
		return advanceToNextNode(tx, instance, nodes, curUserID)

	case 1: // 依次审批：当前人通过 -> 生成下一个人的任务
		return handleSequentialNext(tx, instance, node, curUserID)

	default:
		return advanceToNextNode(tx, instance, nodes, curUserID)
	}
}

// handleSequentialNext 依次审批：检查同节点是否还有后续审批人
func handleSequentialNext(tx *gorm.DB, instance *model.ApprovalInstance, node *flowNode, curUserID uint) error {
	// 查询同节点已生成的任务数量
	var taskCount int64
	tx.Model(&model.ApprovalInstanceTask{}).
		Where("instance_id = ? AND node_id = ?", instance.ID, node.ID).
		Count(&taskCount)

	// 解析该节点的全部审批人
	userIDs, _ := resolveApproverUserIDs(*node, nil)
	if int(taskCount) < len(userIDs) {
		// 还有后续审批人：生成下一个人的任务
		nextTask := model.ApprovalInstanceTask{
			InstanceID: instance.ID,
			NodeID:     node.ID,
			NodeName:   node.Label,
			Sort:       instance.CurrentNodeIdx,
			AssigneeID: userIDs[taskCount],
			Status:     model.TaskStatusPending,
		}
		nextTask.CreatedBy, nextTask.UpdatedBy = curUserID, curUserID
		return tx.Create(&nextTask).Error
	}

	// 该节点所有人已审批完 -> 推进到下一节点
	return advanceToNextNode(tx, instance, nil, curUserID)
}

// advanceToNextNode 推进到下一个审批节点
func advanceToNextNode(tx *gorm.DB, instance *model.ApprovalInstance, allNodes []flowNode, curUserID uint) error {
	var pathNodeIDs []string
	if err := json.Unmarshal([]byte(instance.ExecutionPath), &pathNodeIDs); err != nil {
		return err
	}

	instance.CurrentNodeIdx++
	if err := tx.Model(instance).Update("current_node_idx", instance.CurrentNodeIdx).Error; err != nil {
		return err
	}

	if instance.CurrentNodeIdx >= len(pathNodeIDs) {
		// 所有节点都已处理完 -> 流程通过
		return finishInstance(tx, instance, model.InstanceStatusPassed, "", curUserID)
	}

	// 为新节点生成任务（自选成员已在 flow_snapshot 的 members 中，无需额外传入）
	return generateTasksForCurrentNode(tx, instance, allNodes, curUserID)
}

// ApprovalTaskDelegate 转交审批任务
func ApprovalTaskDelegate(curUserID uint, instanceID, taskID uint, req *model.ApprovalInstanceTaskDelegateReq) error {
	return database.DB.Transaction(func(tx *gorm.DB) error {
		// 校验任务
		var task model.ApprovalInstanceTask
		if err := tx.First(&task, taskID).Error; err != nil {
			return errors.New("审批任务不存在")
		}
		if task.InstanceID != instanceID {
			return errors.New("任务与实例不匹配")
		}
		if task.Status != model.TaskStatusPending {
			return errors.New("该任务已处理")
		}
		if task.AssigneeID != curUserID {
			return errors.New("您不是该任务的审批人")
		}

		// 校验目标用户存在
		var user model.User
		if err := tx.First(&user, req.ToUserID).Error; err != nil {
			return errors.New("转交目标用户不存在")
		}

		now := time.Now()

		// 原任务标记为已转交
		task.Status = model.TaskStatusDelegated
		task.OperatedAt = &now
		task.UpdatedBy = curUserID
		if err := tx.Save(&task).Error; err != nil {
			return err
		}

		// 新建转交任务
		newTask := model.ApprovalInstanceTask{
			InstanceID:    instanceID,
			NodeID:        task.NodeID,
			NodeName:      task.NodeName,
			Sort:          task.Sort,
			AssigneeID:    req.ToUserID,
			Status:        model.TaskStatusPending,
			DelegatedFrom: task.ID,
		}
		newTask.CreatedBy, newTask.UpdatedBy = curUserID, curUserID
		return tx.Create(&newTask).Error
	})
}

// ApprovalInstanceWithdraw 撤回流程实例
func ApprovalInstanceWithdraw(curUserID, instanceID uint) error {
	return database.DB.Transaction(func(tx *gorm.DB) error {
		var instance model.ApprovalInstance
		if err := tx.First(&instance, instanceID).Error; err != nil {
			return errors.New("流程实例不存在")
		}
		if instance.CreatedBy != curUserID {
			return errors.New("只能撤回自己发起的审批")
		}
		if instance.Status != model.InstanceStatusRunning {
			return errors.New("只有进行中的流程可撤回")
		}

		// 撤回：更新实例状态 + 取消所有待处理任务 + 业务表回退为草稿
		return finishInstance(tx, &instance, model.InstanceStatusWithdrawn, "发起人撤回", curUserID)
	})
}

// ApprovalInstanceDelete 删除流程实例（软删除）
// 仅允许发起人删除已终结的实例（已拒绝/已驳回/已作废/已撤回），同时标记业务数据为已删除
func ApprovalInstanceDelete(curUserID, instanceID uint) error {
	return database.DB.Transaction(func(tx *gorm.DB) error {
		var instance model.ApprovalInstance
		if err := tx.First(&instance, instanceID).Error; err != nil {
			return errors.New("流程实例不存在")
		}
		if instance.CreatedBy != curUserID {
			return errors.New("只能删除自己发起的审批")
		}
		// 仅允许删除已终结的实例：已拒绝(2)/已驳回(3)/已作废(4)/已撤回(5)
		allowedStatuses := []int{
			model.InstanceStatusRejected,
			model.InstanceStatusReturned,
			model.InstanceStatusVoided,
			model.InstanceStatusWithdrawn,
		}
		allowed := false
		for _, s := range allowedStatuses {
			if instance.Status == s {
				allowed = true
				break
			}
		}
		if !allowed {
			return errors.New("只有已拒绝/已驳回/已作废/已撤回的流程可删除")
		}

		// 软删除实例
		return tx.Delete(&instance).Error
	})
}

// ============================================================
// 实例详情
// ============================================================

// ApprovalInstanceDetail 获取流程实例详情（含任务列表+业务数据+审批人姓名+详情页布局）
func ApprovalInstanceDetail(curUserID, instanceID uint) (*model.ApprovalInstanceDetailResult, error) {
	var instance model.ApprovalInstance
	if err := database.DB.First(&instance, instanceID).Error; err != nil {
		return nil, errors.New("流程实例不存在")
	}

	// 查询应用配置（名称 + 详情页布局快照）
	var app model.Application
	appName := ""
	var detailLayoutJSON any
	if err := database.DB.First(&app, instance.AppID).Error; err == nil {
		appName = app.Name
		detailLayoutJSON = app.DetailLayoutJSON
	}

	// 查询发起人姓名
	createdByName := ""
	if instance.CreatedBy > 0 {
		var creator model.User
		if err := database.DB.Unscoped().Preload("Profile").First(&creator, instance.CreatedBy).Error; err == nil {
			createdByName = userNickname(creator)
		}
	}

	// 查询任务列表（按序号+创建时间排序）
	var tasks []model.ApprovalInstanceTask
	database.DB.Where("instance_id = ?", instance.ID).Order("sort ASC, id ASC").Find(&tasks)

	// 查询业务数据（含子表）
	var bizData map[string]interface{}
	real := bizTableName(instance.BusinessTable)
	if colSet, err := queryColumnSet(real); err == nil {
		sql := "SELECT * FROM `" + real + "` WHERE `id` = ?"
		if colSet["deleted_at"] {
			sql += " AND `deleted_at` IS NULL"
		}
		database.DB.Raw(sql, instance.BusinessDataID).Scan(&bizData)
	}
	// 子表数据：按 parent_id 关联主表（与 ApplicationDataDetail 逻辑一致）
	if app.SubTableName != "" {
		for _, sub := range strings.Split(app.SubTableName, ",") {
			sub = strings.TrimSpace(sub)
			if sub == "" || !isValidTableName(sub) {
				continue
			}
			subReal := bizTableName(sub)
			var rows []map[string]interface{}
			subSQL := "SELECT * FROM `" + subReal + "` WHERE `parent_id` = ?"
			if subColSet, err := queryColumnSet(subReal); err == nil && subColSet["deleted_at"] {
				subSQL += " AND `deleted_at` IS NULL"
			}
			subSQL += " ORDER BY `id` ASC"
			if err := database.DB.Raw(subSQL, instance.BusinessDataID).Scan(&rows).Error; err == nil {
				if rows == nil {
					rows = []map[string]interface{}{}
				}
				if bizData == nil {
					bizData = make(map[string]interface{})
				}
				bizData[sub] = rows
			}
		}
	}

	// 批量解析涉及用户 ID 的姓名（审批人 + 发起人）
	uidSet := map[uint]bool{}
	for _, t := range tasks {
		if t.AssigneeID > 0 {
			uidSet[t.AssigneeID] = true
		}
	}
	if instance.CreatedBy > 0 {
		uidSet[instance.CreatedBy] = true
	}
	assigneeNameMap := make(map[string]string, len(uidSet))
	if len(uidSet) > 0 {
		uidList := make([]uint, 0, len(uidSet))
		for uid := range uidSet {
			uidList = append(uidList, uid)
		}
		var users []model.User
		if err := database.DB.Unscoped().Preload("Profile").Where("id IN ?", uidList).Find(&users).Error; err == nil {
			for _, u := range users {
				assigneeNameMap[strconv.FormatUint(uint64(u.ID), 10)] = userNickname(u)
			}
		}
	}

	result := &model.ApprovalInstanceDetailResult{
		ApprovalInstance: instance,
		AppName:          appName,
		CreatedByName:    createdByName,
		BusinessData:     bizData,
		DetailLayoutJSON: detailLayoutJSON,
		Tasks:            tasks,
		AssigneeNameMap:  assigneeNameMap,
	}
	return result, nil
}
