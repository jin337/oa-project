package test

import (
	"strings"
	"testing"

	"back-end/internal/model"
	"back-end/internal/service"
)

// 数据导出（后端全量导出）纯逻辑白盒测试：
// ApplicationDataExport 主流程依赖数据库，此处覆盖其可独立验证的渲染函数——
// 列名进制、标量字符串化、json 选项映射构建、单元格值按类型还原。

// TestExcelColNameSequence 列名进制：A..Z、AA..AB，且下标连续不错位
func TestExcelColNameSequence(t *testing.T) {
	cases := []struct {
		idx  int
		want string
	}{
		{0, "A"}, {1, "B"}, {25, "Z"}, {26, "AA"}, {27, "AB"}, {51, "AZ"}, {52, "BA"},
	}
	for _, c := range cases {
		if got := service.ExcelColName(c.idx); got != c.want {
			t.Errorf("ExcelColName(%d) = %q, 期望 %q", c.idx, got, c.want)
		}
	}
	// 第 30 列（idx=29）应为 AD：宽表导出列宽/写入串行防线
	if got := service.ExcelColName(29); got != "AD" {
		t.Errorf("ExcelColName(29) = %q, 期望 AD", got)
	}
}

// TestNormalizeExportScalar 标量字符串化：整数去 .0、布尔中文化、nil 空串、复杂结构可读
func TestNormalizeExportScalar(t *testing.T) {
	if got := service.NormalizeExportScalar(float64(100)); got != "100" {
		t.Errorf("整数 float 应去 .0，实际: %q", got)
	}
	if got := service.NormalizeExportScalar(float64(99.5)); got != "99.5" {
		t.Errorf("小数应保留，实际: %q", got)
	}
	if got := service.NormalizeExportScalar(true); got != "是" {
		t.Errorf("true 应为「是」，实际: %q", got)
	}
	if got := service.NormalizeExportScalar(nil); got != "" {
		t.Errorf("nil 应为空串，实际: %q", got)
	}
	if got := service.NormalizeExportScalar("abc"); got != "abc" {
		t.Errorf("字符串应原样，实际: %q", got)
	}
	// 对象/数组等复杂结构：输出非空且不含 Go 内部 map 形态，避免污染单元格
	if got := service.NormalizeExportScalar([]interface{}{map[string]interface{}{"a": float64(1)}}); got == "" || strings.HasPrefix(got, "map[") {
		t.Errorf("复杂结构应可读输出，实际: %q", got)
	}
}

// TestBuildOptionLabelMap json 数据源选项 → value→label 映射；非 json / 缺 options 返回 nil
func TestBuildOptionLabelMap(t *testing.T) {
	ds := map[string]interface{}{
		"type": "json",
		"options": []interface{}{
			map[string]interface{}{"label": "同意", "value": "1"},
			map[string]interface{}{"label": "拒绝", "value": float64(2)},
		},
	}
	m := service.BuildOptionLabelMap(ds)
	if len(m) != 2 || m["1"] != "同意" || m["2"] != "拒绝" {
		t.Fatalf("映射应含 1→同意、2→拒绝（数字 value 转字符串），实际: %v", m)
	}
	if service.BuildOptionLabelMap(nil) != nil {
		t.Error("nil 数据源应返回 nil")
	}
	if service.BuildOptionLabelMap(map[string]interface{}{"type": "api", "url": "x"}) != nil {
		t.Error("api 数据源应返回 nil（由调用方输出原值）")
	}
	if service.BuildOptionLabelMap(map[string]interface{}{"type": "json"}) != nil {
		t.Error("json 但无选项应返回 nil")
	}
}

// TestExportCellTextOptionMapping 选项型元素（radio/select/checkbox）导出为 label；无映射时回退原值
func TestExportCellTextOptionMapping(t *testing.T) {
	labelMap := map[string]string{"1": "同意", "2": "拒绝"}
	radio := model.ApplicationElement{ElementType: "radio", FieldKey: "result"}
	if got := service.ExportCellText(radio, "1", labelMap); got != "同意" {
		t.Errorf("radio 单值应映射 label，实际: %q", got)
	}
	if got := service.ExportCellText(radio, "9", labelMap); got != "9" {
		t.Errorf("未命中选项应输出原值，实际: %q", got)
	}
	// checkbox 数组多值
	check := model.ApplicationElement{ElementType: "checkbox", FieldKey: "tags"}
	if got := service.ExportCellText(check, []interface{}{"1", float64(2)}, labelMap); got != "同意, 拒绝" {
		t.Errorf("checkbox 数组应逐项映射并以逗号连接，实际: %q", got)
	}
	// checkbox 逗号分隔字符串形态
	if got := service.ExportCellText(check, "1,2", labelMap); got != "同意, 拒绝" {
		t.Errorf("checkbox 逗号串应拆分映射，实际: %q", got)
	}
	// 无映射（api 数据源）时原样输出存储值
	if got := service.ExportCellText(radio, "1", nil); got != "1" {
		t.Errorf("无映射应输出原值，实际: %q", got)
	}
	// nil 值输出空串而非 "-"（界面占位不写入 Excel）
	if got := service.ExportCellText(radio, nil, labelMap); got != "" {
		t.Errorf("nil 应为空串，实际: %q", got)
	}
}

// TestExportCellTextTimeAndPlain 时间型格式化、普通文本原样输出
func TestExportCellTextTimeAndPlain(t *testing.T) {
	dt := model.ApplicationElement{ElementType: "datetime", FieldKey: "apply_time"}
	if got := service.ExportCellText(dt, "2026-11-06 10:00:00", nil); got != "2026-11-06 10:00:00" {
		t.Errorf("时间字符串应原样，实际: %q", got)
	}
	input := model.ApplicationElement{ElementType: "input", FieldKey: "reason"}
	if got := service.ExportCellText(input, "差旅报销", nil); got != "差旅报销" {
		t.Errorf("文本应原样，实际: %q", got)
	}
	num := model.ApplicationElement{ElementType: "number", FieldKey: "amount"}
	if got := service.ExportCellText(num, float64(1200), nil); got != "1200" {
		t.Errorf("数字应去 .0，实际: %q", got)
	}
}
