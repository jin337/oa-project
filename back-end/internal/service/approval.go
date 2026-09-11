package service

import (
	"errors"
	"sort"
	"strings"
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

// ==================== 审批列表（跨应用聚合） ====================

// ApprovalList 审批列表跨应用聚合查询：
//   - 遍历所有未删除的页面配置（Application），在各自动态业务主表中按 scope 过滤后合并
//   - initiated 我的发起  ：created_by = 当前用户 且 排除草稿（status ≠ 0）
//   - todo      我的待办  ：status ∈ {1 待审核, 2 审核中}（无独立审批人体系，待办 = 全部已提交待审数据）
//   - approved  我审批的  ：status ∈ {3 已通过, 4 不通过, 5 已驳回, 6 已作废} 且 updated_by = 当前用户
//   - cc        抄送我的  ：当前无抄送人字段，返回空列表（结构预留）
//   - drafts    草稿箱    ：created_by = 当前用户 且 status = 0 草稿
//
// 每张业务表行数有限，采用"全量聚合 → 按发起时间倒序 → 内存分页"策略
func ApprovalList(curUserID uint, req *model.ApprovalListReq) ([]model.ApprovalRecord, int64, error) {
	if req.Scope == "cc" {
		// 抄送暂无数据支撑（无抄送人字段），返回空结构
		return []model.ApprovalRecord{}, 0, nil
	}

	var apps []model.Application
	if err := database.DB.Unscoped().Where("deleted_at IS NULL").Order("id ASC").Find(&apps).Error; err != nil {
		return nil, 0, err
	}

	records := []model.ApprovalRecord{}
	for _, app := range apps {
		if !isValidTableName(app.TableName) {
			continue
		}
		real := bizTableName(app.TableName)
		colSet, err := queryColumnSet(real)
		if err != nil || !colSet["approval_status"] {
			continue // 业务表缺失或旧表无审核功能，跳过
		}

		conds := []string{"`deleted_at` IS NULL"}
		args := []interface{}{}
		switch req.Scope {
		case "initiated":
			conds = append(conds, "`created_by` = ?", "`approval_status` <> ?")
			args = append(args, curUserID, model.ApprovalStatusDraft)
		case "todo":
			conds = append(conds, "`approval_status` IN (?, ?)")
			args = append(args, model.ApprovalStatusPending, model.ApprovalStatusReviewing)
		case "approved":
			conds = append(conds, "`approval_status` IN (?, ?, ?, ?)", "`updated_by` = ?")
			args = append(args,
				model.ApprovalStatusPassed, model.ApprovalStatusRejected,
				model.ApprovalStatusReturned, model.ApprovalStatusVoided,
				curUserID)
		case "drafts":
			conds = append(conds, "`created_by` = ?", "`approval_status` = ?")
			args = append(args, curUserID, model.ApprovalStatusDraft)
		default:
			return nil, 0, errors.New("非法的审批列表类型")
		}

		var rows []map[string]interface{}
		if err := database.DB.Raw("SELECT * FROM `"+real+"` WHERE "+strings.Join(conds, " AND ")+" ORDER BY `id` DESC",
			args...).Scan(&rows).Error; err != nil {
			return nil, 0, err
		}
		for _, row := range rows {
			rec := model.ApprovalRecord{
				ID:         rowUint(row, "id"),
				AppID:      app.ID,
				AppCode:    app.Code,
				AppName:    app.Name,
				Status:     int(rowUint(row, "approval_status")),
				StatusName: approvalStatusName(int(rowUint(row, "approval_status"))),
				CreatedBy:  rowUint(row, "created_by"),
				CreatedAt:  rowTime(row, "created_at"),
				UpdatedAt:  rowTime(row, "updated_at"),
				Data:       rowBizData(row),
			}
			records = append(records, rec)
		}
	}

	// 批量填充发起人姓名、部门名称与完成时间（两次 IN 查询，避免 N+1）
	fillApprovalUserInfo(records)

	// 按发起时间倒序（nil 时间排最后）
	sort.SliceStable(records, func(i, j int) bool {
		a, b := records[i].CreatedAt, records[j].CreatedAt
		if a == nil {
			return false
		}
		if b == nil {
			return true
		}
		return a.After(*b)
	})

	total := int64(len(records))
	offset, limit := req.Offset(), req.Limit()
	if offset >= len(records) {
		return []model.ApprovalRecord{}, total, nil
	}
	end := offset + limit
	if end > len(records) {
		end = len(records)
	}
	return records[offset:end], total, nil
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
		case "id", "created_at", "updated_at", "created_by", "updated_by", "deleted_at", "approval_status", "parent_id":
			continue
		}
		biz[k] = v
	}
	if len(biz) == 0 {
		return nil
	}
	return biz
}
