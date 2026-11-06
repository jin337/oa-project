package service

import (
	"fmt"
	"strconv"
	"strings"
	"time"

	"back-end/internal/database"
	"back-end/internal/model"

	"github.com/xuri/excelize/v2"
)

// 动态数据列表（state=list）全量导出为 xlsx。
//
// 设计：前端只传 code + 搜索筛选（与列表页同一 /by-code 口径），后端自行取数、拼列、渲染。
//   - 列 = 主表全部业务元素（table_key=主表名，不受 visibility.list 限制），即「全字段」；
//   - 行 = ApplicationDataList（已按角色数据权限过滤 + 动态筛选），一次取到导出上限；
//   - 单元格值按元素类型还原展示口径：
//     · json 选项型（select/radio/checkbox）→ data_source.options 做 value→label；
//     · 时间型（datepicker/datetime/time 等）→ 统一格式化（库中 parseTime 后为 time.Time）；
//     · api 数据源型（userselect 等，value→label 需回查/仅存在于前端）→ 输出存储原值（多为 id），
//     此类映射成本高且非本次诉求，保持列可读即可；
//     · 其它 → 直接输出（nil/空 → 空串）。
// 好处：导出链路只一次后端取数，消除前端「先 by-code 拿数据、再回传矩阵」的重复调用与体积浪费。

// applicationExportMaxRows 单次导出行数上限（对齐 ApplicationDataList 的 size 归一上限）
const applicationExportMaxRows = 10000

// 选项型元素（json 数据源可静态还原 value→label）
var exportOptionElementTypes = map[string]bool{"select": true, "radio": true, "checkbox": true}

// 时间型元素（导出统一格式化为可读字符串）
var exportTimeElementTypes = map[string]bool{
	"date": true, "datepicker": true, "datetime": true, "time": true, "timepicker": true,
}

// ApplicationDataExport 按页面编码与筛选条件全量导出主表数据，返回 xlsx 字节流与建议文件名。
func ApplicationDataExport(code string, filters map[string]string, curUserID uint) ([]byte, string, error) {
	var app model.Application
	if err := database.DB.Where("code = ?", code).First(&app).Error; err != nil {
		return nil, "", fmt.Errorf("页面配置不存在")
	}
	ApplyActiveVersionSnapshot(&app)

	// 导出列：主表全部业务元素（排除子表列与无字段名的装饰元素）
	var elements []model.ApplicationElement
	if err := database.DB.Where("app_id = ?", app.ID).Order("id ASC").Find(&elements).Error; err != nil {
		return nil, "", err
	}
	cols := make([]model.ApplicationElement, 0, len(elements))
	for _, el := range elements {
		if el.TableKey == app.TableName && el.FieldKey != "" {
			cols = append(cols, el)
		}
	}
	if len(cols) == 0 {
		return nil, "", fmt.Errorf("该页面未配置可导出字段")
	}

	// 取数：复用列表查询（数据权限过滤 + 动态筛选），一次取到上限
	list, total, err := ApplicationDataList(app.ID, curUserID, &model.ApplicationDataListReq{
		BaseListReq: model.BaseListReq{Page: 1, Size: applicationExportMaxRows},
		TableName:   app.TableName,
		Filters:     filters,
	})
	if err != nil {
		return nil, "", err
	}
	if len(list) == 0 {
		return nil, "", fmt.Errorf("当前筛选条件下没有可导出的数据")
	}
	truncated := total > int64(len(list))

	// 预构建每列的 value→label 映射（仅 json 选项型）
	labelMaps := make([]map[string]string, len(cols))
	for i, el := range cols {
		labelMaps[i] = buildOptionLabelMap(el.DataSource)
	}

	// 渲染 xlsx
	f := excelize.NewFile()
	defer func() { _ = f.Close() }()
	const sheet = "Sheet1"

	headers := make([]string, len(cols))
	for i, el := range cols {
		headers[i] = el.Label
		if headers[i] == "" {
			headers[i] = el.FieldKey
		}
	}
	if err := f.SetSheetRow(sheet, "A1", &headers); err != nil {
		return nil, "", fmt.Errorf("写表头: %w", err)
	}
	if style, err := f.NewStyle(&excelize.Style{
		Font: &excelize.Font{Bold: true},
		Fill: excelize.Fill{Type: "pattern", Color: []string{"E8F3FF"}, Pattern: 1},
	}); err == nil {
		_ = f.SetRowStyle(sheet, 1, 1, style)
	}

	for r, row := range list {
		cells := make([]string, len(cols))
		for c, el := range cols {
			cells[c] = exportCellText(el, row[el.FieldKey], labelMaps[c])
		}
		if err := f.SetSheetRow(sheet, fmt.Sprintf("A%d", r+2), &cells); err != nil {
			return nil, "", fmt.Errorf("写第%d行: %w", r+2, err)
		}
	}

	for idx, header := range headers {
		col := excelColName(idx)
		width := float64(len([]rune(header))*2 + 4)
		if width < 12 {
			width = 12
		}
		if width > 50 {
			width = 50
		}
		_ = f.SetColWidth(sheet, col, col, width)
	}
	_ = f.SetPanes(sheet, &excelize.Panes{Freeze: true, YSplit: 1, TopLeftCell: "A2", ActivePane: "bottomLeft"})

	buf, err := f.WriteToBuffer()
	if err != nil {
		return nil, "", err
	}

	filename := fmt.Sprintf("%s_%s", app.Name, time.Now().Format("20060102150405"))
	if truncated {
		filename += fmt.Sprintf("_前%d条_共%d条", len(list), total)
	}
	return buf.Bytes(), filename + ".xlsx", nil
}

// buildOptionLabelMap 从 json 数据源选项构建 value→label 映射（非 json 数据源返回 nil）
func buildOptionLabelMap(ds map[string]interface{}) map[string]string {
	if ds == nil {
		return nil
	}
	if t, _ := ds["type"].(string); t != "json" {
		return nil
	}
	raw, ok := ds["options"].([]interface{})
	if !ok || len(raw) == 0 {
		return nil
	}
	m := map[string]string{}
	for _, o := range raw {
		opt, ok := o.(map[string]interface{})
		if !ok {
			continue
		}
		val, vok := opt["value"]
		if !vok {
			continue
		}
		label, _ := opt["label"].(string)
		m[normalizeExportScalar(val)] = label
	}
	if len(m) == 0 {
		return nil
	}
	return m
}

// exportCellText 按元素类型还原单元格展示文本
func exportCellText(el model.ApplicationElement, v interface{}, labelMap map[string]string) string {
	if v == nil {
		return ""
	}
	// 时间型：Go parseTime 后多为 time.Time，统一格式化
	if exportTimeElementTypes[el.ElementType] {
		return formatExportTime(v)
	}
	// 选项型：json 数据源可还原 label（checkbox 可能为逗号/数组多值）
	if exportOptionElementTypes[el.ElementType] && labelMap != nil {
		switch val := v.(type) {
		case []interface{}:
			parts := make([]string, 0, len(val))
			for _, x := range val {
				parts = append(parts, mapExportLabel(normalizeExportScalar(x), labelMap))
			}
			return strings.Join(parts, ", ")
		default:
			s := normalizeExportScalar(v)
			// 逗号分隔多值（checkbox 存储形态）
			if strings.Contains(s, ",") {
				parts := strings.Split(s, ",")
				out := make([]string, 0, len(parts))
				for _, p := range parts {
					out = append(out, mapExportLabel(strings.TrimSpace(p), labelMap))
				}
				return strings.Join(out, ", ")
			}
			return mapExportLabel(s, labelMap)
		}
	}
	// 其余（含 api 数据源选择型、文本、数字）：直接输出
	return normalizeExportScalar(v)
}

// mapExportLabel 命中 label 则用 label，否则原值
func mapExportLabel(value string, labelMap map[string]string) string {
	if lb, ok := labelMap[value]; ok {
		return lb
	}
	return value
}

// formatExportTime 时间值格式化：time.Time / 字符串 / 其它，尽量输出可读日期
func formatExportTime(v interface{}) string {
	switch t := v.(type) {
	case time.Time:
		return t.Format("2006-01-02 15:04:05")
	case string:
		return t
	default:
		return normalizeExportScalar(v)
	}
}

// normalizeExportScalar 标量统一转字符串；复杂结构转 JSON，避免 [object Object]/map[] 污染单元格
func normalizeExportScalar(v interface{}) string {
	switch t := v.(type) {
	case nil:
		return ""
	case string:
		return t
	case bool:
		if t {
			return "是"
		}
		return "否"
	case float64:
		// 数字列避免科学计数/多余小数：整数值去掉 .0
		if t == float64(int64(t)) {
			return strconv.FormatInt(int64(t), 10)
		}
		return fmt.Sprintf("%v", t)
	case int64, int, int32:
		return fmt.Sprintf("%v", t)
	case []byte:
		return string(t)
	default:
		return fmt.Sprintf("%v", t)
	}
}

// excelColName 0-based 列号 → Excel 列名（0→A，25→Z，26→AA）
func excelColName(idx int) string {
	name := ""
	n := idx + 1
	for n > 0 {
		n--
		name = string(rune('A'+n%26)) + name
		n /= 26
	}
	return name
}
