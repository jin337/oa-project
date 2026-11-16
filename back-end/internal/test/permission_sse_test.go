package test

import (
	"testing"
	"time"

	"back-end/internal/service"
)

// TestBroadcastPermissionChanged 权限变更事件必须通过 SSE 推送给所有在线用户，
// 前端据此重拉 profile，按钮权限无需等待会话刷新。
func TestBroadcastPermissionChanged(t *testing.T) {
	ch := service.RegisterNotification(1)
	defer service.UnregisterNotification(1, ch)

	service.BroadcastPermissionChanged()

	select {
	case ev := <-ch:
		if ev.Event != "permission_changed" {
			t.Fatalf("事件名 = %q, 期望 permission_changed", ev.Event)
		}
	case <-time.After(time.Second):
		t.Fatal("等待 permission_changed 事件超时")
	}
}
