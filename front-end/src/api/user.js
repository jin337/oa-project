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

// PUT /users/:id/password 修改密码
export function updateUserPassword(id, data) {
  return request.put(`/users/${id}/password`, data)
}

// PUT /users/:id/profile 更新用户详细档案（UserProfile）
export function updateUserProfile(id, data) {
  return request.put(`/users/${id}/profile`, data)
}

// PUT /users/:id/reset-password 重置密码（管理员操作，无需旧密码）
export function resetUserPassword(id, data) {
  return request.put(`/users/${id}/reset-password`, data)
}
