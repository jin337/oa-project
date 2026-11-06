package service

// 导出桥接层：仅供 internal/test 跨包访问本包的白盒测试目标。
//
// Go 规定不同包无法访问未导出标识符，而 internal/test 下的测试需要直接验证
// 本包私有的函数/类型/常量/变量。此处用「类型别名 + 函数别名(var) + 常量/变量别名」
// 统一暴露导出名，避免把生产代码里的 flowNode（5 个文件引用）等私有符号整体重命名，
// 保持实现零改动、回归面最小。
//
// 可访问性说明：back-end 是 internal/ 下的模块路径，外部模块无法 import，
// 这些导出名仅在本项目内可见，不构成对外 API。
//
// 命名约定：与测试中的调用一一对应，新增白盒测试需要暴露新私有符号时，在此按同样方式补一行。

// 类型别名（字段均为导出，外部包可经别名直接构造/读取）
type (
	FlowNode   = flowNode
	FlowMember = flowMember
)

// 常量别名（转交链状态，与 delegatedChainStatus 返回值配套）
const (
	DelegatedChainInvalid  = delegatedChainInvalid
	DelegatedChainPending  = delegatedChainPending
	DelegatedChainApproved = delegatedChainApproved
)

// 变量别名（审计字段清单；测试用于断言剥离完整性与来源唯一）
var AuditFields = auditFields

// 函数别名（var 持有原函数值，调用签名与原函数一致；
// 参数涉及 FlowNode 等别名类型，外部传入 service.FlowNode 即等价传入 flowNode）
var (
	MergeForwardParams            = mergeForwardParams
	ParseApprovalMode             = parseApprovalMode
	PostLastNodeIdx               = postLastNodeIdx
	AutoApprovedComment           = autoApprovedComment
	IsOrdinaryApprovedTask        = isOrdinaryApprovedTask
	IsDerivedTask                 = isDerivedTask
	ReturnCandidateNodeAllowed    = returnCandidateNodeAllowed
	TaskApprovedAfterReturnTarget = taskApprovedAfterReturnTarget
	DelegatedChainStatus          = delegatedChainStatus
	ParseWithdrawWindowDuration   = parseWithdrawWindowDuration
	BuildDeptTree                 = buildDeptTree
	StripAuditFields              = stripAuditFields
	SystemCols                    = systemCols
)

// 函数别名（动态数据导出渲染的纯逻辑：列名进制、标量字符串化、单元格值还原、工作表名处理）
var (
	ExcelColName          = excelColName
	NormalizeExportScalar = normalizeExportScalar
	ExportCellText        = exportCellText
	BuildOptionLabelMap   = buildOptionLabelMap
	SanitizeSheetName     = sanitizeSheetName
	UniqueSheetName       = uniqueSheetName
)
