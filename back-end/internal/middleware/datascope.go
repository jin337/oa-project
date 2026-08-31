package middleware

import (
	"back-end/internal/database"
	"back-end/internal/model"

	"gorm.io/gorm"
)

// ApplyDataScope 根据当前登录用户角色的数据范围，对部门维度查询追加过滤条件
// 实现架构图中的「过滤查询 (如: WHERE dept_id IN ?)」：
//  1 全部数据      -> 不过滤
//  2 自定义部门    -> dept_id IN (角色绑定部门)
//  3 仅本部门      -> dept_id = 用户部门
//  4 本部门及下级  -> dept_id IN (用户部门及其所有子部门)
// deptColumn 为目标表的部门字段，如 "users.dept_id"
func ApplyDataScope(db *gorm.DB, userID uint, deptColumn string) *gorm.DB {
	var user model.User
	if err := database.DB.Preload("Roles.Depts").First(&user, userID).Error; err != nil {
		// 查不到用户时最严格：无数据
		return db.Where("1 = 0")
	}

	deptIDs := map[uint]bool{}
	all := false
	for _, role := range user.Roles {
		if role.Status != 1 {
			continue
		}
		switch role.DataScope {
		case model.DataScopeAll:
			all = true
		case model.DataScopeCustom:
			for _, d := range role.Depts {
				deptIDs[d.ID] = true
			}
		case model.DataScopeDept:
			deptIDs[user.DeptID] = true
		case model.DataScopeDeptAndBelow:
			for _, id := range collectDeptAndBelow(user.DeptID) {
				deptIDs[id] = true
			}
		}
	}
	if all {
		return db
	}
	if len(deptIDs) == 0 {
		return db.Where("1 = 0")
	}
	ids := make([]uint, 0, len(deptIDs))
	for id := range deptIDs {
		ids = append(ids, id)
	}
	return db.Where(deptColumn+" IN ?", ids)
}

// collectDeptAndBelow 收集某部门及其所有下级部门 ID（基于 parent_id 树）
func collectDeptAndBelow(deptID uint) []uint {
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
