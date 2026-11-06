package test

import (
	"testing"
	"time"

	"back-end/internal/service"
)

func TestParseWithdrawWindowDuration(t *testing.T) {
	cases := []struct {
		name   string
		config any
		want   time.Duration
		ok     bool
	}{
		{name: "nil 配置回退默认值由调用方处理", config: nil, ok: false},
		{name: "缺少其他设置回退默认值", config: map[string]any{}, ok: false},
		{
			name:   "分钟单位按分钟换算",
			config: map[string]any{"withdrawWindow": map[string]any{"value": 30, "unit": "minute"}},
			want:   30 * time.Minute,
			ok:     true,
		},
		{
			name:   "小时单位按小时换算",
			config: map[string]any{"withdrawWindow": map[string]any{"value": 2, "unit": "hour"}},
			want:   2 * time.Hour,
			ok:     true,
		},
		{
			name:   "天单位按 24 小时换算",
			config: map[string]any{"withdrawWindow": map[string]any{"value": 1, "unit": "day"}},
			want:   24 * time.Hour,
			ok:     true,
		},
		{name: "非法单位回退默认值", config: map[string]any{"withdrawWindow": map[string]any{"value": 30, "unit": "second"}}, ok: false},
		{name: "非正数回退默认值", config: map[string]any{"withdrawWindow": map[string]any{"value": 0, "unit": "minute"}}, ok: false},
		{name: "缺少数值回退默认值", config: map[string]any{"withdrawWindow": map[string]any{"unit": "minute"}}, ok: false},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, ok := service.ParseWithdrawWindowDuration(tc.config)
			if ok != tc.ok || (tc.ok && got != tc.want) {
				t.Fatalf("ParseWithdrawWindowDuration() = %v, %v; want %v, %v", got, ok, tc.want, tc.ok)
			}
		})
	}
}
