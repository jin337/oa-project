package service

import (
	"testing"
	"time"

	"back-end/internal/model"
)

// dept 构造：ID 来自内嵌的 BaseModel（Go 不允许在复合字面量里直接写提升字段）
func dept(id, parentID uint, name string) *model.Dept {
	return &model.Dept{
		BaseModel: model.BaseModel{ID: id},
		ParentID:  parentID,
		Name:      name,
	}
}

// TestBuildDeptTreeFilteredList 回归：数据权限过滤后只剩子部门（父部门不在结果里），
// 这些部门必须各自成为根节点、互为兄弟，不能互相嵌套。
func TestBuildDeptTreeFilteredList(t *testing.T) {
	list := []*model.Dept{
		dept(2, 1, "研发部"),
		dept(3, 1, "市场部"),
	}
	tree := buildDeptTree(list, 0)
	if len(tree) != 2 {
		t.Fatalf("根节点数 = %d, 期望 2（研发部与市场部）", len(tree))
	}
	if len(tree[0].Children) != 0 || len(tree[1].Children) != 0 {
		t.Error("两个同级部门之间不应产生父子关系")
	}
	names := map[string]bool{}
	for _, d := range tree {
		names[d.Name] = true
	}
	if !names["研发部"] || !names["市场部"] {
		t.Errorf("根节点应为研发部与市场部，实际 %v", names)
	}
}

// TestBuildDeptTreeNormal 完整层级：按 parent_id 正确嵌套。
func TestBuildDeptTreeNormal(t *testing.T) {
	list := []*model.Dept{
		dept(1, 0, "总公司"),
		dept(2, 1, "研发部"),
		dept(3, 1, "市场部"),
		dept(4, 2, "后端组"),
	}
	tree := buildDeptTree(list, 0)
	if len(tree) != 1 || tree[0].ID != 1 {
		t.Fatalf("根节点应为总公司，实际 %+v", tree)
	}
	if len(tree[0].Children) != 2 {
		t.Fatalf("总公司子节点数 = %d, 期望 2", len(tree[0].Children))
	}
	var dev *model.Dept
	for _, c := range tree[0].Children {
		if c.ID == 2 {
			dev = c
		}
	}
	if dev == nil || len(dev.Children) != 1 || dev.Children[0].ID != 4 {
		t.Errorf("研发部应含 1 个子节点（后端组），实际 %+v", dev)
	}
}

// TestBuildDeptTreeEmpty 空列表返回空切片而非 nil。
func TestBuildDeptTreeEmpty(t *testing.T) {
	tree := buildDeptTree(nil, 0)
	if tree == nil {
		t.Fatal("空列表应返回空切片而不是 nil")
	}
	if len(tree) != 0 {
		t.Errorf("空列表应返回 0 个根节点，实际 %d", len(tree))
	}
}

// TestBuildDeptTreeCycle 存在环（1->2->1）时不应死循环或 panic。
// 两个节点互为父节点、都不在根位置，返回空切片是可接受的结果；关键是必须终止。
func TestBuildDeptTreeCycle(t *testing.T) {
	list := []*model.Dept{
		dept(1, 2, "A"),
		dept(2, 1, "B"),
	}
	done := make(chan []*model.Dept, 1)
	go func() { done <- buildDeptTree(list, 0) }()
	select {
	case tree := <-done:
		if len(tree) != 0 {
			t.Errorf("互为父节点的环不应产出根节点，实际 %d 个", len(tree))
		}
	case <-time.After(2 * time.Second):
		t.Fatal("环状数据导致死循环")
	}
}
