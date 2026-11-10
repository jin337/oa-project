package service

// ============================================================
// 审批人解析
// ============================================================
// resolveApproverUserIDs 是任务生成与节点推进的核心依赖：
//   - approverType=3（发起人自选）：优先读取已注入流程快照的 node.Members
//     （injectSelfSelectIntoNodes 在提交时把自选成员写入快照），其次回退调用方
//     显式传入的 selfSelectUserIDs，两者皆空时按 emptyHandler 处理；
//   - approverType=1/2/4（指定人员/角色/审核人员组）：从 node.Members 解析用户 ID。
// ============================================================

import (
	"errors"
	"strconv"
	"strings"

	"back-end/internal/database"
	"back-end/internal/model"

	"gorm.io/gorm"
)

// resolveApproverUserIDs 将节点的成员配置解析为实际用户 ID 列表
func resolveApproverUserIDs(node flowNode, selfSelectUserIDs []uint) ([]uint, error) {
	// 发起人自选：优先使用已注入快照的 members（提交/保存时由 injectSelfSelectIntoNodes 写入），
	// 其次使用调用方显式传入的用户 ID；两者皆空时按 emptyHandler 处理
	if node.ApproverType == 3 {
		ids, err := resolveMembersUserIDs(node.Members)
		if err != nil {
			return nil, err
		}
		if len(ids) > 0 {
			return ids, nil
		}
		if len(selfSelectUserIDs) > 0 {
			return selfSelectUserIDs, nil
		}
		return resolveEmptyHandler(node)
	}

	// 指定人员 / 指定角色：从 members 中提取用户 ID
	ids, err := resolveMembersUserIDs(node.Members)
	if err != nil {
		return nil, err
	}
	if len(ids) == 0 {
		return resolveEmptyHandler(node)
	}
	return ids, nil
}

// resolveMembersUserIDs 从节点成员列表解析用户 ID（人员 user_x / 角色 role_x / 审核人员组 group_x 分别展开）
func resolveMembersUserIDs(members []flowMember) ([]uint, error) {
	var userIDs []uint
	for _, m := range members {
		switch m.Type {
		case 1: // 人员：key 格式 "user_123"
			uid := parseMemberID(m.Key)
			if uid > 0 {
				userIDs = append(userIDs, uid)
			}
		case 2: // 部门：展开为部门下所有用户（含多部门归属 sys_user_dept 关系表）
			did := parseMemberID(m.Key)
			if did > 0 {
				ids, err := getUserIDsByDept(did)
				if err != nil {
					return nil, err
				}
				userIDs = append(userIDs, ids...)
			}
		case 3: // 角色：展开为角色下所有用户
			rid := parseMemberID(m.Key)
			if rid > 0 {
				ids, err := getUserIDsByRole(rid)
				if err != nil {
					return nil, err
				}
				userIDs = append(userIDs, ids...)
			}
		case 4: // 审核人员组：展开为该组配置的审核人用户ID列表
			gid := parseMemberID(m.Key)
			if gid > 0 {
				ids, err := getUserIDsByExamineGroup(gid)
				if err != nil {
					return nil, err
				}
				userIDs = append(userIDs, ids...)
			}
		}
	}
	return uniqueUintSlice(userIDs), nil
}

// resolveEmptyHandler 审批人为空时的兜底处理：
//   - case 1（自动通过）/ case 2（自动拒绝）/ case 3（转交流程管理员）：无兜底审批人，返回 nil，
//     由 generateTasksForCurrentNode 按 node.EmptyHandler 分支决定实例走向（自动通过/自动拒绝/转管理员）
//   - case 4（指定人员）：返回 emptyMembers 解析出的用户 ID（未配置人员时返回空）
func resolveEmptyHandler(node flowNode) ([]uint, error) {
	switch node.EmptyHandler {
	case 1, 2, 3:
		return nil, nil
	case 4: // 指定人员
		var ids []uint
		for _, m := range node.EmptyMembers {
			uid := parseMemberID(m.Key)
			if uid > 0 {
				ids = append(ids, uid)
			}
		}
		return uniqueUintSlice(ids), nil
	default:
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

// getUserIDsByRole 查询角色下所有用户 ID（join 表名带配置前缀，与 role.go 查询方式一致）
func getUserIDsByRole(roleID uint) ([]uint, error) {
	var userIDs []uint
	err := database.DB.Table(bizTablePrefix()+"sys_user_role").
		Where("role_id = ?", roleID).
		Pluck("user_id", &userIDs).Error
	return userIDs, err
}

// getUserIDsByDept 查询部门下所有用户 ID（多部门归属 sys_user_dept 关系表，与 user.go 一致）
func getUserIDsByDept(deptID uint) ([]uint, error) {
	var userIDs []uint
	err := database.DB.Table(bizTablePrefix()+"sys_user_dept").
		Where("dept_id = ?", deptID).
		Pluck("user_id", &userIDs).Error
	return userIDs, err
}

// getUserIDsByExamineGroup 查询审核人员组配置的审核人用户 ID 列表（approver_ids JSON 列）。
// GORM 自动过滤软删除组；组不存在或未配置审核人时返回空列表。
func getUserIDsByExamineGroup(groupID uint) ([]uint, error) {
	var eg model.ExamineGroup
	if err := database.DB.First(&eg, groupID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return eg.ApproverIDs, nil
}

// flowAdminPerms 流程管理员判定用的权限码：只认「流程配置编辑/设计/新增」这类
// 管理动作权限。不能包含父级 application——它只是菜单可见性，普通员工角色也持有，
// 否则全公司都会被当成流程管理员。
var flowAdminPerms = []string{"application:edit", "application:design", "application:add"}

// isFlowAdmin 判断用户是否具备流程配置管理权限。
// 用于详情/抄送的管理员豁免：系统管理员与流程配置负责人需要查看、运维全量实例，
// 普通员工（只持有父级 application 菜单权限）不在其列。
func isFlowAdmin(userID uint) bool {
	var count int64
	err := database.DB.Table(bizTablePrefix()+"sys_user_role").
		Joins("JOIN "+bizTablePrefix()+"sys_role_menu rm ON rm.role_id = "+bizTablePrefix()+"sys_user_role.role_id").
		Joins("JOIN "+bizTablePrefix()+"menus m ON m.id = rm.menu_id").
		Where(bizTablePrefix()+"sys_user_role.user_id = ? AND m.perm IN ? AND m.status = 1", userID, flowAdminPerms).
		Count(&count).Error
	return err == nil && count > 0
}

// resolveFlowAdminUserIDs 流程管理员：拥有流程配置编辑权的用户
// （emptyHandler=3 转交流程管理员时使用；无配置管理员时返回空列表）
func resolveFlowAdminUserIDs() ([]uint, error) {
	var userIDs []uint
	err := database.DB.Table(bizTablePrefix()+"sys_user_role").
		Joins("JOIN "+bizTablePrefix()+"sys_role_menu rm ON rm.role_id = "+bizTablePrefix()+"sys_user_role.role_id").
		Joins("JOIN "+bizTablePrefix()+"menus m ON m.id = rm.menu_id").
		Where("m.perm IN ? AND m.status = 1", flowAdminPerms).
		Distinct().
		Pluck(bizTablePrefix()+"sys_user_role.user_id", &userIDs).Error
	return uniqueUintSlice(userIDs), err
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
