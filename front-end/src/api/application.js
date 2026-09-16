import request from 'src/api/request'

// GET /application 分页列表
export function listApplications(params) {
  return request.get('/application', { params })
}

// GET /application/:id 详情
export function getApplication(id) {
  return request.get(`/application/${id}`)
}

// GET /application/by-code/:code 按页面编码（code）查询应用配置（动态菜单页面渲染用）
// @param {string} code     页面编码（如 app_1788413612）
// @param {string} state    页面状态（如 list / form / detail），作为 query 参数（?state=xxx）透传后端，可选
// @param {number} page     页码（state=list 时用于分页），可选
// @param {number} size     每页条数（state=list 时用于分页），可选
// @param {object} filters  动态搜索字段（state=list 时作为额外 query 参数透传），可选
export function getApplicationByCode(code, state, page, size, filters) {
  const params = {}
  if (state) params.state = state
  if (page) params.page = page
  if (size) params.size = size
  if (filters) Object.assign(params, filters)
  return request.get(`/application/by-code/${code}`, { params: Object.keys(params).length ? params : undefined })
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

// ========== 动态业务数据（/application/:id/data） ==========

// POST /application/:id/data 新增动态业务数据（提交申请表单）
export function createApplicationData(appId, data) {
  return request.post(`/application/${appId}/data`, data)
}

// PUT /application/:id/data/:dataId 更新动态业务数据（编辑表单提交）
export function updateApplicationData(appId, dataId, data) {
  return request.put(`/application/${appId}/data/${dataId}`, data)
}

// GET /application/:id/data/:dataId 动态业务数据详情（含子表数据）
export function getApplicationDataDetail(appId, dataId) {
  return request.get(`/application/${appId}/data/${dataId}`)
}

// DELETE /application/:id/data/:dataId 删除动态业务数据（列表页删除行）
export function deleteApplicationData(appId, dataId) {
  return request.delete(`/application/${appId}/data/${dataId}`)
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
