package service

import (
	"strings"
	"testing"
)

func TestValidateFlowNodesApprovers(t *testing.T) {
	cases := []struct {
		name    string
		nodes   []flowNode
		wantErr string
	}{
		{
			name: "指定人员审批节点有审批人",
			nodes: []flowNode{{
				ID: "n1", Type: 2, Label: "部门负责人", ApproverType: 1,
				Members: []flowMember{{Type: 1, Key: "user_1"}},
			}},
		},
		{
			name: "指定人员审批节点为空",
			nodes: []flowNode{{
				ID: "n1", Type: 2, Label: "部门负责人", ApproverType: 1,
			}},
			wantErr: "未配置审批人",
		},
		{
			name: "审批人 key 非法",
			nodes: []flowNode{{
				ID: "n1", Type: 2, Label: "部门负责人", ApproverType: 1,
				Members: []flowMember{{Type: 1, Key: "bad-key"}},
			}},
			wantErr: "无效审批人配置",
		},
		{
			name: "发起人自选配置期允许为空",
			nodes: []flowNode{{
				ID: "n1", Type: 2, Label: "发起人自选", ApproverType: 3,
			}},
		},
		{
			name: "条件分支内审批节点为空",
			nodes: []flowNode{{
				ID: "b1", Type: 4, Label: "条件分支",
				Branches: []flowBranch{{
					ID: "br1", Label: "金额大于 100",
					Children: []flowNode{{
						ID: "n1", Type: 2, Label: "财务审批", ApproverType: 1,
					}},
				}},
			}},
			wantErr: "财务审批",
		},
		{
			name: "发起人与抄送节点为空不阻断",
			nodes: []flowNode{
				{ID: "start", Type: 1, Label: "发起人", InitiatorType: 3},
				{ID: "cc1", Type: 3, Label: "抄送人"},
			},
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := validateFlowNodesApprovers(tc.nodes)
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
	member := []flowMember{{Type: 1, Key: "user_1"}}
	cases := []struct {
		name     string
		nodes    []flowNode
		execPath []string
		wantErr  string
	}{
		{
			name: "路径上的审批节点有审批人",
			nodes: []flowNode{{
				ID: "n1", Type: 2, Label: "部门负责人", ApproverType: 1, Members: member,
			}},
			execPath: []string{"n1"},
		},
		{
			name: "路径上的审批节点为空",
			nodes: []flowNode{{
				ID: "n1", Type: 2, Label: "部门负责人", ApproverType: 1,
			}},
			execPath: []string{"n1"},
			wantErr:  "未解析到审批人",
		},
		{
			name: "自选节点未选择审批人",
			nodes: []flowNode{{
				ID: "n1", Type: 2, Label: "发起人自选", ApproverType: 3,
			}},
			execPath: []string{"n1"},
			wantErr:  "未选择审批人",
		},
		{
			name: "自选节点已选择审批人",
			nodes: []flowNode{{
				ID: "n1", Type: 2, Label: "发起人自选", ApproverType: 3, Members: member,
			}},
			execPath: []string{"n1"},
		},
		{
			name: "抄送节点为空不影响",
			nodes: []flowNode{{
				ID: "cc1", Type: 3, Label: "抄送人",
			}},
			execPath: []string{"cc1"},
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := validateExecutionPathApprovers(tc.nodes, tc.execPath)
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
