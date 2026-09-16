package service

// ============================================================
// 流程实例生命周期
// ============================================================
// 覆盖：发起审批（ApprovalInstanceCreate）、保存草稿（ApprovalInstanceSaveDraft）、
// 从草稿提交（ApprovalInstanceSubmitDraft）、详情（ApprovalInstanceDetail）、
// 撤回（ApprovalInstanceWithdraw）、删除（ApprovalInstanceDelete）。
//
// 状态机（instance.Status）：
//
//	草稿(6) --提交--> 进行中(0) --全部节点完成--> 已通过(1)
//	进行中(0) --审批人拒绝--> 已拒绝(2)
//	进行中(0) --审批人驳回--> 已驳回(3)
//	进行中(0) --发起人撤回--> 已撤回(5)
//	已拒绝/已驳回/已作废/已撤回/草稿 --删除--> 软删除
//
// 所有多表更新（实例状态 + 快照 + 任务）均在同一个数据库事务内执行。
// ============================================================

import (
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"

	"back-end/internal/database"
	"back-end/internal/model"

	"gorm.io/gorm"
)

// approvalContext 实例创建/保存/提交共用的流程上下文
type approvalContext struct {
	app           model.Application // 应用配置（含流程定义与业务表）
	nodes         []flowNode        // 解析后的流程节点
	formData      map[string]interface{}
	execPath      []string
	execPathJSON  string
	injectedNodes []flowNode // 注入发起人自选成员后的快照节点
}

// resolveBusinessDataID 解析业务数据 ID：
//   - BusinessDataID > 0 且 BusinessData 非空：更新已有业务数据并返回 ID
//   - BusinessDataID > 0 且 BusinessData 为空：直接返回 ID
//   - BusinessDataID == 0 且 BusinessData 非空：自动创建业务数据行并返回新 ID
func resolveBusinessDataID(curUserID uint, req *model.ApprovalInstanceCreateReq) (uint, error) {
	if req.BusinessDataID > 0 {
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
	dataID, err := ApplicationDataCreate(req.AppID, curUserID, req.BusinessData)
	if err != nil {
		return 0, fmt.Errorf("自动创建业务数据失败: %w", err)
	}
	req.BusinessDataID = dataID
	return dataID, nil
}

// prepareApprovalContext 加载应用配置、校验业务数据、解析流程节点、评估执行路径、注入自选成员。
// 发起审批与提交草稿共用：两者都会重新评估执行路径（业务数据可能已修改）。
func prepareApprovalContext(appID, businessDataID uint, selfSelectMembers map[string][]uint) (*approvalContext, error) {
	// 1. 校验应用配置
	app, err := ApplicationDetail(appID)
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
	if err := database.DB.Raw("SELECT COUNT(*) FROM `"+real+"` WHERE `id` = ? AND `deleted_at` IS NULL", businessDataID).Scan(&cnt).Error; err != nil {
		return nil, err
	}
	if cnt == 0 {
		return nil, errors.New("业务数据不存在")
	}

	// 3. 解析流程节点 & 读取业务数据快照（含子表）
	nodes, err := parseFlowNodes(app.ApprovalFlowJSON)
	if err != nil {
		return nil, fmt.Errorf("解析审批流配置失败: %w", err)
	}
	if len(nodes) == 0 {
		return nil, errors.New("审批流配置为空")
	}
	formData, err := ApplicationDataDetail(appID, businessDataID, &model.ApplicationDataDetailReq{})
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
	injectedNodes := injectSelfSelectIntoNodes(nodes, selfSelectMembers)

	return &approvalContext{
		app:           *app,
		nodes:         nodes,
		formData:      formData,
		execPath:      execPath,
		execPathJSON:  string(execPathJSON),
		injectedNodes: injectedNodes,
	}, nil
}

// validateSelfSelectApprovers 校验执行路径上的发起人自选（approverType=3）节点已选择审批人。
// 关键修复：发起人自选节点若未选审批人，提交应被拦截并给出明确提示，
// 而不是走 emptyHandler=1（自动通过）递归跳过所有节点、流程瞬间"已通过"。
func validateSelfSelectApprovers(ctx *approvalContext) error {
	for _, nodeID := range ctx.execPath {
		node := findNodeByID(ctx.injectedNodes, nodeID)
		if node == nil || node.ApproverType != 3 {
			continue
		}
		// 抄送节点（type=3）为通知类节点，不生成审批待办任务，成员为空不阻塞提交
		if node.Type != 2 {
			continue
		}
		ids, err := resolveApproverUserIDs(*node, nil)
		if err != nil {
			return err
		}
		if len(ids) == 0 {
			label := node.Label
			if label == "" {
				label = nodeID
			}
			return fmt.Errorf("请为「%s」节点选择审批人后再提交", label)
		}
	}
	return nil
}

// instanceStatusName 流程实例状态的中文名（用于状态机报错提示）
func instanceStatusName(status int) string {
	switch status {
	case model.InstanceStatusRunning:
		return "进行中"
	case model.InstanceStatusPassed:
		return "已通过"
	case model.InstanceStatusRejected:
		return "已拒绝"
	case model.InstanceStatusReturned:
		return "已驳回"
	case model.InstanceStatusVoided:
		return "已作废"
	case model.InstanceStatusWithdrawn:
		return "已撤回"
	case model.InstanceStatusDraft:
		return "草稿"
	default:
		return fmt.Sprintf("未知(%d)", status)
	}
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

// ApprovalInstanceCreate 发起审批：
//  1. 校验/解析业务数据
//  2. 快照审批流配置 + 表单数据
//  3. 评估条件分支，得到执行路径
//  4. 校验发起人自选节点已选审批人
//  5. 事务内创建流程实例（状态=进行中）并为首个审批节点生成任务
func ApprovalInstanceCreate(curUserID uint, req *model.ApprovalInstanceCreateReq) (*model.ApprovalInstance, error) {
	// 0. 解析业务数据 ID（支持自动创建）
	if _, err := resolveBusinessDataID(curUserID, req); err != nil {
		return nil, err
	}

	// 1. 准备流程上下文
	ctx, err := prepareApprovalContext(req.AppID, req.BusinessDataID, req.SelfSelectMembers)
	if err != nil {
		return nil, err
	}

	// 2. 发起人自选节点必须已选择审批人
	if err := validateSelfSelectApprovers(ctx); err != nil {
		return nil, err
	}

	// 3. 创建流程实例（事务）：状态=进行中，生成首个审批节点任务
	var instance model.ApprovalInstance
	err = database.DB.Transaction(func(tx *gorm.DB) error {
		instance = model.ApprovalInstance{
			AppID:            req.AppID,
			BusinessTable:    ctx.app.TableName,
			BusinessDataID:   req.BusinessDataID,
			FlowSnapshotJSON: ctx.injectedNodes, // 直接传入结构化数据，由 GORM serializer:json 统一序列化
			FormDataSnapshot: ctx.formData,
			ExecutionPath:    ctx.execPathJSON,
			CurrentNodeIdx:   0,
			Status:           model.InstanceStatusRunning,
		}
		instance.CreatedBy, instance.UpdatedBy = curUserID, curUserID
		if err := tx.Create(&instance).Error; err != nil {
			return err
		}
		// 为首个审批节点生成任务（自选成员已在快照 members 中，无需额外传入）
		if err := generateTasksForCurrentNode(tx, &instance, ctx.injectedNodes, curUserID); err != nil {
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
//
// 草稿保存不校验自选审批人是否已选（允许先保存后选择），提交时统一校验。
func ApprovalInstanceSaveDraft(curUserID uint, req *model.ApprovalInstanceCreateReq) (*model.ApprovalInstance, error) {
	// 0. 解析业务数据 ID（支持自动创建）
	if _, err := resolveBusinessDataID(curUserID, req); err != nil {
		return nil, err
	}

	// 1. 准备流程上下文（草稿阶段不要求执行路径非空，允许保存待完善配置）
	ctx, err := prepareApprovalContext(req.AppID, req.BusinessDataID, req.SelfSelectMembers)
	if err != nil {
		return nil, err
	}

	// 2. 创建草稿实例
	instance := model.ApprovalInstance{
		AppID:                 req.AppID,
		BusinessTable:         ctx.app.TableName,
		BusinessDataID:        req.BusinessDataID,
		FlowSnapshotJSON:      ctx.injectedNodes,
		FormDataSnapshot:      ctx.formData,
		ExecutionPath:         ctx.execPathJSON,
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
//  1. 校验草稿实例存在、属于当前用户、状态=草稿
//  2. 重新读取业务数据、重新评估执行路径（业务数据可能已修改）
//  3. 校验发起人自选节点已选审批人
//  4. 事务内原子流转（草稿→进行中），生成首个审批节点任务
func ApprovalInstanceSubmitDraft(curUserID uint, instanceID uint, req *model.ApprovalInstanceSubmitDraftReq) (*model.ApprovalInstance, error) {
	// 1. 加载草稿实例
	var instance model.ApprovalInstance
	if err := database.DB.First(&instance, instanceID).Error; err != nil {
		return nil, errors.New("流程实例不存在")
	}
	if instance.CreatedBy != curUserID {
		return nil, errors.New("只能提交自己发起的草稿")
	}
	if instance.Status != model.InstanceStatusDraft {
		return nil, fmt.Errorf("仅草稿状态的实例可提交，当前状态为「%s」", instanceStatusName(instance.Status))
	}

	// 2. 合并发起人自选审批人：提交时传入 > 草稿暂存
	selfSelectMembers := instance.SelfSelectMembersJSON
	if req.SelfSelectMembers != nil {
		selfSelectMembers = req.SelfSelectMembers
	}

	// 3. 准备流程上下文（重新评估执行路径）
	ctx, err := prepareApprovalContext(instance.AppID, instance.BusinessDataID, selfSelectMembers)
	if err != nil {
		return nil, err
	}

	// 4. 发起人自选节点必须已选择审批人
	if err := validateSelfSelectApprovers(ctx); err != nil {
		return nil, err
	}

	// 5. 序列化快照（Updates map 不走 serializer，需手动序列化）
	injectedFlowBytes, _ := json.Marshal(ctx.injectedNodes)
	formDataBytes, _ := json.Marshal(ctx.formData)

	// 6. 事务：原子状态流转（草稿→进行中）+ 更新快照/路径 + 生成首个任务
	err = database.DB.Transaction(func(tx *gorm.DB) error {
		// 原子守卫：仅当实例仍为草稿时才更新，防止并发重复提交
		res := tx.Model(&model.ApprovalInstance{}).
			Where("id = ? AND status = ?", instanceID, model.InstanceStatusDraft).
			Updates(map[string]interface{}{
				"flow_snapshot_json":       string(injectedFlowBytes),
				"form_data_snapshot":       string(formDataBytes),
				"execution_path":           ctx.execPathJSON,
				"current_node_idx":         0,
				"status":                   model.InstanceStatusRunning,
				"self_select_members_json": nil, // 已注入快照，清除独立字段
				"updated_by":               curUserID,
			})
		if res.Error != nil {
			return res.Error
		}
		if res.RowsAffected == 0 {
			return errors.New("该草稿已被处理，请刷新后重试")
		}

		// 重新加载实例（快照/路径已更新），供任务生成读取执行路径
		if err := tx.First(&instance, instanceID).Error; err != nil {
			return err
		}

		// 生成首个审批节点任务（自选成员已在快照 members 中）
		if err := generateTasksForCurrentNode(tx, &instance, ctx.injectedNodes, curUserID); err != nil {
			return err
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return &instance, nil
}

// ApprovalInstanceWithdraw 撤回流程实例（仅发起人、仅进行中）：
// 状态流转 进行中 -> 已撤回，同时取消所有待处理任务
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
		return finishInstance(tx, &instance, model.InstanceStatusWithdrawn, "发起人撤回", curUserID)
	})
}

// ApprovalInstanceDelete 删除流程实例（软删除）
// 仅允许发起人删除已终结的实例（已拒绝/已驳回/已作废/已撤回/草稿）
func ApprovalInstanceDelete(curUserID, instanceID uint) error {
	return database.DB.Transaction(func(tx *gorm.DB) error {
		var instance model.ApprovalInstance
		if err := tx.First(&instance, instanceID).Error; err != nil {
			return errors.New("流程实例不存在")
		}
		if instance.CreatedBy != curUserID {
			return errors.New("只能删除自己发起的审批")
		}
		allowedStatuses := map[int]bool{
			model.InstanceStatusRejected:  true,
			model.InstanceStatusReturned:  true,
			model.InstanceStatusVoided:    true,
			model.InstanceStatusWithdrawn: true,
			model.InstanceStatusDraft:     true,
		}
		if !allowedStatuses[instance.Status] {
			return errors.New("只有已拒绝/已驳回/已作废/已撤回或草稿状态的流程可删除")
		}
		return tx.Delete(&instance).Error
	})
}

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
	bizData := loadBusinessData(instance)

	// 批量解析涉及用户 ID 的姓名（审批人 + 发起人）
	assigneeNameMap := buildAssigneeNameMap(tasks, instance.CreatedBy)

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

// loadBusinessData 读取实例关联的业务数据（主表 + 子表，与 ApplicationDataDetail 逻辑一致）
func loadBusinessData(instance model.ApprovalInstance) map[string]interface{} {
	var bizData map[string]interface{}
	real := bizTableName(instance.BusinessTable)
	if colSet, err := queryColumnSet(real); err == nil {
		sql := "SELECT * FROM `" + real + "` WHERE `id` = ?"
		if colSet["deleted_at"] {
			sql += " AND `deleted_at` IS NULL"
		}
		database.DB.Raw(sql, instance.BusinessDataID).Scan(&bizData)
	}
	// 子表数据：按 parent_id 关联主表
	var app model.Application
	if err := database.DB.First(&app, instance.AppID).Error; err == nil && app.SubTableName != "" {
		for _, sub := range splitSubTables(app.SubTableName) {
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
	return bizData
}

// splitSubTables 拆分应用配置的子表名列表（逗号分隔，去空格，过滤非法名）
func splitSubTables(subTableName string) []string {
	var result []string
	for _, sub := range strings.Split(subTableName, ",") {
		sub = strings.TrimSpace(sub)
		if isValidTableName(sub) {
			result = append(result, sub)
		}
	}
	return result
}

// buildAssigneeNameMap 批量查询任务审批人 + 发起人的用户姓名（用户ID -> 姓名）
func buildAssigneeNameMap(tasks []model.ApprovalInstanceTask, creatorID uint) map[string]string {
	uidSet := map[uint]bool{}
	for _, t := range tasks {
		if t.AssigneeID > 0 {
			uidSet[t.AssigneeID] = true
		}
	}
	if creatorID > 0 {
		uidSet[creatorID] = true
	}
	nameMap := make(map[string]string, len(uidSet))
	if len(uidSet) == 0 {
		return nameMap
	}
	uidList := make([]uint, 0, len(uidSet))
	for uid := range uidSet {
		uidList = append(uidList, uid)
	}
	var users []model.User
	if err := database.DB.Unscoped().Preload("Profile").Where("id IN ?", uidList).Find(&users).Error; err == nil {
		for _, u := range users {
			nameMap[strconv.FormatUint(uint64(u.ID), 10)] = userNickname(u)
		}
	}
	return nameMap
}
