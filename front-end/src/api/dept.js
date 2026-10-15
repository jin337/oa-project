import request from 'src/api/request'

// GET /depts 部门树
export function getDeptTree() {
  return request.get('/depts')
}

// GET /depts/users 部门树（含部门下员工，组织架构选择器数据源）
// 传 {status:1} 时仅返回启用的部门与用户
export function getDeptUsersTree(params) {
  return request.get('/depts/users', { params })
}

// GET /depts/:id 详情
export function getDept(id) {
  return request.get(`/depts/${id}`)
}

// POST /depts 新增
export function createDept(data) {
  return request.post('/depts', data)
}

// PUT /depts/:id 修改
export function updateDept(id, data) {
  return request.put(`/depts/${id}`, data)
}

// DELETE /depts/:id 删除
export function deleteDept(id) {
  return request.delete(`/depts/${id}`)
}
