import request from 'src/api/request'

// GET /examine-groups 分页列表（支持 name 过滤）
export function listExamineGroups(params) {
  return request.get('/examine-groups', { params })
}

// GET /examine-groups/:id 详情
export function getExamineGroup(id) {
  return request.get(`/examine-groups/${id}`)
}

// POST /examine-groups 新增
export function createExamineGroup(data) {
  return request.post('/examine-groups', data)
}

// PUT /examine-groups/:id 修改
export function updateExamineGroup(id, data) {
  return request.put(`/examine-groups/${id}`, data)
}

// DELETE /examine-groups/:id 删除
export function deleteExamineGroup(id) {
  return request.delete(`/examine-groups/${id}`)
}
