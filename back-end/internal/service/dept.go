package service

import (
	"errors"

	"back-end/internal/database"
	"back-end/internal/model"
)

// DeptTree 部门树
func DeptTree(req *model.DeptListReq) ([]*model.Dept, error) {
	db := database.DB.Model(&model.Dept{})
	if req.Name != "" {
		db = db.Where("name LIKE ?", "%"+req.Name+"%")
	}
	var list []*model.Dept
	if err := db.Order("sort ASC, id ASC").Find(&list).Error; err != nil {
		return nil, err
	}
	return buildDeptTree(list, 0), nil
}

// DeptUsers 所有公司部门 + 每个部门下的用户（GET /depts/users）
// 返回部门与用户混合的统一树结构（OrgNode）：
//   - 部门节点 Children 同时包含子部门节点与用户节点，前端统一遍历 children 即可拿到完整组织架构
//   - 节点以 Type 区分：dept 部门 / user 用户
//   - 子部门在前、用户在后；部门按 sort ASC, id ASC，用户按 id ASC
//   - 仅挂载归属部门树内用户的用户（dept_id 无效/无部门的用户不返回）
func DeptUsers() ([]*model.OrgNode, error) {
	var list []*model.Dept
	if err := database.DB.Order("sort ASC, id ASC").Find(&list).Error; err != nil {
		return nil, err
	}
	deptTree := buildDeptTree(list, 0)

	var users []model.User
	if err := database.DB.Preload("Profile").Order("id ASC").Find(&users).Error; err != nil {
		return nil, err
	}
	userMap := map[uint]model.User{}
	for _, u := range users {
		userMap[u.ID] = u
	}
	// 按多部门归属(system_user_dept)挂载：一个用户可出现在多个部门节点下
	var rels []struct{ UserID uint; DeptID uint }
	if err := database.DB.Table("oa_sys_user_dept").Scan(&rels).Error; err != nil {
		return nil, err
	}
	byDept := map[uint][]model.User{}
	mounted := map[uint]bool{}
	for _, r := range rels {
		if u, ok := userMap[r.UserID]; ok {
			byDept[r.DeptID] = append(byDept[r.DeptID], u)
			mounted[r.UserID] = true
		}
	}
	// 兼容兜底：无关联记录的用户（如旧数据）按当前部门挂载
	for _, u := range users {
		if !mounted[u.ID] && u.DeptID > 0 {
			byDept[u.DeptID] = append(byDept[u.DeptID], u)
		}
	}

	return buildOrgTree(deptTree, byDept), nil
}

// buildOrgTree 将部门树转换为部门+用户混合树：每个部门节点的 Children = 子部门节点 + 用户节点
func buildOrgTree(depts []*model.Dept, byDept map[uint][]model.User) []*model.OrgNode {
	nodes := make([]*model.OrgNode, 0, len(depts))
	for _, d := range depts {
		node := &model.OrgNode{
			Type:     model.OrgNodeTypeDept,
			ID:       d.ID,
			Name:     d.Name,
			ParentID: d.ParentID,
			Leader:   d.Leader,
			Sort:     d.Sort,
			Status:   d.Status,
		}
		// 子部门节点（在前）
		node.Children = buildOrgTree(d.Children, byDept)
		// 用户节点（在后）
		for _, u := range byDept[d.ID] {
			node.Children = append(node.Children, &model.OrgNode{
				Type:     model.OrgNodeTypeUser,
				ID:       u.ID,
				Name:     userNickname(u),
				Username: u.Username,
				Email:    u.Email,
				Phone:    u.Phone,
				ParentID: d.ID,
				Status:   u.Status,
			})
		}
		nodes = append(nodes, node)
	}
	return nodes
}

// userNickname 取用户昵称：优先 Profile.Nickname，无档案时回退 Username
func userNickname(u model.User) string {
	if u.Profile != nil && u.Profile.Nickname != "" {
		return u.Profile.Nickname
	}
	return u.Username
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
