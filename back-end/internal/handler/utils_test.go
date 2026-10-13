package handler

import (
	"math"
	"testing"
)

// TestNumberToUpper 覆盖整数分级（万/亿）、节内与节间零的处理、小数角分、负数与异常输入。
func TestNumberToUpper(t *testing.T) {
	cases := []struct {
		name string
		in   interface{}
		want string
	}{
		{"零", 0, "零元整"},
		{"个位", 1, "壹元整"},
		{"十", 10, "壹拾元整"},
		{"百", 100, "壹佰元整"},
		{"百零五", 105, "壹佰零伍元整"},
		{"千零一", 1001, "壹仟零壹元整"},
		{"千零一十", 1010, "壹仟零壹拾元整"},
		{"千一百", 1100, "壹仟壹佰元整"},
		{"万", 10000, "壹万元整"},
		{"万零一", 10001, "壹万零壹元整"},
		{"十万", 100000, "壹拾万元整"},
		{"百万", 1000000, "壹佰万元整"},
		{"百万零一", 1000001, "壹佰万零壹元整"},
		{"五千万零四", 50000004, "伍仟万零肆元整"},
		{"亿", 100000000, "壹亿元整"},
		{"亿零一", 100000001, "壹亿零壹元整"},
		{"亿零五", 100000005, "壹亿零伍元整"},
		{"亿零一万", 100010000, "壹亿零壹万元整"},
		{"全数字", 123456789, "壹亿贰仟叁佰肆拾伍万陆仟柒佰捌拾玖元整"},
		{"负数", -100, "负壹佰元整"},
		{"字符串数字", "100", "壹佰元整"},
		{"角", 0.5, "零元伍角"},
		{"一元五角", 1.5, "壹元伍角"},
		{"一元零五分", 1.05, "壹元零伍分"},
		{"零元零五分", 0.05, "零元零伍分"},
		{"一元五角五分", 1.55, "壹元伍角伍分"},
		{"负小数", -1.5, "负壹元伍角"},
		{"空字符串", "", ""},
		{"空白字符串", "  ", ""},
		{"nil 视为空值", nil, ""},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got, err := NumberToUpper(c.in)
			if err != nil {
				t.Fatalf("NumberToUpper(%v) 返回错误: %v", c.in, err)
			}
			if got != c.want {
				t.Errorf("NumberToUpper(%v) = %q, 期望 %q", c.in, got, c.want)
			}
		})
	}
}

// TestNumberToUpperInvalid 非法输入必须返回错误而不是 panic。
// 注意：空值（未传 / null / 空串 / 纯空白）不属于非法输入，见 TestNumberToUpper。
func TestNumberToUpperInvalid(t *testing.T) {
	cases := []struct {
		name string
		in   interface{}
	}{
		{"布尔值", true},
		{"非数字字符串", "abc"},
		{"超大数值", 1000000000000},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if _, err := NumberToUpper(c.in); err == nil {
				t.Errorf("NumberToUpper(%v) 期望返回错误，实际为 nil", c.in)
			}
		})
	}
}

// TestCalculateExpression 覆盖优先级、括号、取模、负数、小数、空格与各类错误。
func TestCalculateExpression(t *testing.T) {
	cases := []struct {
		name    string
		in      string
		want    float64
		wantErr bool
	}{
		{"括号乘法", "(100+2)*3", 306, false},
		{"取模", "(100+2)*3 % 7", 5, false},
		{"优先级", "1 + 2 * 3", 7, false},
		{"除法", "10 / 4", 2.5, false},
		{"小数", "2.5 * 4", 10, false},
		{"空格忽略", " 1 +  2 ", 3, false},
		{"负数开头", "-5 + 3", -2, false},
		{"负数乘数", "2 * -3", -6, false},
		{"负号括号", "-(1+2)", -3, false},
		{"负数取模", "-7 % 3", -1, false},
		{"一元正号", "1 ++ 2", 3, false},
		{"一元负号", "1 +- 2", -1, false},
		{"嵌套括号", "((1+2)*(3+4))", 21, false},
		{"除零", "10 / 0", 0, true},
		{"模零", "10 % 0", 0, true},
		{"表达式不完整", "1 +", 0, true},
		{"缺右括号", "(1+2", 0, true},
		{"多余右括号", "1+2)", 0, true},
		{"非法字符", "abc", 0, true},
		{"空表达式", "", 0, true},
		{"连续负号", "--2", 0, true},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got, err := CalculateExpression(c.in)
			if c.wantErr {
				if err == nil {
					t.Fatalf("CalculateExpression(%q) 期望返回错误，实际得到 %v", c.in, got)
				}
				return
			}
			if err != nil {
				t.Fatalf("CalculateExpression(%q) 返回错误: %v", c.in, err)
			}
			if math.Abs(got-c.want) > 1e-9 {
				t.Errorf("CalculateExpression(%q) = %v, 期望 %v", c.in, got, c.want)
			}
		})
	}
}

// TestTryDateDiff 覆盖「日期(时间) - 日期(时间)」识别、绝对时间差、负数、小数、非法日期与非日期表达式。
func TestTryDateDiff(t *testing.T) {
	cases := []struct {
		name        string
		in          string
		want        float64
		wantMatched bool
		wantErr     bool
	}{
		{"纯日期相减", "2026-10-13-2026-10-12", 1, true, false},
		{"纯日期相减带空格", "2026-10-13 - 2026-10-12", 1, true, false},
		{"反向相减为负", "2026-10-12-2026-10-13", -1, true, false},
		{"同一天为零", "2026-10-13 - 2026-10-13", 0, true, false},
		{"跨月", "2026-10-31 - 2026-10-01", 30, true, false},
		{"跨年", "2027-01-01 - 2026-12-31", 1, true, false},
		{"闰年二月", "2028-03-01 - 2028-02-28", 2, true, false},
		{"时间戳绝对时间差", "2026-10-13 12:00:00 - 2026-10-12 06:00:00", 1.25, true, false},
		{"时间戳负数", "2026-10-12 06:00:00 - 2026-10-13 12:00:00", -1.25, true, false},
		{"时分精度", "2026-10-13 12:00 - 2026-10-13 00:00", 0.5, true, false},
		{"日期与时间混合", "2026-10-13 - 2026-10-12 06:00:00", 0.75, true, false},
		{"T 分隔", "2026-10-13T12:00:00 - 2026-10-13T00:00:00", 0.5, true, false},
		{"保留两位小数", "2026-10-13 08:00:00 - 2026-10-12 00:00:00", 1.33, true, false},
		{"左侧为空", "2026-10-13-", 0, true, false},
		{"左侧为空带空格", "2026-10-13 - ", 0, true, false},
		{"右侧为空", "-2026-10-13", 0, true, false},
		{"左侧为空带时间戳", "2026-10-13 12:00:00-", 0, true, false},
		{"右侧为空带时间戳", "- 2026-10-13 12:00:00", 0, true, false},
		{"两侧均为空", "-", 0, true, false},
		{"单个日期不误判", "2026-10-13", 0, false, false},
		{"普通加法不误判", "1+2", 0, false, false},
		{"普通表达式不误判", "(100+2)*3 % 7", 0, false, false},
		{"日期减数字不误判", "2026-10-13 - 5", 0, false, false},
		{"三个日期连减不误判", "2026-10-13-2026-10-12-2026-10-11", 0, false, false},
		{"非法日期报错", "2026-13-45-2026-10-12", 0, true, true},
		{"左侧非法日期报错", "2026-13-45-", 0, true, true},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got, matched, err := TryDateDiff(c.in)
			if matched != c.wantMatched {
				t.Fatalf("TryDateDiff(%q) matched = %v, 期望 %v", c.in, matched, c.wantMatched)
			}
			if c.wantErr {
				if err == nil {
					t.Fatalf("TryDateDiff(%q) 期望返回错误，实际得到 %v", c.in, got)
				}
				return
			}
			if err != nil {
				t.Fatalf("TryDateDiff(%q) 返回错误: %v", c.in, err)
			}
			if !matched {
				return
			}
			if math.Abs(got-c.want) > 1e-9 {
				t.Errorf("TryDateDiff(%q) = %v, 期望 %v", c.in, got, c.want)
			}
		})
	}
}
