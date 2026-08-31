import request from './request'

// GET /menus 菜单树
export function getMenuTree() {
  return request.get('/menus')
}

// GET /menus/:id 详情
export function getMenu(id) {
  return request.get(`/menus/${id}`)
}

// POST /menus 新增
export function createMenu(data) {
  return request.post('/menus', data)
}

// PUT /menus/:id 修改
export function updateMenu(id, data) {
  return request.put(`/menus/${id}`, data)
}

// DELETE /menus/:id 删除
export function deleteMenu(id) {
  return request.delete(`/menus/${id}`)
}
