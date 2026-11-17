package test

import (
	"testing"

	"back-end/internal/model"
	"back-end/internal/service"
)

// TestApplicationStructureLocked 生命周期语义：只有上线锁结构，下架可改字段/元素。
func TestApplicationStructureLocked(t *testing.T) {
	if !service.ApplicationStructureLocked(model.ApplicationStatusOnline) {
		t.Fatal("上线状态应锁定表字段与表单元素")
	}
	if service.ApplicationStructureLocked(model.ApplicationStatusOffline) {
		t.Fatal("下架状态不应锁定表字段与表单元素")
	}
}
