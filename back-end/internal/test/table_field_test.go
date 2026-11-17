package test

import (
	"testing"

	"back-end/internal/model"
	"back-end/internal/service"
)

// 非默认条件分支仅依赖被删字段时，规则清空后必须删掉整条分支，避免 evaluateBranch 将其视为恒真。
func TestPruneApprovalFlowRemovesEmptyNonDefaultBranch(t *testing.T) {
	root := []interface{}{
		map[string]interface{}{
			"type": "condition",
			"branches": []interface{}{
				map[string]interface{}{
					"isDefault": true,
					"rules":     []interface{}{},
				},
				map[string]interface{}{
					"isDefault": false,
					"rules": []interface{}{
						map[string]interface{}{"field": "amount", "table_key": "cswd", "operator": ">"},
					},
				},
				map[string]interface{}{
					"isDefault": false,
					"rules": []interface{}{
						map[string]interface{}{"field": "amount", "table_key": "cswd", "operator": ">"},
						map[string]interface{}{"field": "dept", "table_key": "cswd", "operator": "="},
					},
				},
			},
		},
	}
	next, removed := service.PruneApprovalFlowValue(root, "cswd", "amount", "cswd")
	if removed != 2 {
		t.Fatalf("removed=%d, want 2", removed)
	}
	node := next.([]interface{})[0].(map[string]interface{})
	branches := node["branches"].([]interface{})
	if len(branches) != 2 {
		t.Fatalf("branches=%d, want 2 (默认分支 + 仍有一条规则的分支)", len(branches))
	}
	if len(branches[1].(map[string]interface{})["rules"].([]interface{})) != 1 {
		t.Fatal("仍有其他规则的分支不应被删除")
	}
}

// 字段权限与条件规则都要按 table_key 精确清理，不能误删其他表同名字段。
func TestPruneApprovalFlowRespectsTableKey(t *testing.T) {
	node := map[string]interface{}{
		"fieldPerms": []interface{}{
			map[string]interface{}{"field": "amount", "table_key": "cswd"},
			map[string]interface{}{"field": "amount", "table_key": "cswd_detail"},
		},
	}
	next, removed := service.PruneApprovalFlowValue(node, "cswd", "amount", "cswd")
	if removed != 1 {
		t.Fatalf("removed=%d, want 1", removed)
	}
	perms := next.(map[string]interface{})["fieldPerms"].([]interface{})
	if len(perms) != 1 {
		t.Fatalf("perms=%d, want 1", len(perms))
	}
	if perms[0].(map[string]interface{})["table_key"] != "cswd_detail" {
		t.Fatal("应保留子表同名字段权限")
	}
}

// 改名同步元素/布局/审批流中的字段引用，同时保留其他表同名字段与表达式。
func TestRenameFieldInJSON(t *testing.T) {
	layout := map[string]interface{}{
		"elements": []interface{}{
			map[string]interface{}{
				"field_key": "amount", "table_key": "cswd", "dataIndex": "amount",
				"dynamic_states": map[string]interface{}{"visible_if": "${form.amount > 0}"},
				"actions": map[string]interface{}{
					"value_mapping": []interface{}{
						map[string]interface{}{"table_name": "cswd", "target": "amount"},
						map[string]interface{}{"table_name": "cswd_detail", "target": "amount"},
					},
				},
			},
			map[string]interface{}{"field_key": "amount", "table_key": "cswd_detail"},
		},
	}
	next, changed := service.RenameFieldInJSON(layout, "cswd", "amount", "total_amount", "cswd")
	if changed < 4 {
		t.Fatalf("changed=%d, want at least 4", changed)
	}
	el := next.(map[string]interface{})["elements"].([]interface{})[0].(map[string]interface{})
	if el["field_key"] != "total_amount" || el["dataIndex"] != "total_amount" {
		t.Fatal("主表字段引用未同步")
	}
	if el["dynamic_states"].(map[string]interface{})["visible_if"] != "${form.total_amount > 0}" {
		t.Fatal("动态表达式未同步")
	}
	mapping := el["actions"].(map[string]interface{})["value_mapping"].([]interface{})
	if mapping[0].(map[string]interface{})["target"] != "total_amount" {
		t.Fatal("主表动作目标未同步")
	}
	if mapping[1].(map[string]interface{})["target"] != "amount" {
		t.Fatal("子表同名字段不应被改名")
	}
	if next.(map[string]interface{})["elements"].([]interface{})[1].(map[string]interface{})["field_key"] != "amount" {
		t.Fatal("子表同名字段不应被改名")
	}
}

func TestRenameFlowField(t *testing.T) {
	flow := map[string]interface{}{
		"nodes": []interface{}{
			map[string]interface{}{
				"rules": []interface{}{
					map[string]interface{}{"field": "amount", "table_key": "cswd"},
					map[string]interface{}{"field": "amount", "table_key": "cswd_detail"},
				},
			},
		},
	}
	next, changed := service.RenameFieldInJSON(flow, "cswd", "amount", "total_amount", "cswd")
	if changed != 1 {
		t.Fatalf("changed=%d, want 1", changed)
	}
	rules := next.(map[string]interface{})["nodes"].([]interface{})[0].(map[string]interface{})["rules"].([]interface{})
	if rules[0].(map[string]interface{})["field"] != "total_amount" {
		t.Fatal("主表审批规则未同步")
	}
	if rules[1].(map[string]interface{})["field"] != "amount" {
		t.Fatal("子表同名字段不应被改名")
	}
}

// 列级数据判断必须按类型区分：字符串排除空白，数字/日期只排除 NULL，JSON/BLOB 排除空内容。
func TestColumnDataExpr(t *testing.T) {
	cases := []struct {
		name string
		col  model.TableColumn
		want string
	}{
		{"varchar", model.TableColumn{Name: "project_name", Type: "varchar"}, "(`project_name` IS NOT NULL AND TRIM(`project_name`) <> '')"},
		{"text", model.TableColumn{Name: "remark", Type: "text"}, "(`remark` IS NOT NULL AND TRIM(`remark`) <> '')"},
		{"int", model.TableColumn{Name: "amount", Type: "int"}, "(`amount` IS NOT NULL)"},
		{"decimal", model.TableColumn{Name: "total", Type: "decimal"}, "(`total` IS NOT NULL)"},
		{"datetime", model.TableColumn{Name: "created_at", Type: "datetime"}, "(`created_at` IS NOT NULL)"},
		{"json", model.TableColumn{Name: "payload", Type: "json"}, "(`payload` IS NOT NULL AND JSON_LENGTH(`payload`) > 0)"},
		{"blob", model.TableColumn{Name: "attachment", Type: "blob"}, "(`attachment` IS NOT NULL AND OCTET_LENGTH(`attachment`) > 0)"},
	}
	for _, tc := range cases {
		if got := service.ColumnDataExpr(tc.col); got != tc.want {
			t.Errorf("%s: got %q, want %q", tc.name, got, tc.want)
		}
	}
}
