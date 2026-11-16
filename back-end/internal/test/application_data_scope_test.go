package test

import (
	"testing"

	"back-end/internal/middleware"
	"back-end/internal/service"
)

// TestBuildDataPermissionCondsFailsClosedWithoutCreatedBy
// 业务表缺 created_by 时不能跳过数据范围过滤，否则“仅本部门/仅本人”会退化为全部数据。
func TestBuildDataPermissionCondsFailsClosedWithoutCreatedBy(t *testing.T) {
	cases := []struct {
		name  string
		scope *middleware.DataScopeResult
	}{
		{name: "仅本人", scope: &middleware.DataScopeResult{Self: true}},
		{name: "自定义部门", scope: &middleware.DataScopeResult{DeptIDs: []uint{2, 3}}},
		{name: "本部门", scope: &middleware.DataScopeResult{DeptIDs: []uint{2}}},
		{name: "本部门及以下", scope: &middleware.DataScopeResult{DeptIDs: []uint{2, 4, 5}}},
		{name: "空范围", scope: &middleware.DataScopeResult{}},
		{name: "nil 范围", scope: nil},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			conds, args := service.BuildDataPermissionCondsForScope(tc.scope, 7, map[string]bool{})
			if len(conds) != 1 || conds[0] != "1 = 0" {
				t.Fatalf("缺 created_by 条件 = %v, 期望 [1 = 0]", conds)
			}
			if len(args) != 0 {
				t.Fatalf("缺 created_by 参数 = %v, 期望空", args)
			}
		})
	}
}

// TestBuildDataPermissionCondsAllBypassesColumnCheck
// “全部数据”角色不需要 created_by 列，保持不过滤。
func TestBuildDataPermissionCondsAllBypassesColumnCheck(t *testing.T) {
	conds, args := service.BuildDataPermissionCondsForScope(
		&middleware.DataScopeResult{All: true}, 7, map[string]bool{},
	)
	if len(conds) != 0 || len(args) != 0 {
		t.Fatalf("全部数据条件 = %v, 参数 = %v, 期望均空", conds, args)
	}
}

// TestBuildDataPermissionCondsSelfUsesCreatedBy
// 有 created_by 时“仅本人”按当前用户 ID 过滤。
func TestBuildDataPermissionCondsSelfUsesCreatedBy(t *testing.T) {
	conds, args := service.BuildDataPermissionCondsForScope(
		&middleware.DataScopeResult{Self: true}, 7, map[string]bool{"created_by": true},
	)
	if len(conds) != 1 || conds[0] != "`created_by` IN ?" {
		t.Fatalf("仅本人条件 = %v, 期望 [`created_by` IN ?]", conds)
	}
	if len(args) != 1 {
		t.Fatalf("仅本人参数数量 = %d, 期望 1", len(args))
	}
	ids, ok := args[0].([]uint)
	if !ok || len(ids) != 1 || ids[0] != 7 {
		t.Fatalf("仅本人参数 = %#v, 期望 []uint{7}", args[0])
	}
}
