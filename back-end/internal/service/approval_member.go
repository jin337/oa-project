package service

// ============================================================
// 审批人解析
// ============================================================
// resolveApproverUserIDs 是任务生成与节点推进的核心依赖：
//   - approverType=3（发起人自选）：优先读取已注入流程快照的 node.Members
//     （injectSelfSelectIntoNodes 在提交时把自选成员写入快照），其次回退调用方
//     显式传入的 selfSelectUserIDs，两者皆空时按 emptyHandler 处理；
//   - approverType=1/2（指定人员/角色）：从 node.Members 解析用户 ID。
// ============================================================

import (
	"strconv"
	"strings"

	"back-end/internal/database"
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

// resolveMembersUserIDs 从节点成员列表解析用户 ID（人员 user_x / 角色 role_x 展开为角色下所有用户）
func resolveMembersUserIDs(members []flowMember) ([]uint, error) {
	var userIDs []uint
	for _, m := range members {
		switch m.Type {
		case 1: // 人员：key 格式 "user_123"
			uid := parseMemberID(m.Key)
			if uid > 0 {
				userIDs = append(userIDs, uid)
			}
		case 2: // 部门：暂不展开为部门下用户，仅作标记（后续可扩展查询部门用户）
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
	return uniqueUintSlice(userIDs), nil
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
		return uniqueUintSlice(ids), nil
	default: // 2-自动拒绝 / 3-转交流程管理员：暂按自动拒绝处理
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
	err := database.DB.Table(bizTablePrefix() + "sys_user_role").
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
