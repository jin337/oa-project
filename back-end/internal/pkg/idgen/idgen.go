// Package idgen 统一实体编码生成器。
//
// 编码结构：<段1>_<段2>_<段3>，分隔符下划线固定出现 2 次、位置固定
//
//	段1  实体类型前缀，全小写字母，如应用（页面配置）为 app
//	段2  40bit 毫秒时间戳（自定义纪元 2020-01-01T00:00:00Z）→ Crockford base32 定长 8 字符
//	     同一毫秒内完全相同，且字典序与时间序一致，可直接排序
//	段3  40bit crypto/rand 密码学随机 → Crockford base32 定长 8 字符
//
// 字符集：Crockford base32 小写 0123456789abcdefghjkmnpqrstvwxyz（天然排除 i/l/o/u）
// 大小写：全小写，比较时不做大小写折叠
// 不可变：生成后永不修改，改名、克隆、跨环境都不动它
//
// 段2 位宽 40bit 覆盖 2^40 毫秒 ≈ 34.8 年，自 2020-01-01 起可用到 2054-11。
package idgen

import (
	cryptorand "crypto/rand"
	"time"
)

const (
	// EpochMillis 段2 时间戳的自定义纪元：2020-01-01T00:00:00Z
	EpochMillis int64 = 1577836800000

	// segLen 段2、段3 的字符数（40bit ÷ 5bit = 8）
	segLen = 8

	// alphabet Crockford base32 小写字符集，每字符承载 5 bit
	alphabet = "0123456789abcdefghjkmnpqrstvwxyz"
)

// New 生成实体编码：prefix_时间戳段_随机段
// prefix 为实体类型前缀（全小写字母），应用传 PrefixApp
func New(prefix string) string {
	return prefix + "_" + encodeMillis(time.Now().UnixMilli()-EpochMillis) + "_" + randomSeg()
}

// encodeMillis 把毫秒时间戳编码为定长 8 位 Crockford base32 串。
// 只取低 40bit（超出部分自然回绕），保证长度固定、字典序与时间序一致。
func encodeMillis(ms int64) string {
	if ms < 0 {
		ms = 0
	}
	buf := make([]byte, segLen)
	for i := segLen - 1; i >= 0; i-- {
		buf[i] = alphabet[ms&0x1f]
		ms >>= 5
	}
	return string(buf)
}

// randomSeg 用 crypto/rand 生成定长 8 位 Crockford base32 随机串。
func randomSeg() string {
	buf := make([]byte, segLen)
	if _, err := cryptorand.Read(buf); err != nil {
		// crypto/rand 不可用（实际不会发生）时退化为纳秒时间熵，避免 panic
		seed := time.Now().UnixNano()
		for i := range buf {
			buf[i] = byte(seed >> uint((i%8)*8))
		}
	}
	// 32 整除 256，&0x1f 为无偏映射
	for i := range buf {
		buf[i] = alphabet[buf[i]&0x1f]
	}
	return string(buf)
}
