package test

import (
	"strings"
	"testing"

	"back-end/internal/model"
	"back-end/internal/service"
)

// flow-list 主表查询：必须按 app_id + business_table + business_data_id 关联
// 审批实例，并只保留 status=已通过 的数据；过滤条件按列名校验后追加。
func TestBuildFlowListQueryRequiresApprovedInstance(t *testing.T) {
	cols := map[string]bool{"id": true, "deleted_at": true, "deptname": true}
	query, args, err := service.BuildFlowListQuery(
		"oa_pay_account",
		cols,
		map[string]string{"deptname": "南京昇祥"},
		8,
		"pay_account",
	)
	if err != nil {
		t.Fatalf("构造查询失败: %v", err)
	}

	if !strings.Contains(query, "EXISTS (SELECT 1 FROM `oa_approval_instances` AS `ai`") {
		t.Fatalf("查询缺少审批实例存在性判断: %s", query)
	}
	if !strings.Contains(query, "`ai`.`deleted_at` IS NULL AND `ai`.`status` = ?") {
		t.Fatalf("查询缺少已通过实例条件: %s", query)
	}
	if !strings.Contains(query, "`ai`.`business_data_id` = `oa_pay_account`.`id`") {
		t.Fatalf("审批实例未按业务主键关联: %s", query)
	}

	wantArgs := []interface{}{uint(8), "pay_account", model.InstanceStatusPassed, "南京昇祥"}
	if len(args) != len(wantArgs) {
		t.Fatalf("参数数量 = %d, 期望 %d: %v", len(args), len(wantArgs), args)
	}
	for i := range wantArgs {
		if args[i] != wantArgs[i] {
			t.Errorf("args[%d] = %v, 期望 %v", i, args[i], wantArgs[i])
		}
	}
}

// 主表没有 id 时无法关联审批实例，必须拒绝而不是返回未判定审批状态的数据。
func TestBuildFlowListQueryRequiresID(t *testing.T) {
	_, _, err := service.BuildFlowListQuery("oa_pay_account", map[string]bool{"deptname": true}, nil, 8, "pay_account")
	if err == nil || !strings.Contains(err.Error(), "无法判断审批状态") {
		t.Fatalf("缺少 id 应报错，实际: %v", err)
	}
}
