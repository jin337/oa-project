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

// GET /application/:appId/fields?table_name=xxx 字段列表
export function listTableFields(appId, params, tableName) {
  return request.get(`/application/${appId}/fields`, {
    params: { ...params, table_name: tableName },
  })
}

// POST /application/:appId/fields 新增字段（body 携带 table_name）
export function createTableField(appId, data, tableName) {
  return request.post(`/application/${appId}/fields`, { ...data, table_name: tableName })
}

// PUT /application/:appId/fields/:fieldId 修改字段（body 携带 table_name）
export function updateTableField(appId, fieldId, data, tableName) {
  return request.put(`/application/${appId}/fields/${fieldId}`, { ...data, table_name: tableName })
}

// DELETE /application/:appId/fields/:fieldId?table_name=xxx 删除字段
export function deleteTableField(appId, fieldId, tableName) {
  return request.delete(`/application/${appId}/fields/${fieldId}`, {
    params: { table_name: tableName },
  })
}

// ========== 表单元素管理（/application/:appId/formelement） ==========

// GET /application/:appId/formelement 表单元素列表
export function listFormElements(appId, params) {
  return request.get(`/application/${appId}/formelement`, { params })
}

// POST /application/:appId/formelement 新增表单元素
export function createFormElement(appId, data) {
  return request.post(`/application/${appId}/formelement`, data)
}

// PUT /application/:appId/formelement/:id 修改表单元素
export function updateFormElement(appId, elementId, data) {
  return request.put(`/application/${appId}/formelement/${elementId}`, data)
}

// DELETE /application/:appId/formelement/:id 删除表单元素
export function deleteFormElement(appId, elementId) {
  return request.delete(`/application/${appId}/formelement/${elementId}`)
}
