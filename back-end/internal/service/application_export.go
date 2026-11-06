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

// 动态数据列表（state=list）全量导出为多 Sheet xlsx：
//   - Sheet 名一律使用数据库物理表名（主表表名 + 各子表表名），与库表一一对应，便于定位数据；
//     物理表名仅含字母数字下划线，天然合法，超长仍按 Excel 31 字符截断、重名追加序号。
//   - 主表 Sheet：行为筛选后的主表数据，列为主表全部业务元素；
//   - 子表 Sheet：SubTableName 逗号分隔的每张子表各占一个 Sheet，
//     列取该子表全部业务元素，行按 parent_id 关联本次导出的主表行。
//
// 单元格值统一按元素类型还原展示口径：
//   - json 选项型（select/radio/checkbox）→ data_source.options 做 value→label；
//   - 时间型（datepicker/datetime/time 等）→ 统一格式化（库中 parseTime 后为 time.Time）；
//   - api 数据源型（userselect 等，value→label 需回查）→ 输出存储原值（多为 id）；
//   - 其它 → 直接输出（nil/空 → 空串）。
//
// 每个子表 Sheet 首列为「所属主表单号」（主表存在 bill_no 时）或「所属主表ID」，
// 因为多张单据的子表行汇总在同一 Sheet 内，缺少归属列将无法对应回主表记录。

const (
	// applicationExportMaxRows 主表单次导出行数上限（对齐 ApplicationDataList 的 size 归一上限）
	applicationExportMaxRows = 10000
	// applicationExportSubMaxRows 单个子表单次导出行数上限（子表与主表为 1:N，行数可能远大于主表）
	applicationExportSubMaxRows = 50000
	// exportSubIDBatchSize 子表按 parent_id 批量查询的每批主表 id 数
	exportSubIDBatchSize = 500
)

// 选项型元素（json 数据源可静态还原 value→label）
var exportOptionElementTypes = map[string]bool{"select": true, "radio": true, "checkbox": true}

// 时间型元素（导出统一格式化为可读字符串）
var exportTimeElementTypes = map[string]bool{
	"date": true, "datepicker": true, "datetime": true, "time": true, "timepicker": true,
}

// exportColumn 一列的标题与取值方式（主表/子表列、归属主表列均归一为该结构）
type exportColumn struct {
	Title  string
	Render func(row map[string]interface{}) string
}

// ApplicationDataExport 按页面编码与筛选条件全量导出主表与各子表数据，返回 xlsx 字节流与建议文件名。
func ApplicationDataExport(code string, filters map[string]string, curUserID uint) ([]byte, string, error) {
	var app model.Application
	if err := database.DB.Where("code = ?", code).First(&app).Error; err != nil {
		return nil, "", fmt.Errorf("页面配置不存在")
	}
	ApplyActiveVersionSnapshot(&app)

	var elements []model.ApplicationElement
	if err := database.DB.Where("app_id = ?", app.ID).Order("id ASC").Find(&elements).Error; err != nil {
		return nil, "", err
	}
	// 列定义：按 table_key 归组，排除无字段名的装饰元素（divider 等）
	colsOf := func(tableKey string) []exportColumn {
		cols := make([]exportColumn, 0, len(elements))
		for _, el := range elements {
			if el.TableKey != tableKey || el.FieldKey == "" {
				continue
			}
			labelMap := buildOptionLabelMap(el.DataSource)
			field := el.FieldKey
			title := el.Label
			if title == "" {
				title = field
			}
			cols = append(cols, exportColumn{
				Title:  title,
				Render: func(row map[string]interface{}) string { return exportCellText(el, row[field], labelMap) },
			})
		}
		return cols
	}

	mainCols := colsOf(app.TableName)
	if len(mainCols) == 0 {
		return nil, "", fmt.Errorf("该页面未配置可导出字段")
	}

	// 主表取数：复用列表查询（数据权限过滤 + 动态筛选），一次取到上限
	mainRows, total, err := ApplicationDataList(app.ID, curUserID, &model.ApplicationDataListReq{
		BaseListReq: model.BaseListReq{Page: 1, Size: applicationExportMaxRows},
		TableName:   app.TableName,
		Filters:     filters,
	})
	if err != nil {
		return nil, "", err
	}
	if len(mainRows) == 0 {
		return nil, "", fmt.Errorf("当前筛选条件下没有可导出的数据")
	}
	mainTruncated := total > int64(len(mainRows))

	// 主表 id → 展示标识（单号优先），供子表 Sheet 归属列回填
	ownerKeyByID := make(map[string]string, len(mainRows))
	mainIDs := make([]string, 0, len(mainRows))
	billNoRows := 0
	for _, row := range mainRows {
		id := normalizeExportScalar(row["id"])
		if id == "" {
			continue
		}
		mainIDs = append(mainIDs, id)
		if billNo := normalizeExportScalar(row["bill_no"]); billNo != "" {
			ownerKeyByID[id] = billNo
			billNoRows++
		} else {
			ownerKeyByID[id] = id
		}
	}
	// 全部主表行都有单号时，归属列展示单号（可读）；否则退回主表 id，避免部分行只能看到 id 却标为「单号」
	ownerTitle := "所属主表ID"
	if len(mainIDs) > 0 && billNoRows == len(mainIDs) {
		ownerTitle = "所属主表单号"
	}

	// 渲染多 Sheet：工作表名一律用物理表名（与数据库表一一对应，主表/子表口径统一）
	f := excelize.NewFile()
	defer func() { _ = f.Close() }()

	used := map[string]bool{}
	mainSheet := uniqueSheetName(used, bizTableName(app.TableName))
	if err := f.SetSheetName("Sheet1", mainSheet); err != nil {
		return nil, "", fmt.Errorf("重命名主表工作表: %w", err)
	}
	if err := writeExportSheet(f, mainSheet, mainCols, mainRows); err != nil {
		return nil, "", err
	}

	subTruncated := false
	for _, sub := range splitTableNames(app.SubTableName) {
		if !isValidTableName(sub) {
			continue
		}
		subCols := colsOf(sub)
		if len(subCols) == 0 {
			continue // 子表未配置任何字段，跳过空 Sheet
		}
		rows, truncated, err := fetchSubTableRows(bizTableName(sub), mainIDs, ownerKeyByID)
		if err != nil {
			return nil, "", err
		}
		if truncated {
			subTruncated = true
		}
		ownerCol := exportColumn{
			Title:  ownerTitle,
			Render: func(row map[string]interface{}) string { return normalizeExportScalar(row["__owner"]) },
		}
		sheetName := uniqueSheetName(used, bizTableName(sub))
		if _, err := f.NewSheet(sheetName); err != nil {
			return nil, "", fmt.Errorf("创建工作表 %s: %w", sheetName, err)
		}
		if err := writeExportSheet(f, sheetName, append([]exportColumn{ownerCol}, subCols...), rows); err != nil {
			return nil, "", err
		}
	}

	filename := app.Name + "_" + time.Now().Format("20060102150405")
	if mainTruncated {
		filename += fmt.Sprintf("_主表截断前%d条共%d条", len(mainRows), total)
	}
	if subTruncated {
		filename += "_子表截断"
	}

	buf, err := f.WriteToBuffer()
	if err != nil {
		return nil, "", err
	}
	return buf.Bytes(), filename + ".xlsx", nil
}

// writeExportSheet 写入一个工作表：表头 + 数据行 + 列宽 + 冻结首行。
// rows 中的键为目标表物理列名；归属主表列（parent_id 对应单号）在取数阶段已回填为 __owner 键。
func writeExportSheet(f *excelize.File, sheet string, cols []exportColumn, rows []map[string]interface{}) error {
	headers := make([]string, len(cols))
	for i, c := range cols {
		headers[i] = c.Title
	}
	if err := f.SetSheetRow(sheet, "A1", &headers); err != nil {
		return fmt.Errorf("写表头: %w", err)
	}
	if style, err := f.NewStyle(&excelize.Style{
		Font: &excelize.Font{Bold: true},
		Fill: excelize.Fill{Type: "pattern", Color: []string{"E8F3FF"}, Pattern: 1},
	}); err == nil {
		_ = f.SetRowStyle(sheet, 1, 1, style)
	}

	for r, row := range rows {
		cells := make([]string, len(cols))
		for i, c := range cols {
			cells[i] = c.Render(row)
		}
		if err := f.SetSheetRow(sheet, fmt.Sprintf("A%d", r+2), &cells); err != nil {
			return fmt.Errorf("写第%d行: %w", r+2, err)
		}
	}

	for idx, header := range headers {
		width := float64(len([]rune(header))*2 + 4)
		if width < 12 {
			width = 12
		}
		if width > 50 {
			width = 50
		}
		_ = f.SetColWidth(sheet, excelColName(idx), excelColName(idx), width)
	}
	_ = f.SetPanes(sheet, &excelize.Panes{Freeze: true, YSplit: 1, TopLeftCell: "A2", ActivePane: "bottomLeft"})
	return nil
}

// fetchSubTableRows 按 parent_id 关联取子表行（分批查询，行数超上限则截断）。
// 每行回填 __owner（归属主表单号/ID）供首列渲染。
func fetchSubTableRows(subReal string, mainIDs []string, ownerKeyByID map[string]string) ([]map[string]interface{}, bool, error) {
	colSet, err := queryColumnSet(subReal)
	if err != nil {
		return nil, false, err
	}
	if !colSet["parent_id"] {
		return nil, false, nil // 无关联列的表不作为子表导出
	}
	table := "`" + subReal + "`"
	rows := make([]map[string]interface{}, 0, 64)
	truncated := false

	for start := 0; start < len(mainIDs); start += exportSubIDBatchSize {
		end := start + exportSubIDBatchSize
		if end > len(mainIDs) {
			end = len(mainIDs)
		}
		batch := mainIDs[start:end]
		placeholders := strings.TrimSuffix(strings.Repeat("?,", len(batch)), ",")
		args := make([]interface{}, 0, len(batch))
		for _, id := range batch {
			args = append(args, id)
		}
		sql := "SELECT * FROM " + table + " WHERE `parent_id` IN (" + placeholders + ")"
		if colSet["deleted_at"] {
			sql += " AND `deleted_at` IS NULL"
		}
		sql += " ORDER BY `id` ASC"

		var part []map[string]interface{}
		if err := database.DB.Raw(sql, args...).Scan(&part).Error; err != nil {
			return nil, false, err
		}
		for _, row := range part {
			if len(rows) >= applicationExportSubMaxRows {
				truncated = true
				break
			}
			stripAuditFields(row)
			pid := normalizeExportScalar(row["parent_id"])
			if owner, ok := ownerKeyByID[pid]; ok {
				row["__owner"] = owner
			} else {
				row["__owner"] = pid
			}
			rows = append(rows, row)
		}
		if truncated {
			break
		}
	}
	return rows, truncated, nil
}

// exportCellText 按元素类型还原单元格展示文本
func exportCellText(el model.ApplicationElement, v interface{}, labelMap map[string]string) string {
	if v == nil {
		return ""
	}
	if exportTimeElementTypes[el.ElementType] {
		return formatExportTime(v)
	}
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
	return normalizeExportScalar(v)
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

// normalizeExportScalar 标量统一转字符串；复杂结构转可读文本，避免 [object Object]/map[] 污染单元格
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
		if t == float64(int64(t)) {
			return strconv.FormatInt(int64(t), 10)
		}
		return strconv.FormatFloat(t, 'f', -1, 64)
	case int64:
		return strconv.FormatInt(t, 10)
	case uint64:
		return strconv.FormatUint(t, 10)
	case int, int32:
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

// sanitizeSheetName 清洗为合法 Excel 工作表名：
// 去除非法字符 \/:*?[]、去首尾单引号与空格、限长 31 字符（Excel 硬限制）。
func sanitizeSheetName(name string) string {
	name = strings.Map(func(r rune) rune {
		switch r {
		case '\\', '/', ':', '*', '?', '[', ']':
			return -1
		}
		return r
	}, name)
	name = strings.Trim(name, " '")
	name = strings.TrimSpace(name)
	if runes := []rune(name); len(runes) > 31 {
		name = string(runes[:31])
	}
	return name
}

// uniqueSheetName 在工作表名集合内保证唯一：冲突时追加 _2、_3 …（追加后仍受 31 字符限制）
func uniqueSheetName(used map[string]bool, base string) string {
	if base == "" {
		base = "工作表"
	}
	name := sanitizeSheetName(base)
	if name == "" {
		name = "工作表"
	}
	if !used[name] {
		used[name] = true
		return name
	}
	for i := 2; ; i++ {
		suffix := "_" + strconv.Itoa(i)
		runes := []rune(name)
		// 预留后缀长度，保证「基础名+后缀」整体不超过 31 字符
		max := 31 - len([]rune(suffix))
		if max < 1 {
			max = 1
		}
		if len(runes) < max {
			max = len(runes)
		}
		candidate := sanitizeSheetName(string(runes[:max]) + suffix)
		if !used[candidate] {
			used[candidate] = true
			return candidate
		}
	}
}
