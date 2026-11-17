package test

import (
	"strings"
	"testing"

	"back-end/internal/model"
	"back-end/internal/service"
)

func TestValidateFlowNodesApprovers(t *testing.T) {
	cases := []struct {
		name    string
		nodes   []service.FlowNode
		wantErr string
	}{
		{
			name: "指定人员审批节点有审批人",
			nodes: []service.FlowNode{{
				ID: "n1", Type: 2, Label: "部门负责人", ApproverType: 1,
				Members: []service.FlowMember{{Type: 1, Key: "user_1"}},
			}},
		},
		{
			name: "指定人员审批节点为空",
			nodes: []service.FlowNode{{
				ID: "n1", Type: 2, Label: "部门负责人", ApproverType: 1,
			}},
			wantErr: "未配置审批人",
		},
		{
			name: "自动通过节点允许审批人为空",
			nodes: []service.FlowNode{{
				ID: "n1", Type: 2, Label: "自动通过节点", ApproverType: 1, EmptyHandler: 1,
			}},
		},
		{
			name: "审批人 key 非法",
			nodes: []service.FlowNode{{
				ID: "n1", Type: 2, Label: "部门负责人", ApproverType: 1,
				Members: []service.FlowMember{{Type: 1, Key: "bad-key"}},
			}},
			wantErr: "无效审批人配置",
		},
		{
			name: "发起人自选配置期允许为空",
			nodes: []service.FlowNode{{
				ID: "n1", Type: 2, Label: "发起人自选", ApproverType: 3,
			}},
		},
		{
			name: "条件分支内审批节点为空",
			nodes: []service.FlowNode{{
				ID: "b1", Type: 4, Label: "条件分支",
				Branches: []service.FlowBranch{{
					ID: "br1", Label: "金额大于 100",
					Children: []service.FlowNode{{
						ID: "n1", Type: 2, Label: "财务审批", ApproverType: 1,
					}},
				}},
			}},
			wantErr: "财务审批",
		},
		{
			name: "条件分支内自动通过节点允许为空",
			nodes: []service.FlowNode{{
				ID: "b1", Type: 4, Label: "条件分支",
				Branches: []service.FlowBranch{{
					ID: "br1", Label: "金额大于 100",
					Children: []service.FlowNode{{
						ID: "n1", Type: 2, Label: "董事会审批", ApproverType: 3, EmptyHandler: 1,
					}},
				}},
			}},
		},
		{
			name: "发起人与抄送节点为空不阻断",
			nodes: []service.FlowNode{
				{ID: "start", Type: 1, Label: "发起人", InitiatorType: 3},
				{ID: "cc1", Type: 3, Label: "抄送人"},
			},
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := service.ValidateFlowNodesApprovers(tc.nodes)
			if tc.wantErr == "" {
				if err != nil {
					t.Fatalf("expect nil error, got %v", err)
				}
				return
			}
			if err == nil || !strings.Contains(err.Error(), tc.wantErr) {
				t.Fatalf("expect error containing %q, got %v", tc.wantErr, err)
			}
		})
	}
}

func TestValidateSelfSelectBeforeWrite(t *testing.T) {
	baseFlow := []service.FlowNode{{
		ID: "n1", Type: 2, Label: "审批人", ApproverType: 3, EmptyHandler: 2,
	}}
	cases := []struct {
		name              string
		flow              []service.FlowNode
		selfSelectMembers map[string][]uint
		wantErr           string
	}{
		{
			name:    "未选择自选审批人时写库前拒绝",
			flow:    baseFlow,
			wantErr: "请为「审批人」节点选择审批人后再提交",
		},
		{
			name: "自动通过节点未选择自选审批人时放行",
			flow: []service.FlowNode{{
				ID: "n1", Type: 2, Label: "审批人", ApproverType: 3, EmptyHandler: 1,
			}},
		},
		{
			name: "已选择自选审批人时放行",
			flow: []service.FlowNode{{
				ID: "n1", Type: 2, Label: "审批人", ApproverType: 3, EmptyHandler: 2,
				Members: []service.FlowMember{{Type: 1, Key: "user_1", Label: "超级管理员"}},
			}},
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			app := &model.Application{ApprovalFlowJSON: tc.flow}
			err := service.ValidateSelfSelectBeforeWrite(app, map[string]interface{}{}, tc.selfSelectMembers)
			if tc.wantErr == "" {
				if err != nil {
					t.Fatalf("expect nil error, got %v", err)
				}
				return
			}
			if err == nil || !strings.Contains(err.Error(), tc.wantErr) {
				t.Fatalf("expect error containing %q, got %v", tc.wantErr, err)
			}
		})
	}
}

func TestValidateExecutionPathApprovers(t *testing.T) {
	member := []service.FlowMember{{Type: 1, Key: "user_1"}}
	cases := []struct {
		name     string
		nodes    []service.FlowNode
		execPath []string
		wantErr  string
	}{
		{
			name: "路径上的审批节点有审批人",
			nodes: []service.FlowNode{{
				ID: "n1", Type: 2, Label: "部门负责人", ApproverType: 1, Members: member,
			}},
			execPath: []string{"n1"},
		},
		{
			name: "路径上的审批节点为空",
			nodes: []service.FlowNode{{
				ID: "n1", Type: 2, Label: "部门负责人", ApproverType: 1,
			}},
			execPath: []string{"n1"},
			wantErr:  "未解析到审批人",
		},
		{
			name: "自选节点未选择审批人",
			nodes: []service.FlowNode{{
				ID: "n1", Type: 2, Label: "发起人自选", ApproverType: 3,
			}},
			execPath: []string{"n1"},
			wantErr:  "未选择审批人",
		},
		{
			name: "自选节点已选择审批人",
			nodes: []service.FlowNode{{
				ID: "n1", Type: 2, Label: "发起人自选", ApproverType: 3, Members: member,
			}},
			execPath: []string{"n1"},
		},
		{
			name: "自动通过节点允许审批人为空",
			nodes: []service.FlowNode{{
				ID: "n1", Type: 2, Label: "部门负责人", ApproverType: 1, EmptyHandler: 1,
			}},
			execPath: []string{"n1"},
		},
		{
			name: "自动通过的自选节点允许未选择审批人",
			nodes: []service.FlowNode{{
				ID: "n1", Type: 2, Label: "发起人自选", ApproverType: 3, EmptyHandler: 1,
			}},
			execPath: []string{"n1"},
		},
		{
			name: "抄送节点为空不影响",
			nodes: []service.FlowNode{{
				ID: "cc1", Type: 3, Label: "抄送人",
			}},
			execPath: []string{"cc1"},
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := service.ValidateExecutionPathApprovers(tc.nodes, tc.execPath)
			if tc.wantErr == "" {
				if err != nil {
					t.Fatalf("expect nil error, got %v", err)
				}
				return
			}
			if err == nil || !strings.Contains(err.Error(), tc.wantErr) {
				t.Fatalf("expect error containing %q, got %v", tc.wantErr, err)
			}
		})
	}
}
