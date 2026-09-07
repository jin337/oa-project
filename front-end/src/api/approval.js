import request from './request'

// ========== 审批分类（/approval/category） ==========

// GET /approval/category 分类列表
export function listApprovalCategories(params) {
  return request.get('/approval/category', { params })
}

// POST /approval/category 新增分类
export function createApprovalCategory(data) {
  return request.post('/approval/category', data)
}

// PUT /approval/category/:id 修改分类
export function updateApprovalCategory(id, data) {
  return request.put(`/approval/category/${id}`, data)
}

// DELETE /approval/category/:id 删除分类
export function deleteApprovalCategory(id) {
  return request.delete(`/approval/category/${id}`)
}

// ========== 申请项（/approval/item） ==========

// GET /approval/item 申请项列表
export function listApprovalItems(params) {
  return request.get('/approval/item', { params })
}

// POST /approval/item 新增申请项
export function createApprovalItem(data) {
  return request.post('/approval/item', data)
}

// PUT /approval/item/:id 修改申请项
export function updateApprovalItem(id, data) {
  return request.put(`/approval/item/${id}`, data)
}

// DELETE /approval/item/:id 删除申请项
export function deleteApprovalItem(id) {
  return request.delete(`/approval/item/${id}`)
}
