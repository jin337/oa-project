package test

import (
	"strings"
	"testing"

	"back-end/internal/middleware"
)

func TestRedactSensitiveBody(t *testing.T) {
	cases := []struct {
		name string
		in   string
		want string
	}{
		{
			name: "json password",
			in:   `{"username":"admin","password":"p@ss","remember":true}`,
			want: `{"username":"admin","password":"[REDACTED]","remember":true}`,
		},
		{
			name: "json token",
			in:   `{"access_token":"abc.def","token_type":"Bearer"}`,
			want: `{"access_token":"[REDACTED]","token_type":"Bearer"}`,
		},
		{
			name: "json nested",
			in:   `{"data":{"refresh_token":"r1","name":"n"}}`,
			want: `{"data":{"refresh_token":"[REDACTED]","name":"n"}}`,
		},
		{
			name: "form",
			in:   "username=admin&password=p%40ss&remember=true",
			want: "username=admin&password=[REDACTED]&remember=true",
		},
		{
			name: "plain remains",
			in:   `{"username":"admin","name":"张三"}`,
			want: `{"username":"admin","name":"张三"}`,
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := middleware.RedactSensitiveBody([]byte(tc.in)); got != tc.want {
				t.Fatalf("redactSensitiveBody() = %q, want %q", got, tc.want)
			}
		})
	}
}

func TestRedactSensitiveQuery(t *testing.T) {
	in := "token=abc&page=1&access_token=def"
	want := "token=[REDACTED]&page=1&access_token=[REDACTED]"
	if got := middleware.RedactSensitiveQuery(in); got != want {
		t.Fatalf("redactSensitiveQuery() = %q, want %q", got, want)
	}
	if got := middleware.RedactSensitiveQuery(""); got != "" {
		t.Fatalf("空查询应返回空串，实际 %q", got)
	}
}

func TestRedactSensitiveBodyKeepsOtherContent(t *testing.T) {
	in := `{"username":"admin","password":"p@ss","content":"` + strings.Repeat("x", 100) + `"}`
	got := middleware.RedactSensitiveBody([]byte(in))
	if strings.Contains(got, "p@ss") {
		t.Fatalf("密码仍出现在审计请求体中: %s", got)
	}
	if !strings.Contains(got, strings.Repeat("x", 100)) {
		t.Fatal("非敏感内容被误删")
	}
}
