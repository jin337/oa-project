package middleware

import (
	"strings"

	"back-end/internal/database"
	"back-end/internal/model"

	"gorm.io/gorm"
)

// DataScopeResult 数据范围解析结果：服务层/接口执行引擎按需拼接过滤条件
type DataScopeResult struct {
	All     bool   // 全部数据
	DeptIDs []uint // 部门过滤集合（2/3/4 合并，去重）
	Self    bool   // 仅本人（创建人 = 当前用户）
}

// ResolveDataScope 解析当前用户的数据范围（多角色取并集，任一角色"全部"即放行）：
//
//	1 全部数据 / 2 自定义部门 / 3 仅本部门 / 4 本部门及下级 / 5 仅本人
func ResolveDataScope(userID uint) *DataScopeResult {
	var user model.User
	if err := database.DB.Preload("Roles.Depts").First(&user, userID).Error; err != nil {
		// 查不到用户：返回空范围，调用方按最严格（无数据）处理
		return &DataScopeResult{}
	}
	res := &DataScopeResult{}
	for _, role := range user.Roles {
		if role.Status != 1 {
			continue
		}
		switch role.DataScope {
		case model.DataScopeAll:
			res.All = true
		case model.DataScopeCustom:
			for _, d := range role.Depts {
				res.DeptIDs = append(res.DeptIDs, d.ID)
			}
		case model.DataScopeDept:
			res.DeptIDs = append(res.DeptIDs, user.DeptID)
		case model.DataScopeDeptAndBelow:
			res.DeptIDs = append(res.DeptIDs, CollectDeptAndBelow(user.DeptID)...)
		case model.DataScopeSelf:
			res.Self = true
		}
	}
	// 去重并跳过 0（未分配部门时 user.DeptID=0 不应进入过滤集合）
	seen := make(map[uint]bool, len(res.DeptIDs))
	ids := res.DeptIDs[:0]
	for _, id := range res.DeptIDs {
		if id > 0 && !seen[id] {
			seen[id] = true
			ids = append(ids, id)
		}
	}
	res.DeptIDs = ids
	return res
}

// ApplyDataScope 根据当前登录用户角色的数据范围，对列表查询追加过滤条件：
// deptColumn 为目标表的部门字段（如 "users.dept_id"），creatorColumn 为目标表的创建人字段（如 "created_by"）。
// 部门维度（2/3/4）按部门集合过滤，仅本人（5）按创建人过滤；部门与仅本人并存时取并集（OR）。
func ApplyDataScope(db *gorm.DB, userID uint, deptColumn, creatorColumn string) *gorm.DB {
	scope := ResolveDataScope(userID)
	if scope.All {
		return db
	}
	conds := make([]string, 0, 2)
	args := make([]interface{}, 0, 2)
	if len(scope.DeptIDs) > 0 {
		conds = append(conds, deptColumn+" IN ?")
		args = append(args, scope.DeptIDs)
	}
	if scope.Self {
		conds = append(conds, creatorColumn+" = ?")
		args = append(args, userID)
	}
	if len(conds) == 0 {
		return db.Where("1 = 0")
	}
	return db.Where(strings.Join(conds, " OR "), args...)
}

// collectDeptAndBelow 收集某部门及其所有下级部门 ID（基于 parent_id 树）
func CollectDeptAndBelow(deptID uint) []uint {
	result := []uint{deptID}
	queue := []uint{deptID}
	for len(queue) > 0 {
		var children []model.Dept
		database.DB.Where("parent_id IN ?", queue).Find(&children)
		queue = queue[:0]
		for _, c := range children {
			result = append(result, c.ID)
			queue = append(queue, c.ID)
		}
	}
	return result
}
