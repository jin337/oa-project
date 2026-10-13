package service

import "testing"

// TestMergeForwardParams 验证「转发参数模板只作默认值」的合并规则：
// 模板铺底、调用方同名键覆盖，模板中调用方未提供的键保留。
func TestMergeForwardParams(t *testing.T) {
	cases := []struct {
		name string
		tpl  map[string]interface{}
		form map[string]interface{}
		want map[string]interface{}
	}{
		{
			name: "模板为空时原样透传调用方参数",
			tpl:  map[string]interface{}{},
			form: map[string]interface{}{"type": "number_to_upper", "value": 100},
			want: map[string]interface{}{"type": "number_to_upper", "value": 100},
		},
		{
			name: "调用方覆盖模板同名键",
			tpl:  map[string]interface{}{"type": "calc", "value": "(100+2)*3 % 7"},
			form: map[string]interface{}{"type": "number_to_upper", "value": 100},
			want: map[string]interface{}{"type": "number_to_upper", "value": 100},
		},
		{
			name: "模板独有的键保留（默认值生效）",
			tpl:  map[string]interface{}{"type": "number_to_upper", "value": 100000, "app_id": 9},
			form: map[string]interface{}{"value": 5},
			want: map[string]interface{}{"type": "number_to_upper", "value": 5, "app_id": 9},
		},
		{
			name: "调用方为空时全部用模板",
			tpl:  map[string]interface{}{"type": "calc", "value": "(100+2)*3 % 7"},
			form: map[string]interface{}{},
			want: map[string]interface{}{"type": "calc", "value": "(100+2)*3 % 7"},
		},
		{
			name: "两边都为空",
			tpl:  map[string]interface{}{},
			form: map[string]interface{}{},
			want: map[string]interface{}{},
		},
		{
			name: "调用方传 nil 也按覆盖处理",
			tpl:  map[string]interface{}{"value": 100},
			form: map[string]interface{}{"value": nil},
			want: map[string]interface{}{"value": nil},
		},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got := mergeForwardParams(c.tpl, c.form)
			if len(got) != len(c.want) {
				t.Fatalf("mergeForwardParams(%v, %v) = %v, 期望 %v", c.tpl, c.form, got, c.want)
			}
			for k, want := range c.want {
				if gv, ok := got[k]; !ok || gv != want {
					t.Errorf("键 %s = %v, 期望 %v", k, gv, want)
				}
			}
		})
	}
}

// TestMergeForwardParamsDoesNotMutateInputs 合并不得修改入参（模板 map 会被复用于多次调用）。
func TestMergeForwardParamsDoesNotMutateInputs(t *testing.T) {
	tpl := map[string]interface{}{"type": "calc", "value": 1}
	form := map[string]interface{}{"value": 2}
	out := mergeForwardParams(tpl, form)
	out["type"] = "changed"
	out["extra"] = 1
	if tpl["type"] != "calc" || len(tpl) != 2 {
		t.Errorf("模板入参被修改: %v", tpl)
	}
	if len(form) != 1 {
		t.Errorf("调用方入参被修改: %v", form)
	}
}
