import request from './request'

// GET /examine 分页列表
export function listExamines(params) {
  return request.get('/examine', { params })
}

// POST /examine 新增
export function createExamine(data) {
  return request.post('/examine', data)
}

// PUT /examine/:id 修改
export function updateExamine(id, data) {
  return request.put(`/examine/${id}`, data)
}

// DELETE /examine/:id 删除
export function deleteExamine(id) {
  return request.delete(`/examine/${id}`)
}
