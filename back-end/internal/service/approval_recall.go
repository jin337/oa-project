package service

// ============================================================
// 审核撤回（审批人撤回自己的操作）
// ============================================================
// 允许审批人在「审核撤回时间」窗口内撤回自己刚做出的操作，前提：
//   - 操作人本人（task.assignee_id = 当前用户）
//   - 实例仍处可撤回状态（进行中；退回发起人场景允许已驳回）
//   - 在窗口内（从本人操作时间起算，默认 30 分钟）
//   - 本人操作是实例内最后一次操作（其后无任何其他已操作任务）
//   - 或签节点上的「通过」不可撤回（任一成员通过节点即生效）
//
// 支持撤回的操作与恢复动作：
//   - 通过（含后加签任务上的通过）：任务恢复待处理，删除该操作产生的未处理后果任务
//   - 退回：任务恢复待处理；退回给前置审批人时删除目标新待办、恢复被取消的历史通过任务
//    与挂起任务，执行游标回到本人节点；退回发起人时实例恢复进行中
//   - 转交：删除转交子任务链，原任务恢复待处理
//   - 前加签（本人任务挂起）：删除加签子任务链，原任务恢复待处理
//   - 后加签（本人任务仍待处理）：删除等待态加签子任务
// ============================================================

import (
	"errors"
	"time"

	"back-end/internal/database"
	"back-end/internal/model"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// ApprovalTaskRecall 审批人撤回自己已操作的任务（审核撤回）。
// 前置校验统一在事务内完成，恢复动作按任务状态分发。
func ApprovalTaskRecall(curUserID, instanceID, taskID uint) error {
	return database.DB.Transaction(func(tx *gorm.DB) error {
		// 1. 实例串行化闸门：先锁实例行，锁序恒为「实例 → 任务」，
		//    与审批/转交/加签/撤回/作废等入口一致，避免并发写交叉死锁
		var instance model.ApprovalInstance
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&instance, instanceID).Error; err != nil {
			return errors.New("流程实例不存在")
		}

		// 2. 任务存在且归属当前实例
		var task model.ApprovalInstanceTask
		if err := tx.First(&task, taskID).Error; err != nil {
			return errors.New("审批任务不存在")
		}
		if task.InstanceID != instanceID {
			return errors.New("任务与实例不匹配")
		}
		if task.AssigneeID != curUserID {
			return errors.New("您不是该任务的审批人，无法撤回该操作")
		}

		// 3. 计算操作时间并按任务状态判定可撤回的操作类型
		var actionTime time.Time
		switch task.Status {
		case model.TaskStatusApproved, model.TaskStatusReturned, model.TaskStatusDelegated:
			if task.OperatedAt == nil {
				return errors.New("该任务缺少操作时间，无法撤回")
			}
			actionTime = *task.OperatedAt
		case model.TaskStatusWaiting:
			// 前加签挂起：本人任务由待处理置为挂起，操作时间取加签子任务创建时间
			if task.AddSignFrom != 0 {
				return errors.New("该任务尚未操作，无法撤回")
			}
			var child model.ApprovalInstanceTask
			if err := tx.Where("instance_id = ? AND add_sign_from = ? AND add_sign_type = 1", instanceID, task.ID).
				Order("created_at DESC, id DESC").First(&child).Error; err != nil {
				return errors.New("未找到可撤回的前加签任务")
			}
			actionTime = child.CreatedAt
		case model.TaskStatusPending:
			// 后加签：本人任务仍待处理，操作时间取等待态加签子任务创建时间
			var child model.ApprovalInstanceTask
			if err := tx.Where("instance_id = ? AND add_sign_from = ? AND add_sign_type = 2 AND status = ?",
				instanceID, task.ID, model.TaskStatusWaiting).
				Order("created_at DESC, id DESC").First(&child).Error; err != nil {
				return errors.New("未找到可撤回的后加签任务")
			}
			actionTime = child.CreatedAt
		default:
			return errors.New("该任务不存在可撤回的操作")
		}

		// 4. 实例状态校验：退回允许进行中（退回给前置审批人）或已驳回（退回发起人）；其余操作仅进行中
		if task.Status == model.TaskStatusReturned {
			if instance.Status != model.InstanceStatusRunning && instance.Status != model.InstanceStatusReturned {
				return errors.New("该流程已结束，无法撤回")
			}
		} else if instance.Status != model.InstanceStatusRunning {
			return errors.New("该流程已结束，无法撤回")
		}

		// 5. 审核撤回时间窗口（实例快照优先，缺失回退当前生效版本配置，默认 30 分钟）
		window, ok := parseRecallWindowDuration(instance.ApprovalOtherJSON)
		if !ok {
			window = activeRecallDuration(instance.AppID)
		}
		if actionTime.Add(window).Before(time.Now()) {
			return errors.New("已超过审核撤回时间窗口，无法撤回")
		}

		// 6. 最后一次操作：本人操作之后不得存在其他已操作任务
		var laterOps int64
		if err := tx.Model(&model.ApprovalInstanceTask{}).
			Where("instance_id = ? AND id <> ? AND operated_at IS NOT NULL AND operated_at > ?",
				instanceID, task.ID, actionTime).
			Count(&laterOps).Error; err != nil {
			return err
		}
		if laterOps > 0 {
			return errors.New("该操作之后已有其他审批操作，无法撤回")
		}

		// 7. 按操作类型恢复
		switch task.Status {
		case model.TaskStatusApproved:
			return undoApprovalRecall(tx, &instance, &task)
		case model.TaskStatusReturned:
			return undoReturnRecall(tx, &instance, &task)
		case model.TaskStatusDelegated:
			return undoDelegateRecall(tx, &task)
		case model.TaskStatusWaiting:
			return undoPreAddSignRecall(tx, &task)
		default: // Pending（后加签）
			return undoPostAddSignRecall(tx, &task)
		}
	})
}

// resetTaskPending 将任务恢复为待处理并清空审批意见与操作时间。
func resetTaskPending(tx *gorm.DB, task *model.ApprovalInstanceTask) error {
	return tx.Model(&model.ApprovalInstanceTask{}).
		Where("id = ?", task.ID).
		Updates(map[string]interface{}{
			"status":      model.TaskStatusPending,
			"comment":     "",
			"operated_at": nil,
			"updated_by":  task.AssigneeID,
		}).Error
}

// deleteDerivedChain 删除以 rootID 为根的衍生任务链（转交子任务 / 加签子任务及其再衍生）。
// 按前沿层逐层查询（delegated_from/add_sign_from 属于当前层），避免用累计列表重复命中导致死循环。
func deleteDerivedChain(tx *gorm.DB, instanceID, rootID uint) error {
	delIDs := make([]uint, 0, 8)
	frontier := []uint{rootID}
	seen := map[uint]bool{rootID: true}
	for len(frontier) > 0 {
		var children []uint
		if err := tx.Model(&model.ApprovalInstanceTask{}).
			Where("instance_id = ? AND (delegated_from IN ? OR add_sign_from IN ?)", instanceID, frontier, frontier).
			Pluck("id", &children).Error; err != nil {
			return err
		}
		next := make([]uint, 0, len(children))
		for _, c := range children {
			if seen[c] {
				continue
			}
			seen[c] = true
			delIDs = append(delIDs, c)
			next = append(next, c)
		}
		frontier = next
	}
	if len(delIDs) > 0 {
		return tx.Where("instance_id = ? AND id IN ?", instanceID, delIDs).
			Delete(&model.ApprovalInstanceTask{}).Error
	}
	return nil
}

// cleanUnoperatedConsequences 删除本人任务之外的未处理任务及其衍生链。
// sameNodeOnly=true（会签）：保留同节点普通待处理任务（其他成员），删除其他节点未处理任务与同节点衍生任务；
// sameNodeOnly=false（依次）：删除全部其他未处理任务（后继任务及其衍生链）。
// 衍生链同样按前沿层逐层查询去重，避免累计列表重复命中导致死循环。
func cleanUnoperatedConsequences(tx *gorm.DB, instanceID uint, myTaskID uint, myNodeID string, sameNodeOnly bool) error {
	q := tx.Where("instance_id = ? AND id <> ? AND status IN (?, ?)",
		instanceID, myTaskID, model.TaskStatusPending, model.TaskStatusWaiting)
	if sameNodeOnly {
		q = q.Where("node_id <> ? OR add_sign_from > 0 OR delegated_from > 0", myNodeID)
	}
	var seed []model.ApprovalInstanceTask
	if err := q.Find(&seed).Error; err != nil {
		return err
	}
	delIDs := make([]uint, 0, len(seed))
	seen := make(map[uint]bool, len(seed))
	for i := range seed {
		delIDs = append(delIDs, seed[i].ID)
		seen[seed[i].ID] = true
	}
	frontier := delIDs
	for len(frontier) > 0 {
		var children []uint
		if err := tx.Model(&model.ApprovalInstanceTask{}).
			Where("instance_id = ? AND (delegated_from IN ? OR add_sign_from IN ?)", instanceID, frontier, frontier).
			Pluck("id", &children).Error; err != nil {
			return err
		}
		next := make([]uint, 0, len(children))
		for _, c := range children {
			if seen[c] {
				continue
			}
			seen[c] = true
			delIDs = append(delIDs, c)
			next = append(next, c)
		}
		frontier = next
	}
	if len(delIDs) > 0 {
		return tx.Where("instance_id = ? AND id IN ?", instanceID, delIDs).
			Delete(&model.ApprovalInstanceTask{}).Error
	}
	return nil
}

// undoApprovalRecall 撤回「通过」：
//   - 或签节点通过不可撤回；
//   - 前加签任务通过：原任务恢复加签等待，本人任务恢复待处理；
//   - 普通/后加签任务通过：清理该操作产生的未处理后果任务，本人任务恢复待处理。
func undoApprovalRecall(tx *gorm.DB, instance *model.ApprovalInstance, task *model.ApprovalInstanceTask) error {
	nodes, err := parseFlowNodes(instance.ApprovalFlowJSON)
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
	// 或签：任一成员通过节点即生效，通过不可撤回
	if strategy == 3 {
		return errors.New("或签节点通过后不可撤回")
	}
	// 前加签任务通过：恢复原任务为加签等待
	if task.AddSignFrom > 0 && task.AddSignType == 1 {
		if err := tx.Model(&model.ApprovalInstanceTask{}).
			Where("id = ?", task.AddSignFrom).
			Update("status", model.TaskStatusWaiting).Error; err != nil {
			return err
		}
		return resetTaskPending(tx, task)
	}
	// 普通/后加签通过：清理未处理后果（依次=全部；会签=其他节点+同节点衍生）
	if err := cleanUnoperatedConsequences(tx, instance.ID, task.ID, task.NodeID, strategy != 1); err != nil {
		return err
	}
	return resetTaskPending(tx, task)
}

// undoReturnRecall 撤回「退回」：
//   - 实例=已驳回：退回发起人路径，恢复进行中并还原被取消的待处理/挂起任务；
//   - 实例=进行中：退回给前置审批人路径，删除目标新待办、恢复被取消的历史通过任务
//     与挂起任务、执行游标回到本人节点；若退回后已重新提交（无已通过普通任务）则拒绝。
func undoReturnRecall(tx *gorm.DB, instance *model.ApprovalInstance, task *model.ApprovalInstanceTask) error {
	pathIndex := make(map[string]int, len(instance.ExecutionPath))
	for i, nodeID := range instance.ExecutionPath {
		pathIndex[nodeID] = i
	}
	myIdx, ok := pathIndex[task.NodeID]
	if !ok {
		return errors.New("任务节点不在执行路径中")
	}

	instanceReturned := instance.Status == model.InstanceStatusReturned
	if !instanceReturned {
		// 进行中：退回给前置审批人。若无任何已通过普通任务，说明退回发起人后已重新提交，拒绝撤回。
		var approvedCnt int64
		if err := tx.Model(&model.ApprovalInstanceTask{}).
			Where("instance_id = ? AND status = ? AND id <> ? AND add_sign_from = 0 AND add_sign_type = 0",
				instance.ID, model.TaskStatusApproved, task.ID).
			Count(&approvedCnt).Error; err != nil {
			return err
		}
		if approvedCnt == 0 {
			return errors.New("该退回之后已重新提交，无法撤回")
		}
	}

	// 1. 本人任务恢复待处理
	if err := resetTaskPending(tx, task); err != nil {
		return err
	}

	// 2. 退回给前置审批人：删除目标新待办，恢复目标之后被取消的历史通过任务
	if !instanceReturned {
		// 注意：本人任务已恢复待处理，必须排除，否则会被当作「目标新待办」误删
		var pendingRows []model.ApprovalInstanceTask
		if err := tx.Where("instance_id = ? AND status = ? AND id <> ?",
			instance.ID, model.TaskStatusPending, task.ID).
			Find(&pendingRows).Error; err != nil {
			return err
		}
		pendingIDs := make([]uint, 0, len(pendingRows))
		var target *model.ApprovalInstanceTask
		for i := range pendingRows {
			pendingIDs = append(pendingIDs, pendingRows[i].ID)
			var cand model.ApprovalInstanceTask
			if err := tx.Where("instance_id = ? AND node_id = ? AND assignee_id = ? AND status = ? AND add_sign_from = 0 AND add_sign_type = 0",
				instance.ID, pendingRows[i].NodeID, pendingRows[i].AssigneeID, model.TaskStatusApproved).
				First(&cand).Error; err == nil {
				target = &cand
			}
		}
		if len(pendingIDs) > 0 {
			if err := tx.Where("id IN ?", pendingIDs).Delete(&model.ApprovalInstanceTask{}).Error; err != nil {
				return err
			}
		}
		if target != nil {
			var cancelled []model.ApprovalInstanceTask
			if err := tx.Where("instance_id = ? AND status = ? AND operated_at IS NOT NULL AND updated_at >= ? AND add_sign_from = 0 AND add_sign_type = 0",
				instance.ID, model.TaskStatusCancelled, *task.OperatedAt).
				Find(&cancelled).Error; err != nil {
				return err
			}
			for _, row := range cancelled {
				if !taskApprovedAfterReturnTarget(&row, target, pathIndex) {
					continue
				}
				if err := tx.Model(&model.ApprovalInstanceTask{}).Where("id = ?", row.ID).
					Update("status", model.TaskStatusApproved).Error; err != nil {
					return err
				}
			}
		}
	}

	// 3. 恢复被本次退回取消的待处理/挂起任务
	if err := restoreCancelledActive(tx, instance.ID, task, task.OperatedAt); err != nil {
		return err
	}

	// 4. 实例状态恢复：退回发起人 → 进行中；退回给前置审批人 → 执行游标回到本人节点
	updates := map[string]interface{}{
		"result":      "",
		"finished_at": nil,
		"updated_by":  task.AssigneeID,
	}
	if instanceReturned {
		updates["status"] = model.InstanceStatusRunning
	} else {
		updates["current_node_idx"] = myIdx
	}
	return tx.Model(instance).Updates(updates).Error
}

// restoreCancelledActive 恢复「本次退回」取消的待处理/挂起任务为退回前状态。
// 判定口径：已取消 且 operated_at 为空（原为待处理/挂起）且 updated_at 不早于本人操作时间
// （本次退回事务写入；更早的历史取消不受影响）。
// 分类恢复：后加签等待任务→挂起；加签子任务→待处理；存在子任务引用的原任务（前加签挂起）→挂起；其余→待处理。
func restoreCancelledActive(tx *gorm.DB, instanceID uint, task *model.ApprovalInstanceTask, opTime *time.Time) error {
	if opTime == nil {
		return nil
	}
	var cancelled []model.ApprovalInstanceTask
	if err := tx.Where("instance_id = ? AND status = ? AND operated_at IS NULL AND updated_at >= ? AND id <> ?",
		instanceID, model.TaskStatusCancelled, *opTime, task.ID).Find(&cancelled).Error; err != nil {
		return err
	}
	if len(cancelled) == 0 {
		return nil
	}
	referenced := make(map[uint]bool, len(cancelled))
	for i := range cancelled {
		row := &cancelled[i]
		if row.AddSignFrom > 0 {
			referenced[row.AddSignFrom] = true
		}
		if row.DelegatedFrom > 0 {
			referenced[row.DelegatedFrom] = true
		}
	}
	for i := range cancelled {
		row := &cancelled[i]
		newStatus := model.TaskStatusPending
		switch {
		case row.AddSignType == 2:
			newStatus = model.TaskStatusWaiting // 后加签等待任务
		case row.AddSignFrom > 0:
			newStatus = model.TaskStatusPending // 加签子任务
		case row.AddSignFrom == 0 && row.AddSignType == 0 && referenced[row.ID]:
			newStatus = model.TaskStatusWaiting // 前加签挂起的原任务
		}
		if err := tx.Model(&model.ApprovalInstanceTask{}).Where("id = ?", row.ID).
			Update("status", newStatus).Error; err != nil {
			return err
		}
	}
	return nil
}

// undoDelegateRecall 撤回「转交」：删除转交子任务链，原任务恢复待处理。
func undoDelegateRecall(tx *gorm.DB, task *model.ApprovalInstanceTask) error {
	if err := deleteDerivedChain(tx, task.InstanceID, task.ID); err != nil {
		return err
	}
	return resetTaskPending(tx, task)
}

// undoPreAddSignRecall 撤回「前加签」：删除加签子任务链，原任务恢复待处理。
func undoPreAddSignRecall(tx *gorm.DB, task *model.ApprovalInstanceTask) error {
	if err := deleteDerivedChain(tx, task.InstanceID, task.ID); err != nil {
		return err
	}
	return resetTaskPending(tx, task)
}

// undoPostAddSignRecall 撤回「后加签」：删除等待态加签子任务链（本人任务保持待处理）。
func undoPostAddSignRecall(tx *gorm.DB, task *model.ApprovalInstanceTask) error {
	return deleteDerivedChain(tx, task.InstanceID, task.ID)
}

// ==================== 详情页能力标记 ====================

// FillApprovedListRecallFlags 为「经我处理」列表逐行回填审核撤回入口能力：
// 当前用户在该实例内存在可撤回的任务时为 true，并给出对应任务 ID（可撤任务通常唯一，
// 存在多个时取任务列表顺序首个，前端直接用于撤回接口调用）。判定复用详情页任务级
// FillTaskRecallFlags 同口径（窗口内、本人操作是最后一次、或签通过除外）。
func FillApprovedListRecallFlags(curUserID uint, records []model.ApprovalRecord) {
	if len(records) == 0 {
		return
	}
	for i := range records {
		r := &records[i]
		if r.InstanceID == 0 {
			continue
		}
		var inst model.ApprovalInstance
		if err := database.DB.First(&inst, r.InstanceID).Error; err != nil {
			continue
		}
		var tasks []model.ApprovalInstanceTask
		if err := database.DB.Where("instance_id = ?", r.InstanceID).Find(&tasks).Error; err != nil {
			continue
		}
		results := make([]model.ApprovalInstanceTaskResult, len(tasks))
		FillTaskRecallFlags(curUserID, &inst, tasks, results)
		for j := range tasks {
			if results[j].CanRecall {
				r.CanRecall = true
				r.RecallTaskID = tasks[j].ID
				break
			}
		}
	}
}

// FillTaskRecallFlags 为实例详情的任务列表回填 can_recall（当前登录审批人能否撤回自己该次操作）。
// 判定逻辑与 ApprovalTaskRecall 保持一致（内存版）：窗口内、本人操作是最后一次操作、或签通过除外。
func FillTaskRecallFlags(curUserID uint, instance *model.ApprovalInstance, tasks []model.ApprovalInstanceTask, results []model.ApprovalInstanceTaskResult) {
	strategyOf := map[string]int{}
	if nodes, err := parseFlowNodes(instance.ApprovalFlowJSON); err == nil {
		for _, n := range nodes {
			strategyOf[n.ID] = n.Strategy
		}
	}
	window, ok := parseRecallWindowDuration(instance.ApprovalOtherJSON)
	if !ok {
		window = activeRecallDuration(instance.AppID)
	}
	now := time.Now()
	for i := range results {
		t := &tasks[i]
		r := &results[i]
		r.CanRecall = false
		if t.AssigneeID != curUserID {
			continue
		}
		switch t.Status {
		case model.TaskStatusApproved:
			if instance.Status != model.InstanceStatusRunning {
				continue
			}
			if strategyOf[t.NodeID] == 3 {
				continue // 或签节点通过不可撤
			}
			if t.OperatedAt == nil || t.OperatedAt.Add(window).Before(now) {
				continue
			}
			if !isLastOperatedTask(tasks, t) {
				continue
			}
			r.CanRecall = true
		case model.TaskStatusReturned:
			if instance.Status != model.InstanceStatusRunning && instance.Status != model.InstanceStatusReturned {
				continue
			}
			if t.OperatedAt == nil || t.OperatedAt.Add(window).Before(now) {
				continue
			}
			if !isLastOperatedTask(tasks, t) {
				continue
			}
			// 进行中 = 退回给前置审批人，需存在已通过普通任务（退回目标）；已驳回 = 退回发起人
			if instance.Status == model.InstanceStatusRunning && !hasApprovedOrdinaryTask(tasks, t.ID) {
				continue
			}
			r.CanRecall = true
		case model.TaskStatusDelegated:
			if instance.Status != model.InstanceStatusRunning {
				continue
			}
			if t.OperatedAt == nil || t.OperatedAt.Add(window).Before(now) {
				continue
			}
			if !isLastOperatedTask(tasks, t) {
				continue
			}
			r.CanRecall = true
		case model.TaskStatusWaiting:
			if instance.Status != model.InstanceStatusRunning {
				continue
			}
			if t.AddSignFrom != 0 {
				continue // 后加签等待任务由原审批人待处理任务承载撤回入口
			}
			actionTime, ok2 := maxDerivedChildCreatedAt(tasks, t.ID)
			if !ok2 || actionTime.Add(window).Before(now) {
				continue
			}
			if !isLastOperatedByTime(tasks, t.ID, actionTime) {
				continue
			}
			r.CanRecall = true
		case model.TaskStatusPending:
			if instance.Status != model.InstanceStatusRunning {
				continue
			}
			actionTime, ok2 := maxWaitingPostSignCreatedAt(tasks, t.ID)
			if !ok2 || actionTime.Add(window).Before(now) {
				continue
			}
			if !isLastOperatedByTime(tasks, t.ID, actionTime) {
				continue
			}
			r.CanRecall = true
		}
	}
}

func isLastOperatedTask(tasks []model.ApprovalInstanceTask, target *model.ApprovalInstanceTask) bool {
	if target.OperatedAt == nil {
		return false
	}
	return isLastOperatedByTime(tasks, target.ID, *target.OperatedAt)
}

func isLastOperatedByTime(tasks []model.ApprovalInstanceTask, excludeID uint, refTime time.Time) bool {
	for i := range tasks {
		t := &tasks[i]
		if t.ID == excludeID {
			continue
		}
		if t.OperatedAt != nil && t.OperatedAt.After(refTime) {
			return false
		}
	}
	return true
}

func hasApprovedOrdinaryTask(tasks []model.ApprovalInstanceTask, excludeID uint) bool {
	for i := range tasks {
		t := &tasks[i]
		if t.ID == excludeID || t.Status != model.TaskStatusApproved {
			continue
		}
		if t.AddSignFrom == 0 && t.AddSignType == 0 {
			return true
		}
	}
	return false
}

func maxDerivedChildCreatedAt(tasks []model.ApprovalInstanceTask, parentID uint) (time.Time, bool) {
	var maxT time.Time
	found := false
	for i := range tasks {
		t := &tasks[i]
		if (t.AddSignFrom == parentID || t.DelegatedFrom == parentID) && !t.CreatedAt.IsZero() {
			if !found || t.CreatedAt.After(maxT) {
				maxT = t.CreatedAt
				found = true
			}
		}
	}
	return maxT, found
}

func maxWaitingPostSignCreatedAt(tasks []model.ApprovalInstanceTask, parentID uint) (time.Time, bool) {
	var maxT time.Time
	found := false
	for i := range tasks {
		t := &tasks[i]
		if t.AddSignFrom == parentID && t.AddSignType == 2 && t.Status == model.TaskStatusWaiting && !t.CreatedAt.IsZero() {
			if !found || t.CreatedAt.After(maxT) {
				maxT = t.CreatedAt
				found = true
			}
		}
	}
	return maxT, found
}
