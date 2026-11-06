package idgen

// 导出桥接层：仅供 internal/test 跨包访问本包的白盒测试目标。
// 与 internal/service/exportbridge.go 同一模式：internal 路径下外部模块无法 import，
// 这些导出名仅在本项目内可见，不构成对外 API。

const (
	// SegLen 段2/段3 字符数（真值 segLen）
	SegLen = segLen
	// Alphabet Crockford base32 小写字符集（真值 alphabet）
	Alphabet = alphabet
)

// EncodeMillis 段2 确定性编码函数（测试直接验证编码表与回绕契约）
var EncodeMillis = encodeMillis
