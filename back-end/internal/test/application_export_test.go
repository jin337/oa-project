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

// TestSanitizeSheetName 工作表名清洗：去非法字符、限长 31 字符（Excel 硬限制）
func TestSanitizeSheetName(t *testing.T) {
	if got := service.SanitizeSheetName("a/b\\c:d*e?f[g]h"); got != "abcdefgh" {
		t.Errorf("非法字符应全部剔除，实际: %q", got)
	}
	long := strings.Repeat("列", 40)
	if got := service.SanitizeSheetName(long); len([]rune(got)) != 31 {
		t.Errorf("超 31 字符应截断为 31，实际长度: %d", len([]rune(got)))
	}
	if got := service.SanitizeSheetName("'费用明细 '"); got != "费用明细" {
		t.Errorf("应一次性剔除首尾空格与单引号，实际: %q", got)
	}
}

// TestUniqueSheetName 重名工作表追加序号且不越界，集合内不产生重复
func TestUniqueSheetName(t *testing.T) {
	used := map[string]bool{}
	first := service.UniqueSheetName(used, "差旅费报销子表")
	second := service.UniqueSheetName(used, "差旅费报销子表")
	if first != "差旅费报销子表" {
		t.Errorf("首个名称应原样使用，实际: %q", first)
	}
	if second != "差旅费报销子表_2" {
		t.Errorf("重名应追加 _2，实际: %q", second)
	}
	third := service.UniqueSheetName(used, "差旅费报销子表")
	if third == first || third == second {
		t.Errorf("第三个名称必须与前两个不同，实际: %q", third)
	}
	// 超长基础名重名时，追加后缀后仍需满足 31 字符限制
	used2 := map[string]bool{}
	base := strings.Repeat("表", 31)
	service.UniqueSheetName(used2, base)
	dup := service.UniqueSheetName(used2, base)
	if len([]rune(dup)) > 31 {
		t.Errorf("去重后的工作表名不得超过 31 字符，实际长度: %d", len([]rune(dup)))
	}
	if dup == base {
		t.Error("重名未产生差异化名称")
	}
	// 空名回退默认，不应返回空字符串（空名会触发 excelize 报错）
	used3 := map[string]bool{}
	if got := service.UniqueSheetName(used3, ""); got == "" {
		t.Error("空基础名应回退默认名称")
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
