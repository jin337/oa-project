import request from './request'

// GET /application 分页列表
export function listApplications(params) {
  return request.get('/application', { params })
}

// GET /application/:id 详情
export function getApplication(id) {
  return request.get(`/application/${id}`)
}

// POST /application 新增
export function createApplication(data) {
  return request.post('/application', data)
}

// PUT /application/:id 修改
export function updateApplication(id, data) {
  return request.put(`/application/${id}`, data)
}

// DELETE /application/:id 删除
export function deleteApplication(id) {
  return request.delete(`/application/${id}`)
}

// ========== 表字段管理（/application/:appId/fields） ==========

// GET /application/:appId/fields 字段列表
export function listTableFields(appId, params) {
  return request.get(`/application/${appId}/fields`, { params })
}

// POST /application/:appId/fields 新增字段
export function createTableField(appId, data) {
  return request.post(`/application/${appId}/fields`, data)
}

// PUT /application/:appId/fields/:fieldId 修改字段
export function updateTableField(appId, fieldId, data) {
  return request.put(`/application/${appId}/fields/${fieldId}`, data)
}

// DELETE /application/:appId/fields/:fieldId 删除字段
export function deleteTableField(appId, fieldId) {
  return request.delete(`/application/${appId}/fields/${fieldId}`)
}
