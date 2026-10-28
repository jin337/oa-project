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
//	进行中(0) --发起人撤回--> 草稿(6)（回退草稿，可重新编辑/重新提交）
//	已拒绝/已驳回/已作废/草稿 --删除--> 软删除
//
// 所有多表更新（实例状态 + 快照 + 任务）均在同一个数据库事务内执行。
// ============================================================

import (
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

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
	injectedNodes []flowNode // 注入发起人自选成员后的快照节点
	endNode       any        // 流程结束事件特殊节点（{type:"end", event:"..."}），原样保留进实例快照
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
	app, _, err := ApplicationDetail(appID)
	if err != nil {
		return nil, err
	}
	// 运行时使用当前 active 版本快照发起审批
	ApplyActiveVersionSnapshot(app)
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
	// 执行路径为空（流程只配置了发起人节点，或命中的分支内既无审批人也无抄送人）：
	// 不再拦截，由各提交入口按「提交即自动通过」处理（见 finishNoApproverInstance）。
	execPath := flattenExecutionPath(nodes, formData)

	// 5. 将发起人自选审批人注入流程快照（approverType=3 节点的 members 直接包含最终选人）
	injectedNodes := injectSelfSelectIntoNodes(nodes, selfSelectMembers)

	// 6. 抽取流程结束事件特殊节点（type="end"），原样保留进实例快照（parseFlowNodes 已过滤掉）
	endNode := extractEndEventNode(app.ApprovalFlowJSON)

	return &approvalContext{
		app:           *app,
		nodes:         nodes,
		formData:      formData,
		execPath:      execPath,
		injectedNodes: injectedNodes,
		endNode:       endNode,
	}, nil
}

// extractEndEventNode 从 approval_flow_json 原始结构中取出 {type:"end", event:"..."} 节点。
func extractEndEventNode(flowJSON any) any {
	if flowJSON == nil {
		return nil
	}
	b, err := json.Marshal(flowJSON)
	if err != nil {
		return nil
	}
	var list []map[string]any
	if err := json.Unmarshal(b, &list); err != nil {
		return nil
	}
	for _, item := range list {
		if t, ok := item["type"]; ok {
			if ts, isStr := t.(string); isStr && ts == "end" {
				return item
			}
		}
	}
	return nil
}

// buildSnapshotFlow 把注入后的节点 + 可选的流程结束事件节点合并为实例快照 JSON 数组。
func buildSnapshotFlow(injected []flowNode, endNode any) []any {
	out := make([]any, 0, len(injected)+1)
	for i := range injected {
		out = append(out, injected[i])
	}
	if endNode != nil {
		out = append(out, endNode)
	}
	return out
}

// validateSelfSelectApprovers 校验执行路径上的发起人自选（approverType=3）节点已选择审批人。
// 关键修复：发起人自选节点若未选审批人，提交应被拦截并给出明确提示，
// 而不是走 emptyHandler=1（自动通过）递归跳过所有节点、流程瞬间"已通过"。
func validateSelfSelectApprovers(ctx *approvalContext) error {
	for _, nodeID := range ctx.execPath {
		node := findNodeByID(ctx.injectedNodes, nodeID)
		if node == nil {
			continue
		}
		// 发起人自选节点必须选人：
		//   - 审批人：approverType=3 的审批节点（type=2）
		//   - 抄送人：抄送节点（type=3）且配置了发起人自选（selfSelect>0）
		isApproverSelfSelect := node.ApproverType == 3 && node.Type == 2
		isCcSelfSelect := node.Type == 3 && node.SelfSelect > 0
		if !isApproverSelfSelect && !isCcSelfSelect {
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
			kind := "审批人"
			if node.Type == 3 {
				kind = "抄送人"
			}
			return fmt.Errorf("请为「%s」节点选择%s后再提交", label, kind)
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
		return "已退回"
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
		return model.ApprovalStatusWithdrawn
	case model.InstanceStatusDraft:
		return model.ApprovalStatusDraft
	default:
		return model.ApprovalStatusReviewing
	}
}

// loadOwnedInstance 加载流程实例并统一校验「存在性 + 归属 + 状态机」：
//   - 实例不存在 → 流程实例不存在
//   - 非发起人操作 → 只能{action}自己发起的审批
//   - 当前状态不在允许集合 → 仅「{允许状态}」状态的实例可{action}，当前为「{当前状态}」
// db 可为 database.DB 或事务句柄 tx（调用方所在事务内加载时传 tx，保证一致性读）。
func loadOwnedInstance(db *gorm.DB, curUserID, instanceID uint, action string, allowedStatuses ...int) (*model.ApprovalInstance, error) {
	var instance model.ApprovalInstance
	if err := db.First(&instance, instanceID).Error; err != nil {
		return nil, errors.New("流程实例不存在")
	}
	if instance.CreatedBy != curUserID {
		return nil, fmt.Errorf("只能%s自己发起的审批", action)
	}
	if len(allowedStatuses) > 0 {
		allowed := false
		names := make([]string, 0, len(allowedStatuses))
		for _, st := range allowedStatuses {
			if instance.Status == st {
				allowed = true
			}
			names = append(names, instanceStatusName(st))
		}
		if !allowed {
			return nil, fmt.Errorf("仅「%s」状态的实例可%s，当前为「%s」",
				strings.Join(names, "/"), action, instanceStatusName(instance.Status))
		}
	}
	return &instance, nil
}

// finishNoApproverInstance 无审批节点的流程（执行路径为空）提交即自动通过：
//   - 发起人节点（type=1）只代表「谁可以发起」的权限范围，不是审批步骤；
//     流程只配发起人、或条件分支命中后既无审批人（type=2）也无抄送人（type=3）时，
//     执行路径为空，没有任何任务可生成；
//   - 此时不生成审批任务，实例直接置为「已通过」，并复用 finishInstance 的终态处理
//     （取消待办 / 流程结束抄送 / 结果通知）。
func finishNoApproverInstance(tx *gorm.DB, instance *model.ApprovalInstance, curUserID uint) error {
	return finishInstance(tx, instance, model.InstanceStatusPassed, "自动通过", curUserID)
}

// ApprovalInstanceCreate 发起审批：
//  1. 校验/解析业务数据
//  2. 快照审批流配置 + 表单数据
//  3. 评估条件分支，得到执行路径（为空表示无审批节点，提交即自动通过）
//  4. 校验发起人自选节点已选审批人
//  5. 事务内创建流程实例并为首个审批节点生成任务
func ApprovalInstanceCreate(curUserID uint, req *model.ApprovalInstanceCreateReq) (*model.ApprovalInstance, error) {
	// 0. 解析业务数据 ID（支持自动创建）
	if _, err := resolveBusinessDataID(curUserID, req); err != nil {
		return nil, err
	}

	// 1. 准备流程上下文
	ctx, err := prepareApprovalContext(req.AppID, req.BusinessDataID, req.ApprovalDraftMembers)
	if err != nil {
		return nil, err
	}

	// 2. 发起人自选节点必须已选择审批人
	if err := validateSelfSelectApprovers(ctx); err != nil {
		return nil, err
	}

	// 3. 生成单号（提交时才生成；未配置前缀或已有单号时自动跳过，见 bill_no.go）
	if err := ensureBillNo(req.AppID, ctx.app.TableName, req.BusinessDataID, curUserID); err != nil {
		return nil, err
	}

	// 4. 创建流程实例（事务）：状态=进行中，生成首个审批节点任务
	var instance model.ApprovalInstance
	err = withNotify(func(tx *gorm.DB) error {
		// 查发起人当前部门，记录快照
		var creator model.User
		database.DB.Select("dept_id").First(&creator, curUserID)
		instance = model.ApprovalInstance{
			AppID:                 req.AppID,
			BillNo:                readBillNo(ctx.app.TableName, req.BusinessDataID),
			BusinessTable:         ctx.app.TableName,
			BusinessDataID:        req.BusinessDataID,
			ApprovalFlowJSON:      buildSnapshotFlow(ctx.injectedNodes, ctx.endNode), // 含流程结束事件节点，由 GORM serializer:json 统一序列化
			FormLayoutJSON:        ctx.app.FormLayoutJSON,
			DetailLayoutJSON:      ctx.app.DetailLayoutJSON,
			ExecutionPath:         ctx.execPath,
			CurrentNodeIdx:        0,
			Status:                model.InstanceStatusRunning,
			DeptID:                creator.DeptID,
			// 提交即进入审批流转，不持久化草稿暂存（approval_draft_members 仅草稿专用）；
			// 撤回回退草稿时由 ApprovalInstanceWithdraw 从快照自选节点写回暂存
		}
		instance.CreatedBy, instance.UpdatedBy = curUserID, curUserID
		if err := tx.Create(&instance).Error; err != nil {
			return err
		}
		// 无审批节点（如仅配置了发起人）：提交即自动通过，不生成审批任务
		if len(ctx.execPath) == 0 {
			return finishNoApproverInstance(tx, &instance, curUserID)
		}
		// 为首个审批节点生成任务（自选成员已在快照 members 中，无需额外传入）
		if err := generateTasksForCurrentNode(tx, &instance, ctx.injectedNodes, curUserID, ""); err != nil {
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
//   - req.InstanceID == 0：新建草稿实例（首次保存 / 发起页保存草稿）
//   - req.InstanceID > 0 ：更新已有草稿实例（草稿箱继续编辑），严格 UPDATE，不新增记录
//
// 草稿保存不校验自选审批人是否已选（允许先保存后选择），提交时统一校验。
func ApprovalInstanceSaveDraft(curUserID uint, req *model.ApprovalInstanceCreateReq) (*model.ApprovalInstance, error) {
	if req.InstanceID > 0 {
		return saveDraftUpdate(curUserID, req)
	}
	return saveDraftCreate(curUserID, req)
}

// saveDraftCreate 新建草稿实例（status=Draft，不生成审批任务）
func saveDraftCreate(curUserID uint, req *model.ApprovalInstanceCreateReq) (*model.ApprovalInstance, error) {
	// 0. 解析业务数据 ID（支持自动创建）
	if _, err := resolveBusinessDataID(curUserID, req); err != nil {
		return nil, err
	}

	// 1. 准备流程上下文（快照/表单/执行路径）
	ctx, err := prepareApprovalContext(req.AppID, req.BusinessDataID, req.ApprovalDraftMembers)
	if err != nil {
		return nil, err
	}

	// 2. 创建草稿实例
	// 查发起人当前部门，记录快照
	var creator model.User
	database.DB.Select("dept_id").First(&creator, curUserID)
	instance := model.ApprovalInstance{
		AppID:                 req.AppID,
		BusinessTable:         ctx.app.TableName,
		BusinessDataID:        req.BusinessDataID,
		ApprovalFlowJSON:      buildSnapshotFlow(ctx.injectedNodes, ctx.endNode),
		FormLayoutJSON:        ctx.app.FormLayoutJSON,
		DetailLayoutJSON:      ctx.app.DetailLayoutJSON,
		ExecutionPath:         ctx.execPath,
		CurrentNodeIdx:       0,
		Status:                model.InstanceStatusDraft,
		ApprovalDraftMembers: req.ApprovalDraftMembers,
		DeptID:                creator.DeptID,
	}
	instance.CreatedBy, instance.UpdatedBy = curUserID, curUserID
	if err := database.DB.Create(&instance).Error; err != nil {
		return nil, err
	}
	return &instance, nil
}

// saveDraftUpdate 更新已有草稿实例：
//  1. 校验草稿存在、属于当前用户、状态=草稿
//  2. 业务数据以草稿实例已关联的行为准（防止前端漏传 business_data_id 时新建业务行）
//  3. 事务内更新实例（快照/表单/执行路径/自选成员），状态保持草稿，不新增记录
func saveDraftUpdate(curUserID uint, req *model.ApprovalInstanceCreateReq) (*model.ApprovalInstance, error) {
	var instance model.ApprovalInstance

	err := database.DB.Transaction(func(tx *gorm.DB) error {
		// 1. 加载草稿/已撤回实例并校验归属/状态（两者均可编辑；已撤回编辑保存后转为正式草稿）
		owned, err := loadOwnedInstance(tx, curUserID, req.InstanceID, "编辑",
			model.InstanceStatusDraft, model.InstanceStatusWithdrawn)
		if err != nil {
			return err
		}
		instance = *owned

		// 2. 业务数据：以草稿实例已关联的业务行为准（复用行 + 更新 payload），不允许新建
		req.BusinessDataID = instance.BusinessDataID
		if _, err := resolveBusinessDataID(curUserID, req); err != nil {
			return err
		}

		// 3. 基于最新业务数据重新准备流程上下文（快照/执行路径随之刷新）
		ctx, err := prepareApprovalContext(instance.AppID, req.BusinessDataID, req.ApprovalDraftMembers)
		if err != nil {
			return err
		}

		// 4. 序列化快照（Updates map 不走 serializer，需手动序列化）
		injectedFlowBytes, _ := json.Marshal(buildSnapshotFlow(ctx.injectedNodes, ctx.endNode))
		execPathBytes, _ := json.Marshal(ctx.execPath)
		formLayoutBytes, _ := json.Marshal(ctx.app.FormLayoutJSON)
		detailLayoutBytes, _ := json.Marshal(ctx.app.DetailLayoutJSON)

		// 5. 自选成员：本次未传（nil）视为清空暂存，传了则覆盖暂存
		selfSelectJSON := "null"
		if req.ApprovalDraftMembers != nil {
			b, _ := json.Marshal(req.ApprovalDraftMembers)
			selfSelectJSON = string(b)
		}

		// 6. 严格更新该草稿/已撤回实例（UPDATE ... WHERE id=? AND status IN (草稿,已撤回)），不新增记录；
		// 保存后统一落为草稿，进入草稿箱继续完善
		res := tx.Model(&model.ApprovalInstance{}).
			Where("id = ? AND status IN ?", instance.ID,
				[]int{model.InstanceStatusDraft, model.InstanceStatusWithdrawn}).
			Updates(map[string]interface{}{
				"app_id":                   instance.AppID,
				"business_table":           ctx.app.TableName,
				"business_data_id":         req.BusinessDataID,
				"approval_flow_json":       string(injectedFlowBytes),
				"form_layout_json":         string(formLayoutBytes),
				"detail_layout_json":        string(detailLayoutBytes),
				"execution_path":           string(execPathBytes),
				"current_node_idx":         0,
				"status":                   model.InstanceStatusDraft,
				"approval_draft_members": selfSelectJSON,
				"updated_by":               curUserID,
			})
		if res.Error != nil {
			return res.Error
		}
		if res.RowsAffected == 0 {
			return errors.New("该草稿已被处理，请刷新后重试")
		}
		return nil
	})
	if err != nil {
		return nil, err
	}

	// 返回更新后的实例
	if err := database.DB.First(&instance, req.InstanceID).Error; err != nil {
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
	// 1. 加载草稿/已撤回实例并校验归属/状态（仅草稿与已撤回可提交）
	var instance model.ApprovalInstance
	owned, err := loadOwnedInstance(database.DB, curUserID, instanceID, "提交",
		model.InstanceStatusDraft, model.InstanceStatusWithdrawn)
	if err != nil {
		return nil, err
	}
	instance = *owned

	// 2. 合并发起人自选审批人：提交时传入 > 草稿暂存
	selfSelectMembers := instance.ApprovalDraftMembers
	if req.ApprovalDraftMembers != nil {
		selfSelectMembers = req.ApprovalDraftMembers
	}

	// 2.5 同步编辑抽屉中修改的表单数据（一步提交，不再先调 /draft 落库）
	if len(req.BusinessData) > 0 {
		if err := ApplicationDataUpdateWithDB(database.DB, instance.AppID, instance.BusinessDataID, curUserID, req.BusinessData); err != nil {
			return nil, fmt.Errorf("更新业务数据失败: %w", err)
		}
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

	// 5. 生成单号（草稿保存时不生成、提交时才生成；已有单号则复用，见 bill_no.go）
	if err := ensureBillNo(instance.AppID, ctx.app.TableName, instance.BusinessDataID, curUserID); err != nil {
		return nil, err
	}

	// 6. 序列化快照（Updates map 不走 serializer，需手动序列化）
	injectedFlowBytes, _ := json.Marshal(buildSnapshotFlow(ctx.injectedNodes, ctx.endNode))
	execPathBytes, _ := json.Marshal(ctx.execPath)
	formLayoutBytes, _ := json.Marshal(ctx.app.FormLayoutJSON)
	detailLayoutBytes, _ := json.Marshal(ctx.app.DetailLayoutJSON)

	// 7. 事务：原子状态流转（草稿→进行中）+ 更新快照/路径 + 生成首个任务
	err = withNotify(func(tx *gorm.DB) error {
		// 原子守卫：仅当实例仍为草稿/已撤回时才更新，防止并发重复提交
		res := tx.Model(&model.ApprovalInstance{}).
			Where("id = ? AND status IN ?", instanceID,
				[]int{model.InstanceStatusDraft, model.InstanceStatusWithdrawn}).
			Updates(map[string]interface{}{
				"approval_flow_json":       string(injectedFlowBytes),
				"form_layout_json":         string(formLayoutBytes),
				"detail_layout_json":        string(detailLayoutBytes),
				"execution_path":           string(execPathBytes),
				"current_node_idx":         0,
				"status":                   model.InstanceStatusRunning,
				"approval_draft_members":   nil, // 草稿暂存提交后清空（成员已注入快照；撤回时由 Withdraw 写回）
				"created_at":               time.Now(), // 重新提交时刷新申请时间，撤回 30 分钟窗口随之重新起算
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

		// 无审批节点（如仅配置了发起人）：提交即自动通过，不生成审批任务
		if len(ctx.execPath) == 0 {
			return finishNoApproverInstance(tx, &instance, curUserID)
		}

		// 生成首个审批节点任务（自选成员已在快照 members 中）
		if err := generateTasksForCurrentNode(tx, &instance, ctx.injectedNodes, curUserID, ""); err != nil {
			return err
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return &instance, nil
}

// ApprovalInstanceResubmit 已驳回实例重新提交（对齐钉钉"退回"）：
//  1. 校验实例存在、属于当前用户、状态=已驳回(3)
//  2. 可选更新业务表单数据（发起人修改后的值）
//  3. 事务内原子流转（已驳回→进行中），清空历史任务，重置游标到首节点，整条流程从头走
func ApprovalInstanceResubmit(curUserID uint, instanceID uint, req *model.ApprovalInstanceResubmitReq) (*model.ApprovalInstance, error) {
	var instance model.ApprovalInstance
	owned, err := loadOwnedInstance(database.DB, curUserID, instanceID, "重新提交", model.InstanceStatusReturned)
	if err != nil {
		return nil, err
	}
	instance = *owned

	err = withNotify(func(tx *gorm.DB) error {
		// 1. 更新业务表单数据（发起人修改，可选）
		if req != nil && len(req.BusinessData) > 0 {
			if err := ApplicationDataUpdateWithDB(tx, instance.AppID, instance.BusinessDataID, curUserID, req.BusinessData); err != nil {
				return err
			}
		}

		// 2. 重新读取业务数据并重新评估执行路径（退回后是新审批，条件分支按新表单数据重新走）
		formData, err := ApplicationDataDetail(instance.AppID, instance.BusinessDataID, &model.ApplicationDataDetailReq{})
		if err != nil {
			return fmt.Errorf("读取业务数据快照失败: %w", err)
		}
		nodes, err := parseFlowNodes(instance.ApprovalFlowJSON)
		if err != nil {
			return err
		}
		execPath := flattenExecutionPath(nodes, formData)
		execPathBytes, _ := json.Marshal(execPath)

		// 3. 原子守卫：仅当实例仍为已驳回时流转为进行中，重置游标到首节点，更新执行路径
		res := tx.Model(&model.ApprovalInstance{}).
			Where("id = ? AND status = ?", instanceID, model.InstanceStatusReturned).
			Updates(map[string]interface{}{
				"status":           model.InstanceStatusRunning,
				"current_node_idx": 0,
				"execution_path":   string(execPathBytes),
				"finished_at":      nil,
				"result":           "",
				"updated_by":       curUserID,
			})
		if res.Error != nil {
			return res.Error
		}
		if res.RowsAffected == 0 {
			return errors.New("该实例状态已变更，请刷新后重试")
		}

		// 4. 清空历史任务，从首节点重新生成任务（整条流程从头走）
		if err := tx.Where("instance_id = ?", instanceID).
			Delete(&model.ApprovalInstanceTask{}).Error; err != nil {
			return err
		}
		if err := tx.First(&instance, instanceID).Error; err != nil {
			return err
		}
		// 无审批节点（如仅配置了发起人）：重新提交即自动通过，不生成审批任务
		if len(execPath) == 0 {
			return finishNoApproverInstance(tx, &instance, curUserID)
		}
		return generateTasksForCurrentNode(tx, &instance, nodes, curUserID, "")
	})
	if err != nil {
		return nil, err
	}
	return &instance, nil
}

// ApprovalInstanceVoid 作废流程实例（仅发起人；**仅「已撤回」可作废**）：
// 与撤回的区别在于留痕——实例保留在「我的发起」中并置为「已作废」终态，
// 任务记录不删除（待处理任务由 finishInstance 置为「已取消」），
// 时间线上仍能看到原定审批人，可审计「谁本该审、但单据被作废」。
//
// 审核中的单据一律只能撤回：撤回会清空流程痕迹，此后才允许作废。
// 这样作废永远不会绕过审批人——只要流程真的流转过，发起人就必须先撤回
// （撤回本身也是一次有记录的主动中止），不能直接宣告作废。
func ApprovalInstanceVoid(curUserID, instanceID uint) error {
	return database.DB.Transaction(func(tx *gorm.DB) error {
		instance, err := loadOwnedInstance(tx, curUserID, instanceID, "作废",
			model.InstanceStatusWithdrawn)
		if err != nil {
			return err
		}

		// 置为「已作废」终态：同步取消待处理任务（保留记录），不写抄送、不发结果通知
		return finishInstance(tx, instance, model.InstanceStatusVoided, "发起人作废", curUserID)
	})
}

// ApprovalInstanceWithdraw 撤回流程实例（仅发起人、仅进行中）：
// 落为「已撤回」，保留在「我的发起」列表中，同时取消所有待处理任务。
// 已撤回实例可继续编辑（保存后转为正式草稿进草稿箱）或重新提交、删除。
// 流程快照与发起人自选成员保留，重新提交时按当时表单数据重新评估执行路径。
func ApprovalInstanceWithdraw(curUserID, instanceID uint) error {
	return database.DB.Transaction(func(tx *gorm.DB) error {
		instance, err := loadOwnedInstance(tx, curUserID, instanceID, "撤回", model.InstanceStatusRunning)
		if err != nil {
			return err
		}
		// 撤回时间窗口：提交后 30 分钟内允许撤回，超过不允许
		if instance.CreatedAt.Add(30 * time.Minute).Before(time.Now()) {
			return errors.New("提交已超过 30 分钟，不允许撤回")
		}
		// 1. 删除当前实例的全部审批任务（对齐钉钉：撤回=整条流程重来，
		// 重新提交时从首节点全新生成任务，当前流程视图不再堆叠历史"已取消"任务）
		if err := tx.Where("instance_id = ?", instance.ID).
			Delete(&model.ApprovalInstanceTask{}).Error; err != nil {
			return err
		}
		// 2. 从快照自选节点提取运行时成员写回草稿暂存（approval_draft_members），
		// 撤回后草稿箱编辑可恢复已选审批人/抄送人，重新提交时直接使用
		draftMembersJSON := "null"
		if nodes, err := parseFlowNodes(instance.ApprovalFlowJSON); err == nil {
			if members := extractSelfSelectUserIDs(nodes); len(members) > 0 {
				b, _ := json.Marshal(members)
				draftMembersJSON = string(b)
			}
		}
		// 3. 落为「已撤回」：重置执行游标与结果，finished_at 置空
		if err := tx.Model(instance).Updates(map[string]interface{}{
			"status":                 model.InstanceStatusWithdrawn,
			"current_node_idx":       0,
			"finished_at":            nil,
			"result":                 "",
			"approval_draft_members": draftMembersJSON,
			"updated_by":             curUserID,
		}).Error; err != nil {
			return err
		}
		return nil
	})
}

// ApprovalInstanceManualCC 手动抄送：把当前实例抄送给指定用户列表（可多选）。
//   - 幂等：同一 instance + user 已存在（manual-cc）则跳过该用户
//   - 写入 oa_approval_cc_records，并给每个被抄送人发一条站内通知（事务提交后通过 SSE 推送）
func ApprovalInstanceManualCC(curUserID, instanceID uint, userIDs []uint) error {
	if len(userIDs) == 0 {
		return errors.New("请选择抄送人")
	}
	var inst model.ApprovalInstance
	if err := database.DB.First(&inst, instanceID).Error; err != nil {
		return errors.New("审批实例不存在")
	}
	if inst.DeletedAt.Valid {
		return errors.New("审批实例不存在")
	}
	appName := getInstanceAppName(&inst)
	now := time.Now()
	return withNotify(func(tx *gorm.DB) error {
		// 过滤掉已抄送过的用户
		var existing []uint
		tx.Model(&model.ApprovalCCRecord{}).
			Where("instance_id = ? AND node_id = ? AND user_id IN ?", instanceID, "manual-cc", userIDs).
			Pluck("user_id", &existing)
		existingSet := make(map[uint]struct{}, len(existing))
		for _, id := range existing {
			existingSet[id] = struct{}{}
		}
		for _, uid := range userIDs {
			if uid == 0 {
				continue
			}
			if _, ok := existingSet[uid]; ok {
				continue
			}
			rec := model.ApprovalCCRecord{
				InstanceID: instanceID,
				NodeID:     "manual-cc",
				NodeName:   "手动抄送",
				UserID:     uid,
				NotifiedAt: &now,
			}
			rec.CreatedBy, rec.UpdatedBy = curUserID, curUserID
			if err := tx.Create(&rec).Error; err != nil {
				continue
			}
			notifyCreate(tx, model.Notification{
				UserID:     uid,
				Type:       3,
				Title:      appName,
				Msg:        "您有新的抄送通知",
				InstanceID: inst.ID,
			})
		}
		return nil
	})
}

// ApprovalInstanceDelete 删除流程实例（软删除）
// 仅允许发起人删除「草稿」实例——从未正式发起、未产生任何审批结果的记录。
// 已撤回需先编辑保存（转为草稿）后到草稿箱删除；已驳回/已作废/已通过/已拒绝等留有流程痕迹的记录不允许删除。
// 同时级联软删除对应的业务表数据，清理该实例产生的通知，并回收已无人引用的附件文件
func ApprovalInstanceDelete(curUserID, instanceID uint) error {
	var orphans []string
	err := database.DB.Transaction(func(tx *gorm.DB) error {
		instance, err := loadOwnedInstance(tx, curUserID, instanceID, "删除",
			model.InstanceStatusDraft)
		if err != nil {
			return err
		}

		// 级联软删除业务表数据，同时拿到这批数据引用到的附件地址
		if instance.BusinessDataID > 0 {
			paths, err := deleteBusinessData(tx, instance.AppID, instance.BusinessDataID)
			if err != nil {
				return fmt.Errorf("删除业务数据失败: %w", err)
			}
			orphans = paths
		}

		// 清理该实例产生的通知（待办/退回/抄送/结果）：通知表无软删除字段，物理删除，
		// 避免实例删除后通知仍残留在「消息通知」里
		if err := tx.Where("instance_id = ?", instanceID).Delete(&model.Notification{}).Error; err != nil {
			return err
		}

		// 软删除审批实例
		return tx.Delete(instance).Error
	})
	if err != nil {
		return err
	}
	// 事务已提交，此时才回收附件：文件删除不可回滚，放进事务里会出现「SQL 回滚了但文件已经没了」
	ReclaimOrphanUploads(orphans)
	return nil
}

// ApprovalInstanceDetail 获取流程实例详情（含任务列表+业务数据+审批人姓名+详情页布局）
func ApprovalInstanceDetail(curUserID, instanceID uint) (*model.ApprovalInstanceDetailResult, error) {
	var instance model.ApprovalInstance
	if err := database.DB.First(&instance, instanceID).Error; err != nil {
		return nil, errors.New("流程实例不存在")
	}

	// 查询应用配置（名称 + 详情页布局快照）
	// 布局采用增量存储（compact）：detail_layout_json 仅存布局自身字段 + 覆盖项，
	// 读取时按 element_id 从表单元素管理合并补全（与 form_layout_json 一致），
	// 保证修改表单元素设置后详情页即时生效、无需回布局管理重新拖拽
	// 历史实例：优先使用 instance 上提交时冻结的 form/detail 布局快照；
	// 老数据没有快照时回退到当前应用配置
	var app model.Application
	appName := ""
	var detailLayoutJSON any
	var formLayoutJSON any
	var latestFlowJSON any // 审批流展示用应用最新配置（与 detail_layout_json 一致，读取时合并）
	if err := database.DB.First(&app, instance.AppID).Error; err == nil {
		appName = app.Name
		if instance.DetailLayoutJSON != nil {
			if m, ok := instance.DetailLayoutJSON.(map[string]interface{}); ok {
				detailLayoutJSON = mergeLayoutJSON(m, instance.AppID)
			} else {
				detailLayoutJSON = instance.DetailLayoutJSON
			}
		} else {
			detailLayoutJSON = mergeLayoutJSON(app.DetailLayoutJSON, instance.AppID)
		}
		if instance.FormLayoutJSON != nil {
			if m, ok := instance.FormLayoutJSON.(map[string]interface{}); ok {
				formLayoutJSON = mergeLayoutJSON(m, instance.AppID)
			} else {
				formLayoutJSON = instance.FormLayoutJSON
			}
		} else {
			formLayoutJSON = mergeLayoutJSON(app.FormLayoutJSON, instance.AppID)
		}
		// 审批流展示应用最新配置；自选节点（approverType=3）的运行时成员从实例快照取（提交时注入），
		// 避免详情/时间线丢失发起人已选的审批人、抄送人
		latestFlowJSON = mergeFlowRuntimeMembers(app.ApprovalFlowJSON, instance.ApprovalFlowJSON)
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

	// 当前执行节点的表单字段权限（审批详情页按权限隐藏/可编辑字段）
	// 优先使用应用最新流程配置中的节点权限（ExamineManage 修改后即时生效），
	// 最新流程不可用时回退到实例冻结快照，保证历史实例仍能正常打开
	fieldPerms := currentNodeFieldPerms(instance)
	if latestNodes, err := parseFlowNodes(latestFlowJSON); err == nil && len(latestNodes) > 0 {
		if pathNodeIDs := instance.ExecutionPath; instance.CurrentNodeIdx >= 0 && instance.CurrentNodeIdx < len(pathNodeIDs) {
			if node := findNodeByID(latestNodes, pathNodeIDs[instance.CurrentNodeIdx]); node != nil {
				fieldPerms = node.FieldPerms
			}
		}
	}

	result := &model.ApprovalInstanceDetailResult{
		ApprovalInstance: instance,
		AppName:          appName,
		CreatedByName:    createdByName,
		BusinessData:     bizData,
		DetailLayoutJSON: detailLayoutJSON,
		FormLayoutJSON:   formLayoutJSON,
		Tasks:            toTaskResults(tasks),
		AssigneeNameMap:  assigneeNameMap,
		FieldPerms:       fieldPerms,
	}
	// 审批流配置返回应用最新值（ExamineManage 修改后详情即时生效），与 detail_layout_json 策略一致；
	// fieldPerms 已按实例冻结快照计算完毕（currentNodeFieldPerms），此处覆盖输出不影响字段权限判定
	if latestFlowJSON != nil {
		result.ApprovalFlowJSON = latestFlowJSON
	}
	return result, nil
}

// toTaskResults 将 ApprovalInstanceTask 列表转为响应 DTO 列表，剥离审计字段（created_at/updated_at/created_by/updated_by/deleted_at）
func toTaskResults(tasks []model.ApprovalInstanceTask) []model.ApprovalInstanceTaskResult {
	results := make([]model.ApprovalInstanceTaskResult, len(tasks))
	for i, t := range tasks {
		results[i] = model.ApprovalInstanceTaskResult{
			ID:            t.ID,
			InstanceID:    t.InstanceID,
			NodeID:        t.NodeID,
			NodeName:      t.NodeName,
			Sort:          t.Sort,
			AssigneeID:    t.AssigneeID,
			Status:        t.Status,
			Comment:       t.Comment,
			OperatedAt:    t.OperatedAt,
			DelegatedFrom: t.DelegatedFrom,
			AddSignFrom:   t.AddSignFrom,
			AddSignType:   t.AddSignType,
			CreatedBy:     t.CreatedBy,
		}
	}
	return results
}

// loadBusinessData 读取实例关联的业务数据（主表 + 子表）
// 保留审计字段（deleted_at/created_at/created_by/updated_at/updated_by）：审批详情需回显创建信息
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
	// JSON 字段（如 upload 文件列表）反序列化成对象，前端直接用
	for k, v := range bizData {
		if str, ok := v.(string); ok && len(str) > 0 && (str[0] == '{' || str[0] == '[') {
			var parsed interface{}
			if json.Unmarshal([]byte(str), &parsed) == nil {
				bizData[k] = parsed
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

// extractSelfSelectUserIDs 从流程快照提取自选节点（approverType=3）的运行时成员用户 ID：
// 撤回回退草稿时写回 approval_draft_members 暂存，供草稿箱编辑恢复与重新提交；条件分支 children 递归
func extractSelfSelectUserIDs(nodes []flowNode) map[string][]uint {
	result := map[string][]uint{}
	var walk func(list []flowNode)
	walk = func(list []flowNode) {
		for _, n := range list {
			if n.ApproverType == 3 && len(n.Members) > 0 {
				var ids []uint
				for _, m := range n.Members {
					if m.Type == 1 && strings.HasPrefix(m.Key, "user_") {
						if id, err := strconv.ParseUint(strings.TrimPrefix(m.Key, "user_"), 10, 64); err == nil {
							ids = append(ids, uint(id))
						}
					}
				}
				if len(ids) > 0 {
					result[n.ID] = ids
				}
			}
			if n.Type == 4 {
				for _, b := range n.Branches {
					walk(b.Children)
				}
			}
		}
	}
	walk(nodes)
	return result
}

// mergeFlowRuntimeMembers 将实例快照中自选节点（approverType=3）的运行时 members 合并进最新流程配置：
// 详情展示跟随应用最新配置（节点结构/字段），但发起人自选审批人/抄送人保留提交时注入的运行时人选。
// 草稿实例快照无运行时成员时原样返回最新配置（草稿编辑由前端按 approval_draft_members 注入）。
func mergeFlowRuntimeMembers(latest any, snapshot any) any {
	latestNodes, err := parseFlowNodes(latest)
	if err != nil || len(latestNodes) == 0 {
		return latest
	}
	snapshotNodes, err := parseFlowNodes(snapshot)
	if err != nil || len(snapshotNodes) == 0 {
		return latest
	}
	// 收集快照中所有自选节点的运行时成员（含条件分支 children 递归）
	runtimeMembers := map[string][]flowMember{}
	var collect func(list []flowNode)
	collect = func(list []flowNode) {
		for _, n := range list {
			if len(n.Members) > 0 {
				runtimeMembers[n.ID] = n.Members
			}
			if n.Type == 4 {
				for _, b := range n.Branches {
					collect(b.Children)
				}
			}
		}
	}
	collect(snapshotNodes)
	if len(runtimeMembers) == 0 {
		return latest
	}
	// 合并：最新流程中自选节点（approverType=3）若快照有同名节点成员则覆盖
	var merge func(list []flowNode) []flowNode
	merge = func(list []flowNode) []flowNode {
		out := make([]flowNode, 0, len(list))
		for _, n := range list {
			node := n
			if node.ApproverType == 3 {
				if m, ok := runtimeMembers[node.ID]; ok {
					node.Members = m
				}
			}
			if node.Type == 4 && len(node.Branches) > 0 {
				branches := make([]flowBranch, len(node.Branches))
				for i, b := range node.Branches {
					branches[i] = b
					branches[i].Children = merge(b.Children)
				}
				node.Branches = branches
			}
			out = append(out, node)
		}
		return out
	}
	return merge(latestNodes)
}

// currentNodeFieldPerms 当前执行节点的表单字段权限：
// 实例进行中时按 execution_path[current_node_idx] 定位节点，返回其 fieldPerms（[{field, perm}]）
func currentNodeFieldPerms(instance model.ApprovalInstance) []interface{} {
	if instance.Status != model.InstanceStatusRunning {
		return nil
	}
	pathNodeIDs := instance.ExecutionPath
	if instance.CurrentNodeIdx < 0 || instance.CurrentNodeIdx >= len(pathNodeIDs) {
		return nil
	}
	nodes, err := parseFlowNodes(instance.ApprovalFlowJSON)
	if err != nil {
		return nil
	}
	node := findNodeByID(nodes, pathNodeIDs[instance.CurrentNodeIdx])
	if node == nil {
		return nil
	}
	return node.FieldPerms
}

// buildAssigneeNameMap 批量查询任务审批人 + 发起人的用户姓名（用户ID -> 姓名）
func buildAssigneeNameMap(tasks []model.ApprovalInstanceTask, creatorID uint) map[string]string {
	uidSet := map[uint]bool{}
	var fromTaskIDs []uint
	for _, t := range tasks {
		if t.AssigneeID > 0 {
			uidSet[t.AssigneeID] = true
		}
		// 转交来源任务（delegated_from 存的是来源任务ID，时间线“由XX转交”需要其原审批人姓名）
		if t.DelegatedFrom > 0 {
			fromTaskIDs = append(fromTaskIDs, t.DelegatedFrom)
		}
		// 加签任务（add_sign_from>0）：CreatedBy 是发起加签的人，时间线“由XX加签”需要其姓名
		if t.AddSignFrom > 0 && t.CreatedBy > 0 {
			uidSet[t.CreatedBy] = true
		}
	}
	if len(fromTaskIDs) > 0 {
		var srcTasks []model.ApprovalInstanceTask
		if err := database.DB.Where("id IN ?", fromTaskIDs).Find(&srcTasks).Error; err == nil {
			for _, st := range srcTasks {
				if st.AssigneeID > 0 {
					uidSet[st.AssigneeID] = true
				}
			}
		}
	}
	if creatorID > 0 {
		uidSet[creatorID] = true
	}
	nameMap := make(map[string]string, len(uidSet))
	if len(uidSet) == 0 {
		return nameMap
	}
	names := queryUserNames(uidSet)
	for uid := range names {
		nameMap[strconv.FormatUint(uint64(uid), 10)] = names[uid]
	}
	return nameMap
}
