package service

import "testing"

// TestStripAuditFields 审计字段必须全部剥离，业务字段与主键 / 关联列保留。
func TestStripAuditFields(t *testing.T) {
	row := map[string]interface{}{
		"id":         1,
		"parent_id":  2,
		"name":       "测试",
		"deleted_at": nil,
		"created_at": "2026-01-01 00:00:00",
		"created_by": 1,
		"updated_at": "2026-01-02 00:00:00",
		"updated_by": 1,
	}
	stripAuditFields(row)

	for _, f := range auditFields {
		if _, ok := row[f]; ok {
			t.Errorf("审计字段 %q 未被剥离", f)
		}
	}
	for _, keep := range []string{"id", "parent_id", "name"} {
		if _, ok := row[keep]; !ok {
			t.Errorf("业务字段 %q 不应被剥离", keep)
		}
	}
}

// TestStripAuditFieldsNilSafe nil map 上 delete 为空操作，不应 panic。
func TestStripAuditFieldsNilSafe(t *testing.T) {
	defer func() {
		if r := recover(); r != nil {
			t.Fatalf("stripAuditFields(nil) 不应 panic: %v", r)
		}
	}()
	stripAuditFields(nil)
}

// TestSystemCols 系统列集合 = 审计字段 + 额外列，且只有一份定义来源。
func TestSystemCols(t *testing.T) {
	set := systemCols("id", "parent_id")
	for _, f := range auditFields {
		if !set[f] {
			t.Errorf("systemCols 缺少审计字段 %q", f)
		}
	}
	if !set["id"] || !set["parent_id"] {
		t.Error("systemCols 应包含传入的额外列 id / parent_id")
	}
	if set["name"] {
		t.Error("systemCols 不应包含未传入的业务字段")
	}
	if len(systemCols()) != len(auditFields) {
		t.Errorf("systemCols() 大小 = %d, 期望 %d", len(systemCols()), len(auditFields))
	}
}
