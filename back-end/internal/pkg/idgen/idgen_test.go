package idgen

import (
	"strings"
	"testing"
)

// TestEncodeMillis 段2 的确定性编码：参考值取自设计规范（app_65vhh0h9_xxx）。
func TestEncodeMillis(t *testing.T) {
	cases := []struct {
		ms   int64
		want string
	}{
		{0, "00000000"},
		{1, "00000001"},
		{31, "0000000z"},
		{32, "00000010"},
		{212451492393, "65vhh0h9"},
		{-1, "00000000"}, // 负值按 0 处理
	}
	for _, c := range cases {
		if got := encodeMillis(c.ms); got != c.want {
			t.Errorf("encodeMillis(%d) = %q, 期望 %q", c.ms, got, c.want)
		}
	}
}

// TestEncodeMillisFixedLength 定长 8 字符，且只取低 40bit（溢出自然回绕）。
func TestEncodeMillisFixedLength(t *testing.T) {
	for _, ms := range []int64{0, 1, 1 << 39, 1 << 40, 1<<40 + 12345} {
		if got := encodeMillis(ms); len(got) != segLen {
			t.Errorf("encodeMillis(%d) 长度 = %d, 期望 %d", ms, len(got), segLen)
		}
	}
	if got := encodeMillis(1 << 40); got != "00000000" {
		t.Errorf("encodeMillis(1<<40) = %q, 期望回绕为 %q", got, "00000000")
	}
}

// TestEncodeMillisOrdering 字典序与时间序一致（同一毫秒相同），可直接排序。
func TestEncodeMillisOrdering(t *testing.T) {
	msList := []int64{0, 1, 31, 32, 1000, 212451492393, 1 << 39}
	prev := ""
	for _, ms := range msList {
		cur := encodeMillis(ms)
		if prev != "" && prev >= cur {
			t.Errorf("encodeMillis 字典序与时间序不一致: %q >= %q", prev, cur)
		}
		prev = cur
	}
	if encodeMillis(1000) != encodeMillis(1000) {
		t.Error("同一毫秒应得到相同编码")
	}
}

// TestNewFormat 编码结构：prefix_8字符_8字符，字符集为 Crockford base32 小写。
func TestNewFormat(t *testing.T) {
	code := New("app")
	parts := strings.Split(code, "_")
	if len(parts) != 3 {
		t.Fatalf("编码 %q 应为 3 段（下划线分隔）", code)
	}
	if parts[0] != "app" {
		t.Errorf("段1 = %q, 期望 %q", parts[0], "app")
	}
	for i, seg := range parts[1:] {
		if len(seg) != segLen {
			t.Errorf("段%d 长度 = %d, 期望 %d", i+2, len(seg), segLen)
		}
		for _, ch := range seg {
			if !strings.ContainsRune(alphabet, ch) {
				t.Errorf("段%d 含非法字符 %q（编码 %q）", i+2, ch, code)
			}
		}
	}
}
