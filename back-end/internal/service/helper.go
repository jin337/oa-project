package service

// auditFields 审计字段：由后端内部维护，不返回给前端。
// 适用于动态业务数据（map[string]interface{}）的字段剥离。
// 注意不含 id / parent_id——主键与子表关联列前端仍需使用。
var auditFields = []string{"deleted_at", "created_at", "created_by", "updated_at", "updated_by"}

// stripAuditFields 剥离 map 中的审计字段（原地修改；row 为 nil 时 delete 为空操作，安全）。
// 用于动态业务数据（主表/子表行）返回前端前统一清理后端内部字段。
func stripAuditFields(row map[string]interface{}) {
	for _, f := range auditFields {
		delete(row, f)
	}
}
