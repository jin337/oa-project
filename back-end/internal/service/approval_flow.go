package service

// ============================================================
// 审批流定义模型 & 解析 & 条件评估引擎
// ============================================================
// 本文件承载审批流配置的结构化定义（flowNode / flowMember / flowBranch / flowRule）、
// 快照解析（parseFlowNodes / findNodeByID）、发起人自选成员注入（injectSelfSelectIntoNodes）
// 以及条件分支评估（resolveFieldValue / evaluateBranch / pickHitBranches / flattenExecutionPath）。
// 条件评估逻辑与前端 DynamicFlowView.jsx 保持一致。
// ============================================================

import (
	"encoding/json"
	"fmt"
	"strconv"
	"strings"

	"back-end/internal/database"
	"back-end/internal/model"
)

// flowNode 审批流节点（从 approval_flow_json 反序列化后的结构）
type flowNode struct {
	ID           string        `json:"id"`
	Type         int           `json:"type"` // 1-发起人 2-审批人 3-抄送人 4-条件分支
	Label        string        `json:"label"`
	Members      []flowMember  `json:"members"`
	ApproverType int           `json:"approverType"` // 1-指定人员 2-指定角色 3-发起人自选 4-审核人员组
	SelfSelect   int           `json:"selfSelect"`   // 1-单选 2-多选
	Strategy     int           `json:"strategy"`     // 1-依次审批 2-会签 3-或签
	EmptyHandler int           `json:"emptyHandler"` // 审批人为空处理
	EmptyMembers []flowMember  `json:"emptyMembers"`
	Permissions  []int         `json:"permissions"`
	FieldPerms   []interface{} `json:"fieldPerms"`
	CCTiming     int           `json:"ccTiming"`
	Relation     int           `json:"relation"` // 1-且(AND) 2-或(OR)
	Branches     []flowBranch  `json:"branches"`
}

// flowMember 审批成员
type flowMember struct {
	Type  int    `json:"type"` // 1-人员 2-部门 3-角色 4-审核人员组
	Key   string `json:"key"`  // 如 user_1 / dept_2 / role_3 / group_4
	Label string `json:"label"`
}

// flowBranch 条件分支
type flowBranch struct {
	ID        string     `json:"id"`
	Label     string     `json:"label"`
	IsDefault bool       `json:"isDefault"`
	Rules     []flowRule `json:"rules"`
	Children  []flowNode `json:"children"`
}

// flowRule 条件规则
type flowRule struct {
	Field    string `json:"field"`     // 表单字段标识（field_key）
	TableKey string `json:"table_key"` // 关联物理表（子表字段时有值）
	Operator int    `json:"operator"`  // 1-大于 2-小于 3-等于 4-不等于 5-包含 6-不包含
	Value    string `json:"value"`     // 条件值
	Agg      string `json:"agg"`       // 子表聚合方式：row-单行(默认) / sum-列合计 / avg-平均值；主表字段忽略
}

// parseFlowNodes 解析 approval_flow_json 为节点数组（兼容 JSON 字符串与已解析结构）
func parseFlowNodes(raw any) ([]flowNode, error) {
	if raw == nil {
		return nil, nil
	}
	// 已经是 []interface{}（GORM JSON 反序列化后的结构）
	b, err := json.Marshal(raw)
	if err != nil {
		return nil, err
	}
	var nodes []flowNode
	if err := json.Unmarshal(b, &nodes); err != nil {
		return nil, err
	}
	return nodes, nil
}

// findNodeByID 从节点树（含条件分支嵌套）中按 ID 查找节点
func findNodeByID(nodes []flowNode, nodeID string) *flowNode {
	for i := range nodes {
		if nodes[i].ID == nodeID {
			return &nodes[i]
		}
		if nodes[i].Type == 4 {
			for j := range nodes[i].Branches {
				if found := findNodeByID(nodes[i].Branches[j].Children, nodeID); found != nil {
					return found
				}
			}
		}
	}
	return nil
}

// injectSelfSelectIntoNodes 将发起人自选审批人注入到 flow_snapshot 节点的 members 中，
// 使 approverType=3 的节点在快照中即包含最终确定的审批人，消除对 approval_draft_members 的运行时依赖。
// 同时查询用户姓名填充 Label 字段，确保前端可直接渲染。
func injectSelfSelectIntoNodes(nodes []flowNode, selfSelectMembers map[string][]uint) []flowNode {
	if len(selfSelectMembers) == 0 {
		return nodes
	}
	// 收集所有需要查询的用户 ID
	uidSet := map[uint]bool{}
	for _, uids := range selfSelectMembers {
		for _, uid := range uids {
			uidSet[uid] = true
		}
	}
	// 批量查询用户姓名
	uidList := make([]uint, 0, len(uidSet))
	for uid := range uidSet {
		uidList = append(uidList, uid)
	}
	nameMap := map[uint]string{}
	if len(uidList) > 0 {
		var users []model.User
		if err := database.DB.Unscoped().Preload("Profile").Where("id IN ?", uidList).Find(&users).Error; err == nil {
			for _, u := range users {
				nameMap[u.ID] = userNickname(u)
			}
		}
	}
	// 递归注入成员到 approverType=3 节点（含条件分支 children 内的节点）
	var inject func(list []flowNode)
	inject = func(list []flowNode) {
		for i := range list {
			if list[i].ApproverType == 3 {
				if uids, ok := selfSelectMembers[list[i].ID]; ok && len(uids) > 0 {
					members := make([]flowMember, 0, len(uids))
					for _, uid := range uids {
						members = append(members, flowMember{
							Type:  1,
							Key:   fmt.Sprintf("user_%d", uid),
							Label: nameMap[uid],
						})
					}
					list[i].Members = members
				}
			}
			// 条件分支：递归注入分支 children
			if list[i].Type == 4 {
				for j := range list[i].Branches {
					inject(list[i].Branches[j].Children)
				}
			}
		}
	}
	inject(nodes)
	return nodes
}

// ============================================================
// 条件评估引擎（与前端 DynamicFlowView.jsx 的 evaluateBranch 逻辑一致）
// ============================================================

// resolveFieldValue 获取规则字段在表单数据中的实际值（与前端 resolveFieldValue 一致）
// 子表字段按 rule.Agg 聚合：
//   - row（默认）：返回该字段全部非空行值组成的切片，由 evaluateRule 按"任一行命中"判定
//   - sum：返回数值列合计
//   - avg：返回数值列平均值
func resolveFieldValue(rule flowRule, formData map[string]interface{}) interface{} {
	if formData == nil {
		return nil
	}
	tk := rule.TableKey
	if tk != "" {
		if tableData, ok := formData[tk]; ok {
			if rows, ok := tableData.([]interface{}); ok && len(rows) > 0 {
				var nums []float64
				var raw []interface{}
				for _, row := range rows {
					if rowMap, ok := row.(map[string]interface{}); ok {
						if v, exists := rowMap[rule.Field]; exists && v != nil && v != "" {
							raw = append(raw, v)
							if n, ok := toFloat64(v); ok {
								nums = append(nums, n)
							}
						}
					}
				}
				switch rule.Agg {
				case "sum":
					if len(nums) > 0 {
						sum := float64(0)
						for _, n := range nums {
							sum += n
						}
						return sum
					}
					return raw
				case "avg":
					if len(nums) > 0 {
						sum := float64(0)
						for _, n := range nums {
							sum += n
						}
						return sum / float64(len(nums))
					}
					return raw
				default: // row 或空：返回全部行值，由 evaluateRule 任一行命中
					return raw
				}
			}
		}
		// 主表字段回退
		if v, ok := formData[rule.Field]; ok {
			return v
		}
		return nil
	}
	return formData[rule.Field]
}

// toFloat64 尝试将任意类型转为 float64
func toFloat64(v interface{}) (float64, bool) {
	switch n := v.(type) {
	case int:
		return float64(n), true
	case int8:
		return float64(n), true
	case int16:
		return float64(n), true
	case int32:
		return float64(n), true
	case int64:
		return float64(n), true
	case uint:
		return float64(n), true
	case uint8:
		return float64(n), true
	case uint16:
		return float64(n), true
	case uint32:
		return float64(n), true
	case uint64:
		return float64(n), true
	case float64:
		return n, true
	case float32:
		return float64(n), true
	case string:
		if f, err := strconv.ParseFloat(n, 64); err == nil {
			return f, true
		}
	case json.Number:
		if f, err := n.Float64(); err == nil {
			return f, true
		}
	}
	return 0, false
}

// toStr 将值转为字符串
func toStr(v interface{}) string {
	if v == nil {
		return ""
	}
	return fmt.Sprintf("%v", v)
}

// compareEqual 宽松等值比较（与前端 compareEqual 一致）
func compareEqual(a, b interface{}) bool {
	sa, sb := toStr(a), toStr(b)
	na, oka := toFloat64(a)
	nb, okb := toFloat64(b)
	if sa != "" && sb != "" && oka && okb {
		return na == nb
	}
	return sa == sb
}

// matchScalar 单值按 operator 比较（operator: 1-大于 2-小于 3-等于 4-不等于 5-包含 6-不包含）
func matchScalar(actual, cond interface{}, op int) bool {
	switch op {
	case 1: // 大于
		na, oka := toFloat64(actual)
		nc, okc := toFloat64(cond)
		return oka && okc && na > nc
	case 2: // 小于
		na, oka := toFloat64(actual)
		nc, okc := toFloat64(cond)
		return oka && okc && na < nc
	case 3: // 等于
		return compareEqual(actual, cond)
	case 4: // 不等于
		return !compareEqual(actual, cond)
	case 5: // 包含
		return strings.Contains(toStr(actual), toStr(cond))
	case 6: // 不包含
		return !strings.Contains(toStr(actual), toStr(cond))
	}
	return false
}

// evaluateRule 单条规则评估。子表 row 模式下 actual 为多值切片：任一行命中即满足。
func evaluateRule(rule flowRule, formData map[string]interface{}) bool {
	actual := resolveFieldValue(rule, formData)
	cond := rule.Value
	// 子表「单行」模式：任一非空行满足条件即命中
	if arr, ok := actual.([]interface{}); ok && len(arr) > 0 {
		for _, v := range arr {
			if matchScalar(v, cond, rule.Operator) {
				return true
			}
		}
		return false
	}
	return matchScalar(actual, cond, rule.Operator)
}

// evaluateBranch 分支命中评估：无条件（默认）分支视为命中；
// 有条件分支按节点 relation 综合判断——1-且(AND) 需全部规则满足，2-或(OR) 任一规则满足即可
func evaluateBranch(branch flowBranch, node flowNode, formData map[string]interface{}) bool {
	rules := branch.Rules
	if len(rules) == 0 {
		return true // 默认分支
	}
	relation := node.Relation
	if relation == 2 {
		// OR：任一规则满足
		for _, r := range rules {
			if evaluateRule(r, formData) {
				return true
			}
		}
		return false
	}
	// AND：全部规则满足
	for _, r := range rules {
		if !evaluateRule(r, formData) {
			return false
		}
	}
	return true
}

// pickHitBranches 命中分支选择（与前端 pickHitBranches 一致）
func pickHitBranches(node flowNode, formData map[string]interface{}) []flowBranch {
	branches := node.Branches
	var normalBranches []flowBranch
	var defaultBranch *flowBranch
	for i := range branches {
		if branches[i].IsDefault {
			defaultBranch = &branches[i]
		} else {
			normalBranches = append(normalBranches, branches[i])
		}
	}

	var hitBranches []flowBranch
	if len(formData) > 0 {
		for _, b := range normalBranches {
			if evaluateBranch(b, node, formData) {
				hitBranches = append(hitBranches, b)
			}
		}
	}
	if len(hitBranches) > 0 {
		return hitBranches
	}
	if defaultBranch != nil {
		return []flowBranch{*defaultBranch}
	}
	if len(normalBranches) > 0 {
		return []flowBranch{normalBranches[0]}
	}
	return nil
}

// flattenExecutionPath 条件评估后的命中节点 ID 链（只收集 type=2 审批人与 type=3 抄送人节点）
// 与前端 DynamicFlowView 的 flattenedNodes 逻辑一致：隐藏发起人(type=1)、穿透条件分支(type=4)
func flattenExecutionPath(nodes []flowNode, formData map[string]interface{}) []string {
	var path []string
	var walk func(list []flowNode)
	walk = func(list []flowNode) {
		for _, n := range list {
			if n.Type == 1 {
				continue // 跳过发起人
			}
			if n.Type == 4 {
				// 条件分支：穿透展开命中分支的 children
				hitBranches := pickHitBranches(n, formData)
				for _, b := range hitBranches {
					walk(b.Children)
				}
				continue
			}
			if n.Type == 2 || n.Type == 3 {
				path = append(path, n.ID)
			}
		}
	}
	walk(nodes)
	return path
}
