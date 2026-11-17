package service

import (
	"testing"

	"back-end/internal/model"
)

// TestApplicationStructureLocked 生命周期语义：只有上线锁结构，下架可改字段/元素。
func TestApplicationStructureLocked(t *testing.T) {
	if !applicationStructureLocked(model.ApplicationStatusOnline) {
		t.Fatal("上线状态应锁定表字段与表单元素")
	}
	if applicationStructureLocked(model.ApplicationStatusOffline) {
		t.Fatal("下架状态不应锁定表字段与表单元素")
	}
}
