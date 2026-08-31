import request from './request'

// GET /roles 分页列表（支持 name 过滤）
export function listRoles(params) {
  return request.get('/roles', { params })
}

// GET /roles/:id 详情
export function getRole(id) {
  return request.get(`/roles/${id}`)
}

// POST /roles 新增
export function createRole(data) {
  return request.post('/roles', data)
}

// PUT /roles/:id 修改
export function updateRole(id, data) {
  return request.put(`/roles/${id}`, data)
}

// DELETE /roles/:id 删除
export function deleteRole(id) {
  return request.delete(`/roles/${id}`)
}

// PUT /roles/:id/menus 分配菜单
export function assignRoleMenus(id, menuIds) {
  return request.put(`/roles/${id}/menus`, { menu_ids: menuIds })
}

// PUT /roles/:id/depts 自定义数据范围绑定部门
export function assignRoleDepts(id, deptIds) {
  return request.put(`/roles/${id}/depts`, { dept_ids: deptIds })
}
