package service

import (
	"testing"
	"time"

	"back-end/internal/model"
)

func TestIsOrdinaryApprovedTask(t *testing.T) {
	cases := []struct {
		name string
		task *model.ApprovalInstanceTask
		want bool
	}{
		{
			name: "普通已通过任务可作为退回候选",
			task: &model.ApprovalInstanceTask{Status: model.TaskStatusApproved, DelegatedFrom: 0, AddSignFrom: 0},
			want: true,
		},
		{
			name: "转交任务不作为退回候选",
			task: &model.ApprovalInstanceTask{Status: model.TaskStatusApproved, DelegatedFrom: 12},
			want: false,
		},
		{
			name: "加签任务不作为退回候选",
			task: &model.ApprovalInstanceTask{Status: model.TaskStatusApproved, AddSignFrom: 12, AddSignType: 2},
			want: false,
		},
		{
			name: "未通过任务不作为退回候选",
			task: &model.ApprovalInstanceTask{Status: model.TaskStatusPending},
			want: false,
		},
		{name: "nil 任务安全返回 false", task: nil, want: false},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := isOrdinaryApprovedTask(tc.task); got != tc.want {
				t.Fatalf("isOrdinaryApprovedTask() = %v, want %v", got, tc.want)
			}
		})
	}
}

func TestIsDerivedTask(t *testing.T) {
	cases := []struct {
		name string
		task *model.ApprovalInstanceTask
		want bool
	}{
		{name: "nil 任务不是衍生任务", task: nil, want: false},
		{name: "普通任务不是衍生任务", task: &model.ApprovalInstanceTask{Status: model.TaskStatusPending}, want: false},
		{name: "转交任务识别为衍生任务", task: &model.ApprovalInstanceTask{DelegatedFrom: 12}, want: true},
		{name: "加签任务识别为衍生任务", task: &model.ApprovalInstanceTask{AddSignFrom: 12, AddSignType: 2}, want: true},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := isDerivedTask(tc.task); got != tc.want {
				t.Fatalf("isDerivedTask() = %v, want %v", got, tc.want)
			}
		})
	}
}

func TestReturnCandidateNodeAllowed(t *testing.T) {
	cases := []struct {
		name         string
		candidateIdx int
		currentIdx   int
		strategy     int
		want         bool
	}{
		{name: "前一节点允许退回", candidateIdx: 0, currentIdx: 1, strategy: 2, want: true},
		{name: "依次审批同节点前序审批人允许退回", candidateIdx: 1, currentIdx: 1, strategy: 1, want: true},
		{name: "默认依次审批同节点允许退回", candidateIdx: 1, currentIdx: 1, strategy: 0, want: true},
		{name: "会签同节点不允许互相退回", candidateIdx: 1, currentIdx: 1, strategy: 2, want: false},
		{name: "或签同节点不允许互相退回", candidateIdx: 1, currentIdx: 1, strategy: 3, want: false},
		{name: "后续节点不能退回", candidateIdx: 2, currentIdx: 1, strategy: 1, want: false},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := returnCandidateNodeAllowed(tc.candidateIdx, tc.currentIdx, tc.strategy); got != tc.want {
				t.Fatalf("returnCandidateNodeAllowed() = %v, want %v", got, tc.want)
			}
		})
	}
}

func TestTaskApprovedAfterReturnTarget(t *testing.T) {
	now := time.Now()
	earlier := now.Add(-time.Minute)
	later := now.Add(time.Minute)
	pathIndex := map[string]int{"prev": 0, "cur": 1}

	cases := []struct {
		name   string
		task   *model.ApprovalInstanceTask
		target *model.ApprovalInstanceTask
		want   bool
	}{
		{
			name:   "后续节点普通通过任务应取消",
			task:   &model.ApprovalInstanceTask{NodeID: "cur", OperatedAt: &later},
			target: &model.ApprovalInstanceTask{NodeID: "prev", OperatedAt: &earlier},
			want:   true,
		},
		{
			name:   "前一节点普通通过任务不应取消",
			task:   &model.ApprovalInstanceTask{NodeID: "prev", OperatedAt: &later},
			target: &model.ApprovalInstanceTask{NodeID: "cur", OperatedAt: &earlier},
			want:   false,
		},
		{
			name:   "同节点目标之后的通过任务应取消",
			task:   &model.ApprovalInstanceTask{NodeID: "prev", OperatedAt: &later},
			target: &model.ApprovalInstanceTask{NodeID: "prev", OperatedAt: &earlier},
			want:   true,
		},
		{
			name:   "同节点目标之前的通过任务不应取消",
			task:   &model.ApprovalInstanceTask{NodeID: "prev", OperatedAt: &earlier},
			target: &model.ApprovalInstanceTask{NodeID: "prev", OperatedAt: &later},
			want:   false,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := taskApprovedAfterReturnTarget(tc.task, tc.target, pathIndex); got != tc.want {
				t.Fatalf("taskApprovedAfterReturnTarget() = %v, want %v", got, tc.want)
			}
		})
	}
}
