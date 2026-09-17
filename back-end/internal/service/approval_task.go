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
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"back-end/internal/database"
	"back-end/internal/model"

	"gorm.io/gorm"
)

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

	// 抄送节点（type=3）：通知类节点不生成审批待办，直接推进到下一节点
	if node.Type == 3 {
		// 抄送时机 ccTiming=1（审批通过后抄送）：节点被推进经过时写入抄送记录
		if node.CCTiming == 1 {
			if err := writeCCRecords(tx, instance, allNodes, curUserID); err != nil {
				return err
			}
		}
		return advanceToNextNode(tx, instance, allNodes, curUserID)
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
			return handleAutoPassNode(tx, instance, allNodes, curUserID)
		}
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

// finishInstance 完成流程实例（通过/拒绝/驳回/撤回），同步更新实例状态并取消所有待处理任务
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

	// 流程终结：为 ccTiming=2（流程结束时统一抄送）的抄送节点写入抄送记录（幂等）
	writeCCRecordsOnFinish(tx, instance, curUserID)

	return nil
}

// writeCCRecordsOnFinish 流程终结时：为执行路径/快照中 ccTiming=2 的抄送节点统一写入抄送记录。
// 抄送失败不阻断流程终态（仅记录层面尽力而为）。
func writeCCRecordsOnFinish(tx *gorm.DB, instance *model.ApprovalInstance, curUserID uint) {
	nodes, err := parseFlowNodes(instance.FlowSnapshotJSON)
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
		}
	}
}

// writeCCRecords 当前执行节点（抄送节点，ccTiming=1）写入抄送记录（幂等）
func writeCCRecords(tx *gorm.DB, instance *model.ApprovalInstance, allNodes []flowNode, curUserID uint) error {
	var pathNodeIDs []string
	if err := json.Unmarshal([]byte(instance.ExecutionPath), &pathNodeIDs); err != nil {
		return err
	}
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
	}
	return nil
}

// ApprovalTaskApprove 执行审批操作（通过/拒绝/驳回）：
//  1. 校验任务存在、状态=待处理、assignee_id=当前用户
//  2. 校验实例存在、状态=进行中
//  3. 事务内更新任务状态并按操作类型流转
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

	// 原审批人（非加签任务）通过：激活本节点处于等待态的后加签任务（waiting → pending），
	// 使其进入加签人待办；加签人通过后再按节点策略推进。
	if task.AddSignFrom == 0 {
		if err := tx.Model(&model.ApprovalInstanceTask{}).
			Where("instance_id = ? AND node_id = ? AND add_sign_type = 2 AND status = ?",
				instance.ID, task.NodeID, model.TaskStatusWaiting).
			Updates(map[string]interface{}{
				"status":     model.TaskStatusPending,
				"updated_at": time.Now(),
				"updated_by": curUserID,
			}).Error; err != nil {
			return err
		}
	}

	// 加签任务完成：前加签恢复原审批人任务待处理；后加签继续走节点策略逻辑
	//（依次=轮后续审批人 / 会签=统计剩余审批人 / 或签=直接推进）
	if task.AddSignFrom > 0 && task.AddSignType == 1 {
		if err := tx.Model(&model.ApprovalInstanceTask{}).
			Where("id = ?", task.AddSignFrom).
			Update("status", model.TaskStatusPending).Error; err != nil {
			return err
		}
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
		return handleSequentialNext(tx, instance, node, nodes, curUserID)

	default:
		return advanceToNextNode(tx, instance, nodes, curUserID)
	}
}

// handleSequentialNext 依次审批：检查同节点是否还有后续审批人
func handleSequentialNext(tx *gorm.DB, instance *model.ApprovalInstance, node *flowNode, allNodes []flowNode, curUserID uint) error {
	// 统计同节点已生成的任务数（排除转交衍生任务 delegated_from>0 与加签任务 add_sign_from>0）
	var taskCount int64
	tx.Model(&model.ApprovalInstanceTask{}).
		Where("instance_id = ? AND node_id = ? AND delegated_from = 0 AND add_sign_from = 0", instance.ID, node.ID).
		Count(&taskCount)

	// 解析该节点的全部审批人
	userIDs, err := resolveApproverUserIDs(*node, nil)
	if err != nil {
		return fmt.Errorf("解析审批人失败: %w", err)
	}
	// 本节点存在未完成的后加签任务（add_sign_type=2）：先等加签人处理，不轮后续审批人/不推进下一节点
	var pendingAddSign int64
	tx.Model(&model.ApprovalInstanceTask{}).
		Where("instance_id = ? AND node_id = ? AND add_sign_from > 0 AND add_sign_type = 2 AND status = ?",
			instance.ID, node.ID, model.TaskStatusPending).
		Count(&pendingAddSign)
	if pendingAddSign > 0 {
		return nil
	}

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
	return advanceToNextNode(tx, instance, allNodes, curUserID)
}

// ApprovalTaskDelegate 转交审批任务：
//  1. 校验原任务存在、状态=待处理、assignee_id=当前用户
//  2. 校验目标用户存在
//  3. 事务内原任务标记为已转交，并新建转交任务
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

// ApprovalTaskAddSign 加签审批任务：
//  1. 校验原任务存在、状态=待处理、assignee_id=当前用户，实例进行中
//  2. 校验节点 permissions 开放加签权限（含 3）
//  3. 前加签（type=1）：原任务置为加签等待（TaskStatusWaiting），加签人先审，通过后原任务恢复待处理
//  4. 后加签（type=2）：加签人任务置为待处理，原审批人通过后由加签人继续审批
func ApprovalTaskAddSign(curUserID uint, instanceID, taskID uint, req *model.ApprovalInstanceTaskAddSignReq) error {
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

		// 3. 校验目标用户
		var user model.User
		if err := tx.First(&user, req.UserID).Error; err != nil {
			return errors.New("加签用户不存在")
		}
		if req.UserID == curUserID {
			return errors.New("不能加签给自己")
		}

		// 4. 校验节点开放加签权限（permissions 含 3）
		nodes, err := parseFlowNodes(instance.FlowSnapshotJSON)
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
		return tx.Create(&addTask).Error
	})
}
