package service

// ============================================================
// 审批任务流转引擎
// ============================================================
// 覆盖：首个节点任务生成（generateTasksForCurrentNode）、空审批人自动通过
// （handleAutoPassNode）、节点间推进（advanceToNextNode）、流程终结
// （finishInstance）、审批操作（ApprovalTaskApprove / ApprovalTaskDelegate）。
//
// 节点语义：
//   - type=2（审批人）：生成审批待办任务，审批方式由 strategy 决定
//   - type=3（抄送人）：不生成待办任务，直接推进到下一节点
//   - 审批人为空且 emptyHandler=1：按配置自动通过当前节点（递归推进）
//
// 所有操作必须在调用方提供的事务内执行，保证实例状态与任务数据一致。
// ============================================================

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"sort"
	"strings"
	"time"

	"back-end/internal/database"
	"back-end/internal/model"

	"gorm.io/gorm"
)

// createPendingTask 构造并创建一条待处理审批任务（依次/会签/或签共用）
func createPendingTask(tx *gorm.DB, instance *model.ApprovalInstance, nodeID, nodeName string, sort int, assigneeID, curUserID uint) error {
	task := model.ApprovalInstanceTask{
		InstanceID: instance.ID,
		NodeID:     nodeID,
		NodeName:   nodeName,
		Sort:       sort,
		AssigneeID: assigneeID,
		Status:     model.TaskStatusPending,
	}
	task.CreatedBy, task.UpdatedBy = curUserID, curUserID
	if err := tx.Create(&task).Error; err != nil {
		return err
	}
	// 待办通知（类型1）
	appName := getInstanceAppName(instance)
	n := model.Notification{
		UserID:     assigneeID,
		Type:       1,
		Title:      appName,
		Msg:        "您有新的审批待办",
		InstanceID: instance.ID,
	}
	notifyCreate(tx, n)
	return nil
}

// getInstanceAppName 查实例所属申请项名称
func getInstanceAppName(instance *model.ApprovalInstance) string {
	var app model.Application
	if err := database.DB.Select("name, code").First(&app, instance.AppID).Error; err != nil {
		return ""
	}
	// 根据 app.Code 查申请项名称
	var item model.ApprovalCategoryItem
	if err := database.DB.Select("name").Where("code = ?", app.Code).First(&item).Error; err == nil && item.Name != "" {
		return item.Name
	}
	return app.Name
}

// preApprovedAssigneeIDs 返回实例内已真实操作（operated_at 非空）过的审批人 ID 集合。
// 用于前置审批模式下跨节点重复审批人的自动通过判定与退回「不重复审批」判定。
// 只统计原始卡片（delegated_from=0 且 add_sign_from=0）的真实操作：
// 转交人、加签人等衍生任务的操作不计入——他们不是节点配置中的重复成员，
// 不触发自动通过，退回后仍应生成真实待办再次审批。
func preApprovedAssigneeIDs(tx *gorm.DB, instanceID uint) (map[uint]bool, error) {
	var assigneeIDs []uint
	if err := tx.Model(&model.ApprovalInstanceTask{}).
		Where("instance_id = ? AND operated_at IS NOT NULL AND delegated_from = 0 AND add_sign_from = 0", instanceID).
		Distinct("assignee_id").
		Pluck("assignee_id", &assigneeIDs).Error; err != nil {
		return nil, err
	}
	set := make(map[uint]bool, len(assigneeIDs))
	for _, id := range assigneeIDs {
		set[id] = true
	}
	return set, nil
}

// createAutoApprovedTask 创建一条「已前置审批，自动通过」任务记录：
//   - status=已通过，但 operated_at 为空 → 不是真实操作：
//     不可被审核撤回、不进入「经我处理」列表（列表查询要求 operated_at 非空）、不推送待办通知；
//   - comment 携带标记，审批详情时间线据此展示「自动通过」并保留可追溯说明。
func createAutoApprovedTask(tx *gorm.DB, instance *model.ApprovalInstance, nodeID, nodeName string, sort int, assigneeID, curUserID uint, comment string) error {
	task := model.ApprovalInstanceTask{
		InstanceID: instance.ID,
		NodeID:     nodeID,
		NodeName:   nodeName,
		Sort:       sort,
		AssigneeID: assigneeID,
		Status:     model.TaskStatusApproved,
		Comment:    comment,
	}
	task.CreatedBy, task.UpdatedBy = curUserID, curUserID
	return tx.Create(&task).Error
}

// containsUint 判断切片中是否包含目标值
func containsUint(list []uint, target uint) bool {
	for _, v := range list {
		if v == target {
			return true
		}
	}
	return false
}

// postLastNodeIdx 返回执行路径中每个审批人「最后出现」的审批节点索引（后置审批判定用）。
// 只统计审批节点（type=2）；抄送节点（type=3）不生成审批任务，不计入。
// 判定基准为实例创建/重新提交时冻结的 execution_path 快照：条件分支命中已随表单数据固定，
// 运行时路径不变，因此「最后出现节点」可静态判定。
func postLastNodeIdx(instance *model.ApprovalInstance, allNodes []flowNode, userIDs []uint) map[uint]int {
	last := make(map[uint]int, len(userIDs))
	for _, uid := range userIDs {
		last[uid] = -1
	}
	for i, nodeID := range instance.ExecutionPath {
		node := findNodeByID(allNodes, nodeID)
		if node == nil || node.Type != 2 {
			continue
		}
		memberIDs, err := resolveApproverUserIDs(*node, nil)
		if err != nil {
			continue
		}
		for _, uid := range userIDs {
			if containsUint(memberIDs, uid) {
				last[uid] = i
			}
		}
	}
	return last
}

// autoApprovedComment 按审批模式生成自动通过记录/推进结果的标准文案
// 前置/后置审批：带模式前缀说明跨节点卡位原因；顺序审批：只显示「自动通过」，
// 不出现「已前置/已后置审批」字样（顺序模式跨节点重复成员按后置语义处理但并非后置审批）。
func autoApprovedComment(mode, suffix string) string {
	if mode == "pre" {
		return "已前置审批，" + suffix
	}
	if mode == "post" {
		return "已后置审批，" + suffix
	}
	return suffix
}

// generateTasksForCurrentNode 为当前节点生成审批任务
func generateTasksForCurrentNode(tx *gorm.DB, instance *model.ApprovalInstance, allNodes []flowNode, curUserID uint, autoResult string) error {
	// 解析执行路径
	pathNodeIDs := instance.ExecutionPath
	idx := instance.CurrentNodeIdx
	if idx >= len(pathNodeIDs) {
		return nil // 所有节点已处理
	}

	nodeID := pathNodeIDs[idx]
	node := findNodeByID(allNodes, nodeID)
	if node == nil {
		return fmt.Errorf("流程节点 %s 不存在", nodeID)
	}

	// 抄送节点（type=3）：通知类节点不生成审批待办，直接推进到下一节点
	if node.Type == 3 {
		// 抄送时机 ccTiming=1（审批通过后抄送）：节点被推进经过时写入抄送记录
		if node.CCTiming == 1 {
			if err := writeCCRecords(tx, instance, allNodes, curUserID); err != nil {
				return err
			}
		}
		return advanceToNextNode(tx, instance, allNodes, curUserID, autoResult)
	}

	// 解析审批人（approverType=3 的自选成员已在提交时注入 node.Members，解析器优先读取）
	userIDs, err := resolveApproverUserIDs(*node, nil)
	if err != nil {
		return fmt.Errorf("解析审批人失败: %w", err)
	}

	// 审批人为空：按 emptyHandler 配置分支处理
	//   1-自动通过（默认） / 2-自动拒绝 / 3-转交流程管理员 / 4-指定人员未解析到人视为配置缺陷拒绝放行
	if len(userIDs) == 0 {
		switch node.EmptyHandler {
		case 2: // 自动拒绝
			return finishInstance(tx, instance, model.InstanceStatusRejected, "审批人为空，自动拒绝", curUserID)
		case 3: // 转交流程管理员
			adminIDs, err := resolveFlowAdminUserIDs()
			if err != nil {
				return err
			}
			if len(adminIDs) == 0 {
				return finishInstance(tx, instance, model.InstanceStatusRejected, "未配置流程管理员，自动拒绝", curUserID)
			}
			userIDs = adminIDs
		case 4: // 指定人员但未解析到任何人：视为配置缺陷，拒绝放行
			return finishInstance(tx, instance, model.InstanceStatusRejected, "指定审批人未配置，自动拒绝", curUserID)
		default: // 1-自动通过（默认）
			return advanceToNextNodeWith(tx, instance, allNodes, curUserID, "自动通过")
		}
	}

	// 按审批方式生成任务
	strategy := node.Strategy
	if strategy == 0 {
		strategy = 1 // 默认依次审批
	}

	// 审批模式：同一审批人跨节点出现时的合并策略（正交于节点内依次/会签/或签）：
	//   前置 pre——只在首次出现节点真实审批，后续节点该人卡位自动通过；
	//   后置 post——更早节点该人卡位自动通过，只在最后出现节点真实审批；
	//   顺序（默认，mode 为空）——与后置一致：跨节点重复成员只在最后出现节点真实审批，
	//   更早节点自动通过（自动通过记录仅显示「自动通过」，不带模式前缀）。
	// 自动通过记录无 operated_at：不可撤回、不进经我处理、不推送通知；时间线保留标记。
	mode := parseApprovalMode(instance.ApprovalOtherJSON)
	autoIDs, remainIDs := []uint{}, userIDs
	if mode == "pre" {
		operated, err := preApprovedAssigneeIDs(tx, instance.ID)
		if err != nil {
			return fmt.Errorf("查询已审批人失败: %w", err)
		}
		autoIDs, remainIDs = nil, nil
		for _, uid := range userIDs {
			if operated[uid] {
				autoIDs = append(autoIDs, uid)
			} else {
				remainIDs = append(remainIDs, uid)
			}
		}
	} else {
		// post 与顺序（mode==""）统一：只在最后出现节点真实审批
		lastIdx := postLastNodeIdx(instance, allNodes, userIDs)
		autoIDs, remainIDs = nil, nil
		for _, uid := range userIDs {
			if lastIdx[uid] != idx {
				autoIDs = append(autoIDs, uid)
			} else {
				remainIDs = append(remainIDs, uid)
			}
		}
	}
	for _, uid := range autoIDs {
		if err := createAutoApprovedTask(tx, instance, nodeID, node.Label, idx, uid, curUserID, autoApprovedComment(mode, "自动通过")); err != nil {
			return err
		}
	}

	switch strategy {
	case 1: // 依次审批：只生成第一个未审批人的任务（前置/后置模式下已卡位人顺延跳过）
		if len(remainIDs) > 0 {
			return createPendingTask(tx, instance, nodeID, node.Label, idx, remainIDs[0], curUserID)
		}
		if len(autoIDs) > 0 {
			// 本节点全员已在其他节点卡位自动通过：节点自动通过，直接推进
			return advanceToNextNode(tx, instance, allNodes, curUserID, autoApprovedComment(mode, "自动通过"))
		}
		return nil
	case 2, 3: // 会签 / 或签：未卡位人同时生成待办；已卡位人已生成自动通过记录
		for _, uid := range remainIDs {
			if err := createPendingTask(tx, instance, nodeID, node.Label, idx, uid, curUserID); err != nil {
				return err
			}
		}
		if len(remainIDs) == 0 && len(autoIDs) > 0 {
			// 本节点全员已在其他节点卡位自动通过：节点自动通过，直接推进
			return advanceToNextNode(tx, instance, allNodes, curUserID, autoApprovedComment(mode, "自动通过"))
		}
	}

	return nil
}

// advanceToNextNode 推进到下一个审批节点（普通通过场景）
func advanceToNextNode(tx *gorm.DB, instance *model.ApprovalInstance, allNodes []flowNode, curUserID uint, result string) error {
	return advanceToNextNodeWith(tx, instance, allNodes, curUserID, result)
}

// advanceToNextNodeWith 推进到下一个节点：
//   - 先推进索引并检查是否已处理完所有节点（是则直接终结，避免多余 UPDATE）
//   - 未处理完则更新实例索引并递归生成新节点任务
//
// autoResult 仅在自动通过场景（空审批人 emptyHandler=1）传入"自动通过"，作为流程终结时的结果说明
func advanceToNextNodeWith(tx *gorm.DB, instance *model.ApprovalInstance, allNodes []flowNode, curUserID uint, autoResult string) error {
	instance.CurrentNodeIdx++
	pathNodeIDs := instance.ExecutionPath

	if instance.CurrentNodeIdx >= len(pathNodeIDs) {
		// 所有节点都已处理完 -> 流程通过
		return finishInstance(tx, instance, model.InstanceStatusPassed, autoResult, curUserID)
	}

	// 更新实例节点索引
	if err := tx.Model(instance).Update("current_node_idx", instance.CurrentNodeIdx).Error; err != nil {
		return err
	}

	// 为新节点生成任务（自选成员已在 flow_snapshot 的 members 中，无需额外传入）
	return generateTasksForCurrentNode(tx, instance, allNodes, curUserID, autoResult)
}

// rejectToInitiator 驳回（打回发起人，对齐钉钉）：
// 实例进入"已驳回(3)"挂起态（非终态），清掉 finished_at；取消其余待处理任务；
// 不写 ccTiming=2 的流程结束抄送。发起人修改表单后调 Resubmit 从当前节点继续审批。
func rejectToInitiator(tx *gorm.DB, instance *model.ApprovalInstance, result string, curUserID uint) error {
	now := time.Now()
	instance.Status = model.InstanceStatusReturned
	instance.Result = result
	instance.FinishedAt = nil

	if err := tx.Model(instance).Updates(map[string]interface{}{
		"status":      model.InstanceStatusReturned,
		"result":      result,
		"finished_at": nil,
		"updated_by":  curUserID,
	}).Error; err != nil {
		return err
	}

	// 取消其余待处理/加签等待任务（当前被驳回任务状态已在上面置为已驳回）
	if err := tx.Model(&model.ApprovalInstanceTask{}).
		Where("instance_id = ? AND status IN (?, ?)", instance.ID, model.TaskStatusPending, model.TaskStatusWaiting).
		Updates(map[string]interface{}{
			"status":     model.TaskStatusCancelled,
			"updated_at": now,
			"updated_by": curUserID,
		}).Error; err != nil {
		return err
	}
	// 退回通知给发起人（类型2）
	appName := getInstanceAppName(instance)
	n := model.Notification{
		UserID:     instance.CreatedBy,
		Type:       2,
		Title:      appName,
		Msg:        "审批被退回",
		InstanceID: instance.ID,
	}
	notifyCreate(tx, n)
	return nil
}

// isDerivedTask 判断任务是否由转交或加签产生；当前待办仍按节点权限操作，
// 仅历史衍生审批人不作为退回候选。
func isDerivedTask(t *model.ApprovalInstanceTask) bool {
	return t != nil && (t.DelegatedFrom != 0 || t.AddSignFrom != 0)
}

// isOrdinaryApprovedTask 判断是否为可作为退回候选的普通已通过任务。
// 转交、前/后加签衍生任务只保留审批痕迹，不允许作为退回目标。
func isOrdinaryApprovedTask(t *model.ApprovalInstanceTask) bool {
	return t != nil && t.Status == model.TaskStatusApproved && !isDerivedTask(t)
}

// returnCandidateAllowedTask 判断任务是否可作为退回候选：已完成审批动作
//（已通过 / 已转交）。与 isOrdinaryApprovedTask 不同，此处包含加签与转交衍生任务——
// 加签人、转交人等所有实际完成审批的历史审批人都是合法的退回位置。
func returnCandidateAllowedTask(t *model.ApprovalInstanceTask) bool {
	if t == nil {
		return false
	}
	return t.Status == model.TaskStatusApproved || t.Status == model.TaskStatusDelegated
}

// returnCandidateNodeAllowed 判断候选任务所在节点是否允许作为退回位置。
// 跨节点只能退回更早节点；同一节点仅依次审批允许回到前一位审批人，
// 会签/或签不允许在同一节点内互相退回，避免部分成员未完成时绕过节点规则。
func returnCandidateNodeAllowed(candidateIdx, currentIdx, strategy int) bool {
	if candidateIdx < currentIdx {
		return true
	}
	if candidateIdx > currentIdx {
		return false
	}
	effectiveStrategy := strategy
	if effectiveStrategy == 0 {
		effectiveStrategy = 1
	}
	return effectiveStrategy == 1
}

// taskApprovedAfterReturnTarget 判断历史普通已通过任务是否位于退回目标之后。
// 跨节点按执行路径序号判断；同一节点按操作时间判断。
func taskApprovedAfterReturnTarget(task, target *model.ApprovalInstanceTask, pathIndex map[string]int) bool {
	targetIdx, targetOK := pathIndex[target.NodeID]
	taskIdx, taskOK := pathIndex[task.NodeID]
	if !targetOK || !taskOK {
		return false
	}
	if taskIdx > targetIdx {
		return true
	}
	if taskIdx != targetIdx || task.OperatedAt == nil || target.OperatedAt == nil {
		return false
	}
	return task.OperatedAt.After(*target.OperatedAt)
}

// 转交链状态：无效/未完成/已完成。依次审批推进时，未完成链需要等待，
// 已完成链才允许计入节点完成条件。
const (
	delegatedChainInvalid = iota
	delegatedChainPending
	delegatedChainApproved
)

// delegatedChainStatus 判断普通转交根任务的转交链状态。
// 根任务状态为“已转交”本身不是普通 pending/approved；转交链待处理时占用原审批人，
// 转交链通过后原配置审批人才视为完成。
func delegatedChainStatus(root *model.ApprovalInstanceTask, children map[uint]*model.ApprovalInstanceTask) int {
	if root == nil || root.DelegatedFrom != 0 || root.AddSignFrom != 0 || root.Status != model.TaskStatusDelegated {
		return delegatedChainInvalid
	}
	visited := map[uint]bool{root.ID: true}
	current := root
	for {
		next := children[current.ID]
		if next == nil || visited[next.ID] {
			return delegatedChainInvalid
		}
		visited[next.ID] = true
		switch next.Status {
		case model.TaskStatusPending, model.TaskStatusWaiting:
			return delegatedChainPending
		case model.TaskStatusApproved:
			return delegatedChainApproved
		case model.TaskStatusDelegated:
			current = next
		default:
			return delegatedChainInvalid
		}
	}
}

// returnFromDisapproval 处理「不同意」入口下的退回：
//   - return_mode=1：退回上一位已通过审批人；
//   - return_mode=2：退回指定的前置已通过审批人；
//   - 无前置已通过审批人时兜底退回发起人（实例进入已退回状态，等待发起人重新提交）。
//
// 回到前置审批人时实例仍为进行中：历史任务行保留，目标之后的历史通过任务标记取消，
// 并为目标审批人新建一条待处理任务；目标重新通过后按正常节点策略继续流转。
func returnFromDisapproval(tx *gorm.DB, instance *model.ApprovalInstance, task *model.ApprovalInstanceTask, req *model.ApprovalInstanceTaskApproveReq, curUserID uint) error {
	comment := strings.TrimSpace(req.Comment)
	if comment == "" {
		return errors.New("退回时必须填写退回意见")
	}

	nodes, err := parseFlowNodes(instance.ApprovalFlowJSON)
	if err != nil {
		return err
	}
	curNode := findNodeByID(nodes, task.NodeID)
	if curNode == nil {
		return errors.New("当前审批节点不存在")
	}
	hasReturnPerm := false
	for _, p := range curNode.Permissions {
		if p == 1 {
			hasReturnPerm = true
			break
		}
	}
	if !hasReturnPerm {
		return errors.New("当前节点未开放退回权限")
	}

	// 候选取已完成审批动作的任务（已通过 / 已转交），并包含加签与转交衍生任务——
	// 加签人、转交人等所有实际完成审批的历史审批人都应可作为退回位置；
	// 节点位置以 execution_path 索引为准；同节点按操作时间判断先后。
	pathIndex := make(map[string]int, len(instance.ExecutionPath))
	for i, nodeID := range instance.ExecutionPath {
		pathIndex[nodeID] = i
	}
	curPathIdx, curPathOK := pathIndex[task.NodeID]
	if !curPathOK {
		return errors.New("当前审批节点不在执行路径中")
	}
	var candidates []model.ApprovalInstanceTask
	if err := tx.
		Where("instance_id = ? AND status IN (?, ?) AND id <> ? AND operated_at IS NOT NULL AND assignee_id <> ?",
			instance.ID, model.TaskStatusApproved, model.TaskStatusDelegated, task.ID, curUserID).
		Order("sort ASC, operated_at ASC, id ASC").
		Find(&candidates).Error; err != nil {
		return err
	}
	validTargets := make([]model.ApprovalInstanceTask, 0, len(candidates))
	for _, candidate := range candidates {
		if !returnCandidateAllowedTask(&candidate) {
			continue
		}
		candidatePathIdx, candidatePathOK := pathIndex[candidate.NodeID]
		if !candidatePathOK {
			continue
		}
		if !returnCandidateNodeAllowed(candidatePathIdx, curPathIdx, curNode.Strategy) {
			continue
		}
		if candidatePathIdx == curPathIdx && candidate.OperatedAt != nil && task.OperatedAt != nil &&
			candidate.OperatedAt.After(*task.OperatedAt) {
			continue
		}
		validTargets = append(validTargets, candidate)
	}
	sort.SliceStable(validTargets, func(i, j int) bool {
		left, right := validTargets[i], validTargets[j]
		if pathIndex[left.NodeID] != pathIndex[right.NodeID] {
			return pathIndex[left.NodeID] < pathIndex[right.NodeID]
		}
		leftTime, rightTime := time.Time{}, time.Time{}
		if left.OperatedAt != nil {
			leftTime = *left.OperatedAt
		}
		if right.OperatedAt != nil {
			rightTime = *right.OperatedAt
		}
		if !leftTime.Equal(rightTime) {
			return leftTime.Before(rightTime)
		}
		return left.ID < right.ID
	})

	if len(validTargets) == 0 {
		if req.ReturnMode == 2 {
			return errors.New("暂无可退回的前置审批人")
		}
		return rejectToInitiator(tx, instance, comment, curUserID)
	}

	var target model.ApprovalInstanceTask
	switch req.ReturnMode {
	case 2:
		found := false
		for _, candidate := range validTargets {
			if candidate.ID == req.TargetTaskID {
				target = candidate
				found = true
				break
			}
		}
		if !found {
			return errors.New("退回目标审批人不存在或不可选择")
		}
	case 0, 1:
		target = validTargets[len(validTargets)-1]
	default:
		return errors.New("非法的退回方式")
	}

	now := time.Now()

	// 取消当前所有待处理/加签等待任务；当前任务已由调用方标记为已退回。
	if err := tx.Model(&model.ApprovalInstanceTask{}).
		Where("instance_id = ? AND status IN (?, ?)", instance.ID, model.TaskStatusPending, model.TaskStatusWaiting).
		Updates(map[string]interface{}{
			"status":     model.TaskStatusCancelled,
			"updated_at": now,
			"updated_by": curUserID,
		}).Error; err != nil {
		return err
	}

	// 目标之后的历史通过任务保留行记录，但标记为已取消；目标重新通过后再生成新的待办。
	var laterApproved []model.ApprovalInstanceTask
	if err := tx.
		Where("instance_id = ? AND status = ? AND id <> ? AND delegated_from = 0 AND add_sign_from = 0",
			instance.ID, model.TaskStatusApproved, target.ID).
		Find(&laterApproved).Error; err != nil {
		return err
	}
	for _, later := range laterApproved {
		if !taskApprovedAfterReturnTarget(&later, &target, pathIndex) {
			continue
		}
		if err := tx.Model(&later).Updates(map[string]interface{}{
			"status":     model.TaskStatusCancelled,
			"updated_at": now,
			"updated_by": curUserID,
		}).Error; err != nil {
			return err
		}
	}

	targetPathIdx, targetPathOK := pathIndex[target.NodeID]
	if !targetPathOK {
		return errors.New("退回目标审批人不在执行路径中")
	}

	// 前置/后置审批模式：「不重复审批」仅适用于目标审批人在实例内存在自动通过记录的
	// 重复成员——他们因前后置审批被跳过真实审批（如 status=Approved 且 operated_at 为空），
	// 被退回时同样不再重复审批。
	// 真实操作过的审批人（含退回动作生成的待办通过记录）被退回时永远生成真实待办重新审批：
	// 否则退回目标会被自动通过跳过，形成「退回 → 自动通过 → 无待办」的无止境循环。
	if mode := parseApprovalMode(instance.ApprovalOtherJSON); mode == "pre" || mode == "post" {
		var autoPassed int64
		if err := tx.Model(&model.ApprovalInstanceTask{}).
			Where("instance_id = ? AND assignee_id = ? AND status = ? AND operated_at IS NULL AND delegated_from = 0 AND add_sign_from = 0",
				instance.ID, target.AssigneeID, model.TaskStatusApproved).
			Count(&autoPassed).Error; err != nil {
			return err
		}
		if autoPassed > 0 {
			returnComment := autoApprovedComment(mode, "退回后不重复审批")
			if err := createAutoApprovedTask(tx, instance, target.NodeID, target.NodeName, target.Sort, target.AssigneeID, curUserID, returnComment); err != nil {
				return err
			}
			instance.Status = model.InstanceStatusRunning
			instance.CurrentNodeIdx = targetPathIdx
			instance.Result = ""
			instance.FinishedAt = nil
			if err := tx.Model(instance).Updates(map[string]interface{}{
				"status":           model.InstanceStatusRunning,
				"current_node_idx": targetPathIdx,
				"result":           "",
				"finished_at":      nil,
				"updated_by":       curUserID,
			}).Error; err != nil {
				return err
			}
			return advanceToNextNode(tx, instance, nodes, curUserID, returnComment)
		}
	}

	// 为目标审批人新建待处理任务，旧通过任务继续作为时间线历史记录。
	newTask := model.ApprovalInstanceTask{
		InstanceID: instance.ID,
		NodeID:     target.NodeID,
		NodeName:   target.NodeName,
		Sort:       target.Sort,
		AssigneeID: target.AssigneeID,
		Status:     model.TaskStatusPending,
	}
	newTask.CreatedBy, newTask.UpdatedBy = curUserID, curUserID
	if err := tx.Create(&newTask).Error; err != nil {
		return err
	}

	instance.Status = model.InstanceStatusRunning
	instance.CurrentNodeIdx = targetPathIdx
	instance.Result = ""
	instance.FinishedAt = nil
	if err := tx.Model(instance).Updates(map[string]interface{}{
		"status":           model.InstanceStatusRunning,
		"current_node_idx": targetPathIdx,
		"result":           "",
		"finished_at":      nil,
		"updated_by":       curUserID,
	}).Error; err != nil {
		return err
	}

	notifyCreate(tx, model.Notification{
		UserID:     target.AssigneeID,
		Type:       1,
		Title:      getInstanceAppName(instance),
		Msg:        "审批被退回，请重新审批",
		InstanceID: instance.ID,
	})
	return nil
}

// finishInstance 完成流程实例（通过/拒绝/作废），同步更新实例状态并取消所有待处理任务。
// 作废（InstanceStatusVoided）由发起人主动终止，不产生抄送记录与结果通知。
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

	// 取消所有待处理/加签等待任务（前加签挂起的原任务一并取消）
	if err := tx.Model(&model.ApprovalInstanceTask{}).
		Where("instance_id = ? AND status IN (?, ?)", instance.ID, model.TaskStatusPending, model.TaskStatusWaiting).
		Updates(map[string]interface{}{
			"status":     model.TaskStatusCancelled,
			"updated_at": now,
			"updated_by": curUserID,
		}).Error; err != nil {
		return err
	}

	// 作废由发起人本人主动终止，不写抄送、不发结果通知；其余终态照常处理
	if status == model.InstanceStatusVoided {
		return nil
	}

	// 流程终结：为 ccTiming=2（流程结束时统一抄送）的抄送节点写入抄送记录（幂等）
	writeCCRecordsOnFinish(tx, instance, curUserID)

	// 结果通知给发起人（类型4）
	appName := getInstanceAppName(instance)
	resultTitle := "审批已通过"
	if status == model.InstanceStatusRejected {
		resultTitle = "审批被拒绝"
	}
	n := model.Notification{
		UserID:     instance.CreatedBy,
		Type:       4,
		Title:      appName,
		Msg:        resultTitle,
		InstanceID: instance.ID,
	}
	notifyCreate(tx, n)

	// 流程通过后执行「流程结束事件」配置的 SQL（仅通过时执行，拒绝/作废不触发）
	if status == model.InstanceStatusPassed {
		runEndEventSQL(tx, instance, appName)
	}

	return nil
}

// extractEndEventSQL 从 approval_flow_json 中提取 { type:"end", event:"..." } 节点的 SQL。
// 解析前不做 type 过滤，直接扫描原始列表。
func extractEndEventSQL(flowJSON any) string {
	if flowJSON == nil {
		return ""
	}
	b, err := json.Marshal(flowJSON)
	if err != nil {
		return ""
	}
	var list []map[string]any
	if err := json.Unmarshal(b, &list); err != nil {
		return ""
	}
	for _, item := range list {
		if t, ok := item["type"]; ok {
			if ts, isStr := t.(string); isStr && ts == "end" {
				if ev, ok := item["event"].(string); ok {
					return strings.TrimSpace(ev)
				}
			}
		}
	}
	return ""
}

// runEndEventSQL 执行流程结束事件 SQL：加载业务数据作为 ${form.xxx} 上下文，
// 复用接口管理的占位符参数化执行。流程结束事件允许 CREATE / ALTER 建表/改表结构。
// 失败不阻断审批终态，仅给发起人发通知。
func runEndEventSQL(tx *gorm.DB, instance *model.ApprovalInstance, appName string) {
	tpl := extractEndEventSQL(instance.ApprovalFlowJSON)
	if tpl == "" {
		return
	}
	if err := validateEndEventSQL(tpl); err != nil {
		notifyCreate(tx, model.Notification{
			UserID:     instance.CreatedBy,
			Type:       4,
			Title:      appName,
			Msg:        "流程结束事件 SQL 校验失败：" + err.Error(),
			InstanceID: instance.ID,
		})
		return
	}
	// 加载业务数据作为 form 上下文
	formData, err := ApplicationDataDetail(instance.AppID, instance.BusinessDataID, &model.ApplicationDataDetailReq{})
	if err != nil || formData == nil {
		notifyCreate(tx, model.Notification{
			UserID:     instance.CreatedBy,
			Type:       4,
			Title:      appName,
			Msg:        "流程结束事件执行失败：业务数据读取失败",
			InstanceID: instance.ID,
		})
		return
	}
	vars := map[string]interface{}{"form": formData}
	finalSQL, args, err := resolveSQLPlaceholders(tpl, vars)
	if err != nil {
		notifyCreate(tx, model.Notification{
			UserID:     instance.CreatedBy,
			Type:       4,
			Title:      appName,
			Msg:        "流程结束事件执行失败：" + err.Error(),
			InstanceID: instance.ID,
		})
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	res := tx.WithContext(ctx).Exec(finalSQL, args...)
	if res.Error != nil {
		notifyCreate(tx, model.Notification{
			UserID:     instance.CreatedBy,
			Type:       4,
			Title:      appName,
			Msg:        "流程结束事件执行失败：" + res.Error.Error(),
			InstanceID: instance.ID,
		})
		return
	}
}

// validateEndEventSQL 流程结束事件 SQL 校验：
//   - 允许 SELECT / INSERT / UPDATE / DELETE / CREATE / ALTER（支持建表、改表结构）
//   - 仍禁止 DROP / TRUNCATE / RENAME / GRANT / REVOKE / EXEC / CALL / BEGIN / COMMIT / ROLLBACK / SET
//   - 禁止分号（不支持多语句）、注释符、文件读写函数
//   - 占位符仅允许 ${form.xxx}
//   - 写操作（INSERT/UPDATE/DELETE）必须带 WHERE；CREATE/ALTER 不要求 WHERE
func validateEndEventSQL(tpl string) error {
	tpl = strings.TrimSpace(tpl)
	if tpl == "" {
		return errors.New("SQL 模板不能为空")
	}
	// 去掉末尾单个分号（用户常复制 SQL 带分号），但中间出现分号仍视为多语句拒绝
	tpl = strings.TrimSuffix(tpl, ";")
	if strings.Contains(tpl, ";") {
		return errors.New("禁止包含分号（不支持多语句）")
	}
	firstRe := regexp.MustCompile(`(?i)^\s*(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER)\b`)
	m := firstRe.FindStringSubmatch(tpl)
	if m == nil {
		return errors.New("SQL 必须以 SELECT/INSERT/UPDATE/DELETE/CREATE/ALTER 开头")
	}
	for _, bad := range []string{"--", "/*", "*/", "#"} {
		if strings.Contains(tpl, bad) {
			return errors.New("禁止包含注释符 " + bad)
		}
	}
	lower := strings.ToLower(tpl)
	for _, kw := range []string{
		"drop", "truncate", "rename", "grant", "revoke", "exec ", "execute ", "call ",
		"begin", "commit", "rollback", "set ",
		"into outfile", "into dumpfile", "load_file", "sleep(", "benchmark(",
	} {
		if strings.Contains(lower, kw) {
			return errors.New("包含禁用关键字：" + strings.TrimSpace(kw))
		}
	}
	// 占位符仅 ${form.xxx}
	anyPhRe := regexp.MustCompile(`\$\{[^}]+\}`)
	for _, ph := range anyPhRe.FindAllString(tpl, -1) {
		if !placeholderExprRe.MatchString(ph[2 : len(ph)-1]) {
			return errors.New("占位符仅支持 ${form.xxx} 形式：" + ph)
		}
	}
	first := strings.ToUpper(m[1])
	if first == "INSERT" || first == "UPDATE" || first == "DELETE" {
		if !sqlWhereRe.MatchString(tpl) {
			return errors.New(first + " 语句必须包含 WHERE 条件，禁止全表操作")
		}
	}
	return nil
}

// writeCCRecordsOnFinish 流程终结时：为执行路径/快照中 ccTiming=2 的抄送节点统一写入抄送记录。
// 抄送失败不阻断流程终态（仅记录层面尽力而为）。
func writeCCRecordsOnFinish(tx *gorm.DB, instance *model.ApprovalInstance, curUserID uint) {
	nodes, err := parseFlowNodes(instance.ApprovalFlowJSON)
	if err != nil {
		return
	}
	now := time.Now()
	for _, n := range nodes {
		if n.Type != 3 || n.CCTiming != 2 {
			continue
		}
		ids, err := resolveMembersUserIDs(n.Members)
		if err != nil || len(ids) == 0 {
			continue
		}
		for _, uid := range ids {
			var cnt int64
			tx.Model(&model.ApprovalCCRecord{}).
				Where("instance_id = ? AND node_id = ? AND user_id = ?", instance.ID, n.ID, uid).
				Count(&cnt)
			if cnt > 0 {
				continue
			}
			rec := model.ApprovalCCRecord{
				InstanceID: instance.ID, NodeID: n.ID, NodeName: n.Label,
				UserID: uid, NotifiedAt: &now,
			}
			rec.CreatedBy, rec.UpdatedBy = curUserID, curUserID
			tx.Create(&rec)
			// 抄送通知（类型3）
			appName := getInstanceAppName(instance)
			notifyCreate(tx, model.Notification{
				UserID:     uid,
				Type:       3,
				Title:      appName,
				Msg:        "您有新的抄送通知",
				InstanceID: instance.ID,
			})
		}
	}
}

// writeCCRecords 当前执行节点（抄送节点，ccTiming=1）写入抄送记录（幂等）
func writeCCRecords(tx *gorm.DB, instance *model.ApprovalInstance, allNodes []flowNode, curUserID uint) error {
	pathNodeIDs := instance.ExecutionPath
	idx := instance.CurrentNodeIdx
	if idx >= len(pathNodeIDs) {
		return nil
	}
	node := findNodeByID(allNodes, pathNodeIDs[idx])
	if node == nil || node.Type != 3 {
		return nil
	}
	ids, err := resolveMembersUserIDs(node.Members)
	if err != nil {
		return err
	}
	now := time.Now()
	for _, uid := range ids {
		var cnt int64
		tx.Model(&model.ApprovalCCRecord{}).
			Where("instance_id = ? AND node_id = ? AND user_id = ?", instance.ID, node.ID, uid).
			Count(&cnt)
		if cnt > 0 {
			continue
		}
		rec := model.ApprovalCCRecord{
			InstanceID: instance.ID, NodeID: node.ID, NodeName: node.Label,
			UserID: uid, NotifiedAt: &now,
		}
		rec.CreatedBy, rec.UpdatedBy = curUserID, curUserID
		if err := tx.Create(&rec).Error; err != nil {
			return err
		}
		// 抄送通知（类型3）
		appName := getInstanceAppName(instance)
		notifyCreate(tx, model.Notification{
			UserID:     uid,
			Type:       3,
			Title:      appName,
			Msg:        "您有新的抄送通知",
			InstanceID: instance.ID,
		})
	}
	return nil
}

// loadOwnedPendingTask 加载并校验待处理审批任务（审批/转交/加签共用）：
//   - 任务不存在 → 审批任务不存在
//   - 任务不属于该实例 → 任务与实例不匹配
//   - 状态非待处理 → 该任务已处理
//   - 非当前用户持有 → 您不是该任务的审批人
func loadOwnedPendingTask(tx *gorm.DB, instanceID, taskID, curUserID uint) (*model.ApprovalInstanceTask, error) {
	var task model.ApprovalInstanceTask
	if err := tx.First(&task, taskID).Error; err != nil {
		return nil, errors.New("审批任务不存在")
	}
	if task.InstanceID != instanceID {
		return nil, errors.New("任务与实例不匹配")
	}
	if task.Status != model.TaskStatusPending {
		return nil, errors.New("该任务已处理")
	}
	if task.AssigneeID != curUserID {
		return nil, errors.New("您不是该任务的审批人")
	}
	return &task, nil
}

// ApprovalTaskApprove 执行审批操作（通过/拒绝/驳回）：
//  1. 校验任务存在、状态=待处理、assignee_id=当前用户
//  2. 校验实例存在、状态=进行中
//  3. 事务内更新任务状态并按操作类型流转
func ApprovalTaskApprove(curUserID uint, instanceID, taskID uint, req *model.ApprovalInstanceTaskApproveReq) error {
	return withNotify(func(tx *gorm.DB) error {
		// 1. 校验任务（存在/归属/待处理/当前用户持有）
		task, err := loadOwnedPendingTask(tx, instanceID, taskID, curUserID)
		if err != nil {
			return err
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

		// 2.5 审批人修改了业务数据（字段权限 perm=2 可编辑字段）：同一事务内更新业务表
		if len(req.BusinessData) > 0 {
			if err := ApplicationDataUpdateWithDB(tx, instance.AppID, instance.BusinessDataID, curUserID, req.BusinessData); err != nil {
				return err
			}
		}

		// 3. 更新任务状态
		task.Status = req.Action
		task.Comment = req.Comment
		task.OperatedAt = &now
		task.UpdatedBy = curUserID
		if err := tx.Save(task).Error; err != nil {
			return err
		}

		// 4. 按操作类型处理流转
		switch req.Action {
		case model.TaskStatusApproved: // 通过
			return handleNodeApproval(tx, &instance, task, curUserID)
		case model.TaskStatusReturned: // 不同意入口：退回上一步 / 指定前置审批人；无前置审批人时退回发起人
			return returnFromDisapproval(tx, &instance, task, req, curUserID)
		default:
			return errors.New("非法的操作类型")
		}
	})
}

// handleNodeApproval 审批通过后判断节点是否完成，推进到下一节点或结束流程
func handleNodeApproval(tx *gorm.DB, instance *model.ApprovalInstance, task *model.ApprovalInstanceTask, curUserID uint) error {
	// 解析流程快照
	nodes, err := parseFlowNodes(instance.ApprovalFlowJSON)
	if err != nil {
		return err
	}

	node := findNodeByID(nodes, task.NodeID)
	if node == nil {
		return errors.New("流程节点不存在")
	}

	// 原审批人（非加签任务）通过：激活本节点处于等待态的后加签任务（waiting → pending），
	// 使其进入加签人待办；加签人通过后再按节点策略推进。
	if task.AddSignFrom == 0 {
		// 先查出将被激活的后加签任务，更新后逐个推送待办通知
		var waiting []model.ApprovalInstanceTask
		if err := tx.Where("instance_id = ? AND node_id = ? AND add_sign_type = 2 AND status = ?",
			instance.ID, task.NodeID, model.TaskStatusWaiting).Find(&waiting).Error; err != nil {
			return err
		}
		if len(waiting) > 0 {
			ids := make([]uint, 0, len(waiting))
			for _, w := range waiting {
				ids = append(ids, w.ID)
			}
			if err := tx.Model(&model.ApprovalInstanceTask{}).
				Where("id IN ?", ids).
				Updates(map[string]interface{}{
					"status":     model.TaskStatusPending,
					"updated_at": time.Now(),
					"updated_by": curUserID,
				}).Error; err != nil {
				return err
			}
			// 后加签任务由等待态激活进入待办 → 待办通知（类型1）
			// 注意：或签节点（strategy=3）在本节点任一审批人通过后即节点通过，
			// 刚被激活的后加签任务会在同事务内被置为已取消，因此不推送，
			// 避免产生“推送了但任务已取消”的幽灵待办通知
			if node.Strategy != 3 {
				appName := getInstanceAppName(instance)
				for _, w := range waiting {
					notifyCreate(tx, model.Notification{
						UserID:     w.AssigneeID,
						Type:       1,
						Title:      appName,
						Msg:        "您有新的审批待办",
						InstanceID: instance.ID,
					})
				}
			}
		}
	}

	// 链式后加签激活：任何任务（含前加签 / 转交衍生任务）通过时，
	// 激活「以本任务为来源的后加签任务」（add_sign_from=本任务、add_sign_type=2、等待态）。
	// 原审批人（AddSignFrom==0）通过时上面已按节点激活本节点全部 waiting 后加签，
	// 此处再次查询已无等待任务，不会重复激活 / 重复通知；
	// 而衍生任务（如前加签）通过时，其上挂的后加签依赖本段才能进入待办。
	var chained []model.ApprovalInstanceTask
	if err := tx.Where("add_sign_from = ? AND add_sign_type = 2 AND status = ?",
		task.ID, model.TaskStatusWaiting).Find(&chained).Error; err != nil {
		return err
	}
	if len(chained) > 0 {
		ids := make([]uint, 0, len(chained))
		for _, w := range chained {
			ids = append(ids, w.ID)
		}
		if err := tx.Model(&model.ApprovalInstanceTask{}).
			Where("id IN ?", ids).
			Updates(map[string]interface{}{
				"status":     model.TaskStatusPending,
				"updated_at": time.Now(),
				"updated_by": curUserID,
			}).Error; err != nil {
			return err
		}
		appName := getInstanceAppName(instance)
		for _, w := range chained {
			notifyCreate(tx, model.Notification{
				UserID:     w.AssigneeID,
				Type:       1,
				Title:      appName,
				Msg:        "您有新的审批待办",
				InstanceID: instance.ID,
			})
		}
	}

	// 加签任务完成：前加签恢复原审批人任务待处理；后加签继续走节点策略逻辑
	//（依次=轮后续审批人 / 会签=统计剩余审批人 / 或签=直接推进）
	if task.AddSignFrom > 0 && task.AddSignType == 1 {
		// 前加签通过，原审批人任务由等待态恢复待处理 → 重新进入其待办并推送通知
		var origin model.ApprovalInstanceTask
		if err := tx.First(&origin, task.AddSignFrom).Error; err != nil {
			return err
		}
		if err := tx.Model(&model.ApprovalInstanceTask{}).
			Where("id = ?", task.AddSignFrom).
			Update("status", model.TaskStatusPending).Error; err != nil {
			return err
		}
		notifyCreate(tx, model.Notification{
			UserID:     origin.AssigneeID,
			Type:       1,
			Title:      getInstanceAppName(instance),
			Msg:        "您有新的审批待办",
			InstanceID: instance.ID,
		})
		return nil
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
		return advanceToNextNode(tx, instance, nodes, curUserID, task.Comment)

	case 2: // 会签：全部审批人通过 -> 节点通过
		var pendingCount int64
		tx.Model(&model.ApprovalInstanceTask{}).
			Where("instance_id = ? AND node_id = ? AND status = ?",
				instance.ID, task.NodeID, model.TaskStatusPending).
			Count(&pendingCount)
		if pendingCount > 0 {
			return nil // 还有人未审批，等待
		}
		return advanceToNextNode(tx, instance, nodes, curUserID, task.Comment)

	case 1: // 依次审批：当前人通过 -> 生成下一个人的任务
		return handleSequentialNext(tx, instance, node, nodes, curUserID, task)

	default:
		return advanceToNextNode(tx, instance, nodes, curUserID, task.Comment)
	}
}

// handleSequentialNext 依次审批：检查同节点是否还有后续审批人
func handleSequentialNext(tx *gorm.DB, instance *model.ApprovalInstance, node *flowNode, allNodes []flowNode, curUserID uint, task *model.ApprovalInstanceTask) error {
	// 解析该节点的全部审批人
	userIDs, err := resolveApproverUserIDs(*node, nil)
	if err != nil {
		return fmt.Errorf("解析审批人失败: %w", err)
	}

	// 统计同节点仍有效的普通审批人。退回会保留历史任务行并取消后续历史任务，
	// 因此不能按任务行数直接取下一人索引；加签衍生任务另有独立等待/完成语义。
	// 转交根任务（status=4）虽然不是普通 pending/approved，但其转交链仍在处理或已完成，
	// 原配置审批人应视为已被占用，避免转交人审批后又向原审批人重复生成待办。
	var nodeTasks []model.ApprovalInstanceTask
	if err := tx.
		Where("instance_id = ? AND node_id = ? AND add_sign_from = 0",
			instance.ID, node.ID).
		Find(&nodeTasks).Error; err != nil {
		return err
	}
	activeAssignees := make(map[uint]bool, len(userIDs))
	delegatedChildren := make(map[uint]*model.ApprovalInstanceTask)
	var delegatedRoots []*model.ApprovalInstanceTask
	for i := range nodeTasks {
		taskRow := &nodeTasks[i]
		if taskRow.DelegatedFrom != 0 {
			delegatedChildren[taskRow.DelegatedFrom] = taskRow
			continue
		}
		switch taskRow.Status {
		case model.TaskStatusPending, model.TaskStatusApproved:
			activeAssignees[taskRow.AssigneeID] = true
		case model.TaskStatusDelegated:
			delegatedRoots = append(delegatedRoots, taskRow)
		}
	}
	pendingDelegatedChains := 0
	for _, root := range delegatedRoots {
		switch delegatedChainStatus(root, delegatedChildren) {
		case delegatedChainPending:
			activeAssignees[root.AssigneeID] = true
			pendingDelegatedChains++
		case delegatedChainApproved:
			activeAssignees[root.AssigneeID] = true
			// 转交链已完成：承接人（链尾任务）已实际审批通过。
			// 若承接人恰好是本节点配置成员，其配置位置视为已被占位——
			// 同节点仅需一次真实审批，配置位置以自动通过记录体现（一次审批、两次通过），
			// 避免向同一人再次生成待办造成「同节点两个同一人」。
			tail := root
			for {
				child, ok := delegatedChildren[tail.ID]
				if !ok {
					break
				}
				tail = child
			}
			if tail.Status == model.TaskStatusApproved {
				activeAssignees[tail.AssigneeID] = true
				if containsUint(userIDs, tail.AssigneeID) {
					// 该配置成员尚无自己的普通任务行（未以自身身份审过）→ 补自动通过记录
					hasOwn := false
					for i := range nodeTasks {
						r := &nodeTasks[i]
						if r.DelegatedFrom == 0 && r.AddSignFrom == 0 && r.AssigneeID == tail.AssigneeID {
							hasOwn = true
							break
						}
					}
					if !hasOwn {
						mode := parseApprovalMode(instance.ApprovalOtherJSON)
						if err := createAutoApprovedTask(tx, instance, node.ID, node.Label, instance.CurrentNodeIdx, tail.AssigneeID, curUserID, autoApprovedComment(mode, "自动通过")); err != nil {
							return err
						}
					}
				}
			}
		}
	}

	// 本节点存在未完成的后加签任务（add_sign_type=2）：先等加签人处理，不轮后续审批人/不推进下一节点
	var pendingAddSign int64
	tx.Model(&model.ApprovalInstanceTask{}).
		Where("instance_id = ? AND node_id = ? AND add_sign_from > 0 AND add_sign_type = 2 AND status = ?",
			instance.ID, node.ID, model.TaskStatusPending).
		Count(&pendingAddSign)
	if pendingAddSign > 0 || pendingDelegatedChains > 0 {
		return nil
	}

	nextIndex := -1
	for idx, userID := range userIDs {
		if !activeAssignees[userID] {
			nextIndex = idx
			break
		}
	}
	if nextIndex >= 0 {
		// 还有后续审批人：生成下一个人的待办，并复用统一通知逻辑
		return createPendingTask(tx, instance, node.ID, node.Label, instance.CurrentNodeIdx, userIDs[nextIndex], curUserID)
	}

	// 该节点所有人已审批完 -> 推进到下一节点
	return advanceToNextNode(tx, instance, allNodes, curUserID, task.Comment)
}

// ApprovalTaskDelegate 转交审批任务：
//  1. 校验原任务存在、状态=待处理、assignee_id=当前用户
//  2. 校验目标用户存在
//  3. 事务内原任务标记为已转交，并新建转交任务
func ApprovalTaskDelegate(curUserID uint, instanceID, taskID uint, req *model.ApprovalInstanceTaskDelegateReq) error {
	return withNotify(func(tx *gorm.DB) error {
		// 校验任务（存在/归属/待处理/当前用户持有）
		task, err := loadOwnedPendingTask(tx, instanceID, taskID, curUserID)
		if err != nil {
			return err
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
		if err := tx.Save(task).Error; err != nil {
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
		if err := tx.Create(&newTask).Error; err != nil {
			return err
		}

		// 待办通知（类型1）：转交后新任务进入目标用户待办
		var instance model.ApprovalInstance
		if err := tx.First(&instance, instanceID).Error; err == nil {
			notifyCreate(tx, model.Notification{
				UserID:     req.ToUserID,
				Type:       1,
				Title:      getInstanceAppName(&instance),
				Msg:        "您有新的审批待办",
				InstanceID: instance.ID,
			})
		}
		return nil
	})
}

// ApprovalTaskAddSign 加签审批任务：
//  1. 校验原任务存在、状态=待处理、assignee_id=当前用户，实例进行中
//  2. 校验节点 permissions 开放加签权限（含 3）
//  3. 前加签（type=1）：原任务置为加签等待（TaskStatusWaiting），加签人先审，通过后原任务恢复待处理
//  4. 后加签（type=2）：加签人任务置为待处理，原审批人通过后由加签人继续审批
func ApprovalTaskAddSign(curUserID uint, instanceID, taskID uint, req *model.ApprovalInstanceTaskAddSignReq) error {
	return withNotify(func(tx *gorm.DB) error {
		// 1. 校验任务（存在/归属/待处理/当前用户持有）
		task, err := loadOwnedPendingTask(tx, instanceID, taskID, curUserID)
		if err != nil {
			return err
		}

		// 2. 校验实例
		var instance model.ApprovalInstance
		if err := tx.First(&instance, instanceID).Error; err != nil {
			return errors.New("流程实例不存在")
		}
		if instance.Status != model.InstanceStatusRunning {
			return errors.New("该流程已结束")
		}

		// 3. 校验目标用户
		var user model.User
		if err := tx.First(&user, req.UserID).Error; err != nil {
			return errors.New("加签用户不存在")
		}
		if req.UserID == curUserID {
			return errors.New("不能加签给自己")
		}

		// 4. 校验节点开放加签权限（permissions 含 3）
		nodes, err := parseFlowNodes(instance.ApprovalFlowJSON)
		if err != nil {
			return err
		}
		node := findNodeByID(nodes, task.NodeID)
		if node == nil {
			return errors.New("流程节点不存在")
		}
		hasAddSignPerm := false
		for _, p := range node.Permissions {
			if p == 3 {
				hasAddSignPerm = true
				break
			}
		}
		if !hasAddSignPerm {
			return errors.New("该节点未开放加签权限")
		}

		// 5. 前加签：原任务挂起为加签等待
		if req.Type == 1 {
			if err := tx.Model(&model.ApprovalInstanceTask{}).
				Where("id = ?", task.ID).
				Update("status", model.TaskStatusWaiting).Error; err != nil {
				return err
			}
		}

		// 6. 创建加签任务（前/后加签均创建）
		// 后加签（type=2）：任务先置为等待态（TaskStatusWaiting），待原审批人通过后激活为待处理，
		// 保证“我通过后，加签人继续审批”的时序语义，加签任务不会提前出现在加签人待办中。
		addTaskStatus := model.TaskStatusPending
		if req.Type == 2 {
			addTaskStatus = model.TaskStatusWaiting
		}
		addTask := model.ApprovalInstanceTask{
			InstanceID:  instance.ID,
			NodeID:      node.ID,
			NodeName:    node.Label,
			Sort:        task.Sort,
			AssigneeID:  req.UserID,
			Status:      addTaskStatus,
			AddSignFrom: task.ID,
			AddSignType: req.Type,
		}
		addTask.CreatedBy, addTask.UpdatedBy = curUserID, curUserID
		if err := tx.Create(&addTask).Error; err != nil {
			return err
		}

		// 待办通知（类型1）：前加签任务创建即为待处理，立即通知加签人；
		// 后加签任务为等待态、不进待办，故此处不推送——待原审批人通过、任务激活时再推送
		if addTaskStatus == model.TaskStatusPending {
			notifyCreate(tx, model.Notification{
				UserID:     req.UserID,
				Type:       1,
				Title:      getInstanceAppName(&instance),
				Msg:        "您有新的审批待办",
				InstanceID: instance.ID,
			})
		}
		return nil
	})
}
