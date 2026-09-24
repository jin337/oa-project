package service

// auditFields 审计字段：由后端内部维护，不返回给前端。
// 这是审计字段的唯一事实来源：响应剥离（stripAuditFields）、动态数据写入校验（appSystemCols）、
// 字段 DDL 校验（appFieldSystemCols）均由此派生，避免多处硬编码后漂移。
// 注意不含 id / parent_id——主键与子表关联列前端仍需使用。
var auditFields = []string{"deleted_at", "created_at", "created_by", "updated_at", "updated_by"}

// stripAuditFields 剥离 map 中的审计字段（原地修改；row 为 nil 时 delete 为空操作，安全）。
// 用于动态业务数据（主表/子表行）返回前端前统一清理后端内部字段。
func stripAuditFields(row map[string]interface{}) {
	for _, f := range auditFields {
		delete(row, f)
	}
}

// systemCols 构造「系统列」集合：审计字段 + extra（如 id / parent_id）。
// 各处的系统列名单统一由此派生，保证字段集合只有一份定义。
func systemCols(extra ...string) map[string]bool {
	set := make(map[string]bool, len(auditFields)+len(extra))
	for _, f := range auditFields {
		set[f] = true
	}
	for _, f := range extra {
		set[f] = true
	}
	return set
}
