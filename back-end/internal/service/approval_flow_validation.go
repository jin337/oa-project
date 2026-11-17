package service

// ============================================================
// 审批流审批人完整性校验
// ============================================================
// 审批人完整性校验：
//   - 发布版本时：审批节点（type=2）必须配置审批人；显式选择 emptyHandler=1（自动通过）的节点允许为空
//   - 提交实例时：当前执行路径上的审批节点必须能解析出至少一个审批人；配置为自动通过的节点允许为空
//   - 运行时兜底：审批人为空时按节点 emptyHandler 处理（自动通过 / 自动拒绝 / 转管理员 / 指定人员）
// ============================================================

import (
	"fmt"
	"strings"
)

func approvalNodeLabel(node *flowNode) string {
	if node == nil {
		return "审批节点"
	}
	if strings.TrimSpace(node.Label) != "" {
		return node.Label
	}
	if strings.TrimSpace(node.ID) != "" {
		return node.ID
	}
	return "审批节点"
}

// validateApprovalFlowApprovers 校验整棵审批流配置：审批节点不能没有审批人。
// 发起人自选（approverType=3）允许配置时为空，实际选人在提交阶段校验；
// 显式配置 emptyHandler=1（自动通过）的审批节点允许为空，运行时跳过。
func validateApprovalFlowApprovers(raw any) error {
	nodes, err := parseFlowNodes(raw)
	if err != nil {
		return fmt.Errorf("审批流配置解析失败: %w", err)
	}
	return validateFlowNodesApprovers(nodes)
}

func validateFlowNodesApprovers(nodes []flowNode) error {
	for i := range nodes {
		node := &nodes[i]
		if node.Type == 4 {
			for j := range node.Branches {
				if err := validateFlowNodesApprovers(node.Branches[j].Children); err != nil {
					return err
				}
			}
			continue
		}
		if node.Type != 2 {
			continue
		}
		if node.ApproverType == 3 {
			continue
		}
		if len(node.Members) == 0 {
			// 显式配置「审批人为空 → 自动通过」时允许不选审批人，运行时跳过该节点；
			// 未配置自动通过则仍视为流程缺陷，发布前拦截。
			if node.EmptyHandler == 1 {
				continue
			}
			return fmt.Errorf("审批节点「%s」未配置审批人，不允许发布", approvalNodeLabel(node))
		}
		for _, m := range node.Members {
			if m.Type < 1 || m.Type > 4 || parseMemberID(m.Key) == 0 {
				return fmt.Errorf("审批节点「%s」存在无效审批人配置，不允许发布", approvalNodeLabel(node))
			}
		}
	}
	return nil
}

// validateExecutionPathApprovers 校验当前执行路径上的审批节点能解析出实际审批人。
// 只校验 type=2；抄送节点不会生成审批任务，不参与审批人完整性判定。
func validateExecutionPathApprovers(nodes []flowNode, execPath []string) error {
	for _, nodeID := range execPath {
		node := findNodeByID(nodes, nodeID)
		if node == nil || node.Type != 2 {
			continue
		}
		if node.ApproverType == 3 {
			// 发起人自选：快照 members 必须是提交时已选定的审批人；
			// 只有显式配置「审批人为空 → 自动通过」才允许留空，由运行时跳过该节点。
			ids, err := resolveMembersUserIDs(node.Members)
			if err != nil {
				return fmt.Errorf("审批节点「%s」审批人解析失败: %w", approvalNodeLabel(node), err)
			}
			if len(ids) == 0 {
				if node.EmptyHandler == 1 {
					continue
				}
				return fmt.Errorf("审批节点「%s」未选择审批人，不允许提交", approvalNodeLabel(node))
			}
			continue
		}
		ids, err := resolveApproverUserIDs(*node, nil)
		if err != nil {
			return fmt.Errorf("审批节点「%s」审批人解析失败: %w", approvalNodeLabel(node), err)
		}
		if len(ids) == 0 {
			// 显式配置自动通过时允许解析不到人，由 generateTasksForCurrentNode 跳过。
			if node.EmptyHandler == 1 {
				continue
			}
			return fmt.Errorf("审批节点「%s」未解析到审批人，不允许提交", approvalNodeLabel(node))
		}
	}
	return nil
}
