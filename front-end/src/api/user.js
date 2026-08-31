import request from './request'

// GET /users 分页列表（支持 username / dept_id 过滤）
export function listUsers(params) {
  return request.get('/users', { params })
}

// GET /users/:id 详情
export function getUser(id) {
  return request.get(`/users/${id}`)
}

// POST /users 新增
export function createUser(data) {
  return request.post('/users', data)
}

// PUT /users/:id 修改
export function updateUser(id, data) {
  return request.put(`/users/${id}`, data)
}

// DELETE /users/:id 删除
export function deleteUser(id) {
  return request.delete(`/users/${id}`)
}

// PUT /users/:id/roles 分配角色
export function assignUserRoles(id, roleIds) {
  return request.put(`/users/${id}/roles`, { role_ids: roleIds })
}
