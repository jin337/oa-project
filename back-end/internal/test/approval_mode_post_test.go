package test

import (
	"testing"

	"back-end/internal/model"
	"back-end/internal/service"
)

// postTestNode 构造一个指定成员（人员 user_x）的审批节点，不依赖数据库。
// 跨包访问：flowNode/flowMember 经 service 导出别名构造。
func postTestNode(id string, strategy int, memberKeys ...string) service.FlowNode {
	ms := make([]service.FlowMember, 0, len(memberKeys))
	for _, k := range memberKeys {
		ms = append(ms, service.FlowMember{Type: 1, Key: k})
	}
	return service.FlowNode{ID: id, Type: 2, Label: id, ApproverType: 1, Members: ms, Strategy: strategy}
}

func TestParseApprovalModePost(t *testing.T) {
	cases := []struct {
		name string
		raw  any
		want string
	}{
		{name: "JSON 字符串后置", raw: `{"approvalMode":"post"}`, want: "post"},
		{name: "JSON 字符串前置", raw: `{"approvalMode":"pre"}`, want: "pre"},
		{name: "JSON 字符串顺序", raw: `{"approvalMode":"sequential"}`, want: "sequential"},
		{name: "map 后置", raw: map[string]interface{}{"approvalMode": "post"}, want: "post"},
		{name: "空字符串回退顺序", raw: "", want: "sequential"},
		{name: "非法 JSON 回退顺序", raw: `{"approvalMode":`, want: "sequential"},
		{name: "未知模式回退顺序", raw: `{"approvalMode":"other"}`, want: "sequential"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := service.ParseApprovalMode(tc.raw); got != tc.want {
				t.Fatalf("ParseApprovalMode() = %q, want %q", got, tc.want)
			}
		})
	}
}

func TestPostLastNodeIdx(t *testing.T) {
	cases := []struct {
		name     string
		path     []string
		nodes    []service.FlowNode
		userIDs  []uint
		wantLast map[uint]int
	}{
		{
			name:     "双节点同人：最后出现为第二个节点",
			path:     []string{"n1", "n2"},
			nodes:    []service.FlowNode{postTestNode("n1", 1, "user_1"), postTestNode("n2", 1, "user_1")},
			userIDs:  []uint{1},
			wantLast: map[uint]int{1: 1},
		},
		{
			name:     "三人混合：各取最后出现索引",
			path:     []string{"n1", "n2", "n3"},
			nodes:    []service.FlowNode{postTestNode("n1", 1, "user_1"), postTestNode("n2", 1, "user_1", "user_4"), postTestNode("n3", 1, "user_1")},
			userIDs:  []uint{1, 4},
			wantLast: map[uint]int{1: 2, 4: 1},
		},
		{
			name:     "抄送节点不参与判定",
			path:     []string{"n1", "cc", "n2"},
			nodes:    []service.FlowNode{postTestNode("n1", 1, "user_1"), {ID: "cc", Type: 3, Label: "cc"}, postTestNode("n2", 1, "user_1")},
			userIDs:  []uint{1},
			wantLast: map[uint]int{1: 2},
		},
		{
			name:     "各只出现一次：索引即自身",
			path:     []string{"n1", "n2"},
			nodes:    []service.FlowNode{postTestNode("n1", 1, "user_1"), postTestNode("n2", 1, "user_4")},
			userIDs:  []uint{1, 4},
			wantLast: map[uint]int{1: 0, 4: 1},
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			inst := &model.ApprovalInstance{ExecutionPath: tc.path}
			got := service.PostLastNodeIdx(inst, tc.nodes, tc.userIDs)
			for uid, want := range tc.wantLast {
				if got[uid] != want {
					t.Fatalf("PostLastNodeIdx()[%d] = %d, want %d", uid, got[uid], want)
				}
			}
		})
	}
}

func TestAutoApprovedComment(t *testing.T) {
	cases := []struct {
		name   string
		mode   string
		suffix string
		want   string
	}{
		{name: "后置卡位", mode: "post", suffix: "自动通过", want: "已后置审批，自动通过"},
		{name: "前置卡位", mode: "pre", suffix: "自动通过", want: "已前置审批，自动通过"},
		{name: "后置退回", mode: "post", suffix: "退回后不重复审批", want: "已后置审批，退回后不重复审批"},
		{name: "前置退回", mode: "pre", suffix: "退回后不重复审批", want: "已前置审批，退回后不重复审批"},
		// 顺序模式（ParseApprovalMode 默认返回 sequential）：无前置/后置语义，只输出纯动作文案
		{name: "顺序模式纯文案", mode: "sequential", suffix: "自动通过", want: "自动通过"},
		{name: "顺序模式退回文案", mode: "sequential", suffix: "退回后不重复审批", want: "退回后不重复审批"},
		// 未知/空 mode 同样落入兜底分支（防御性契约）
		{name: "空 mode 兜底", mode: "", suffix: "自动通过", want: "自动通过"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := service.AutoApprovedComment(tc.mode, tc.suffix); got != tc.want {
				t.Fatalf("AutoApprovedComment() = %q, want %q", got, tc.want)
			}
		})
	}
}
