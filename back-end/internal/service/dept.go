package service

import (
	"errors"

	"back-end/internal/database"
	"back-end/internal/model"
)

// DeptTree 部门树
//   - 过滤、层级结构（Children）、排序（sort ASC, id ASC）与原有逻辑保持一致
//   - req.WithUsers 为 true 时，额外为树中每个部门节点填充其下员工列表（Users）
func DeptTree(req *model.DeptListReq) ([]*model.Dept, error) {
	db := database.DB.Model(&model.Dept{})
	if req.Name != "" {
		db = db.Where("name LIKE ?", "%"+req.Name+"%")
	}
	var list []*model.Dept
	if err := db.Order("sort ASC, id ASC").Find(&list).Error; err != nil {
		return nil, err
	}
	tree := buildDeptTree(list, 0)
	if req.WithUsers {
		if err := fillDeptUsers(tree); err != nil {
			return nil, err
		}
	}
	return tree, nil
}

// fillDeptUsers 批量查询树中所有部门下的员工（dept_id IN (...) 一次查出），按部门挂载到树节点
func fillDeptUsers(nodes []*model.Dept) error {
	ids := collectDeptIDs(nodes)
	if len(ids) == 0 {
		return nil
	}
	var users []model.User
	if err := database.DB.Where("dept_id IN ?", ids).Order("id ASC").Find(&users).Error; err != nil {
		return err
	}
	byDept := map[uint][]model.User{}
	for _, u := range users {
		byDept[u.DeptID] = append(byDept[u.DeptID], u)
	}
	assignDeptUsers(nodes, byDept)
	return nil
}

// collectDeptIDs 收集树中所有部门 ID（含嵌套子部门）
func collectDeptIDs(nodes []*model.Dept) []uint {
	ids := make([]uint, 0, len(nodes))
	for _, d := range nodes {
		ids = append(ids, d.ID)
		if len(d.Children) > 0 {
			ids = append(ids, collectDeptIDs(d.Children)...)
		}
	}
	return ids
}

// assignDeptUsers 将按部门分组的员工列表递归挂载到树节点
func assignDeptUsers(nodes []*model.Dept, byDept map[uint][]model.User) {
	for _, d := range nodes {
		if users, ok := byDept[d.ID]; ok {
			d.Users = users
		}
		if len(d.Children) > 0 {
			assignDeptUsers(d.Children, byDept)
		}
	}
}

// DeptDetail 部门详情
func DeptDetail(id uint) (*model.Dept, error) {
	var dept model.Dept
	if err := database.DB.First(&dept, id).Error; err != nil {
		return nil, errors.New("部门不存在")
	}
	return &dept, nil
}

// DeptCreate 新增部门
func DeptCreate(curUserID uint, req *model.DeptCreateReq) (*model.Dept, error) {
	if req.ParentID > 0 {
		if err := checkDeptExists(req.ParentID); err != nil {
			return nil, err
		}
	}
	status := req.Status
	if status == 0 {
		status = 1
	}
	dept := model.Dept{
		ParentID: req.ParentID, Name: req.Name,
		Leader: req.Leader, Sort: req.Sort, Status: status,
	}
	dept.CreatedBy, dept.UpdatedBy = curUserID, curUserID
	if err := database.DB.Create(&dept).Error; err != nil {
		return nil, err
	}
	return &dept, nil
}

// DeptUpdate 修改部门（校验父级不能成环）
func DeptUpdate(curUserID, id uint, req *model.DeptUpdateReq) (*model.Dept, error) {
	var dept model.Dept
	if err := database.DB.First(&dept, id).Error; err != nil {
		return nil, errors.New("部门不存在")
	}
	if req.ParentID > 0 {
		if req.ParentID == id || isDeptDescendant(req.ParentID, id) {
			return nil, errors.New("父级部门不能为自身或其子级")
		}
		if err := checkDeptExists(req.ParentID); err != nil {
			return nil, err
		}
		dept.ParentID = req.ParentID
	}
	if req.Name != "" {
		dept.Name = req.Name
	}
	dept.Leader = req.Leader
	if req.Sort > 0 {
		dept.Sort = req.Sort
	}
	if req.Status == 0 || req.Status == 1 {
		dept.Status = req.Status
	}
	dept.UpdatedBy = curUserID
	if err := database.DB.Save(&dept).Error; err != nil {
		return nil, err
	}
	return &dept, nil
}

// DeptDelete 删除部门：存在子部门或仍有用户归属时禁止删除
func DeptDelete(id uint) error {
	var childCount, userCount int64
	database.DB.Model(&model.Dept{}).Where("parent_id = ?", id).Count(&childCount)
	if childCount > 0 {
		return errors.New("存在子部门，请先删除子部门")
	}
	database.DB.Model(&model.User{}).Where("dept_id = ?", id).Count(&userCount)
	if userCount > 0 {
		return errors.New("部门下仍存在用户，不可删除")
	}
	return database.DB.Delete(&model.Dept{}, id).Error
}

func checkDeptExists(id uint) error {
	var count int64
	database.DB.Model(&model.Dept{}).Where("id = ?", id).Count(&count)
	if count == 0 {
		return errors.New("父级部门不存在")
	}
	return nil
}

func isDeptDescendant(target, rootID uint) bool {
	queue := []uint{rootID}
	for len(queue) > 0 {
		var children []model.Dept
		database.DB.Where("parent_id IN ?", queue).Find(&children)
		queue = queue[:0]
		for _, c := range children {
			if c.ID == target {
				return true
			}
			queue = append(queue, c.ID)
		}
	}
	return false
}

func buildDeptTree(list []*model.Dept, parentID uint) []*model.Dept {
	var nodes []*model.Dept
	for _, d := range list {
		if d.ParentID == parentID {
			d.Children = buildDeptTree(list, d.ID)
			nodes = append(nodes, d)
		}
	}
	return nodes
}
