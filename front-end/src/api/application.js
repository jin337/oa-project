import request from 'src/api/request'

// GET /application 分页列表
export function listApplications(params) {
  return request.get('/application', { params })
}

// GET /application/:id 详情
export function getApplication(id) {
  return request.get(`/application/${id}`)
}

// GET /application/by-code/:code 按页面编码（code）查询流程配置（动态菜单页面渲染用）
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

// ========== 表单元素管理（/application/:appId/element） ==========

// GET /application/:appId/element 表单元素列表
export function listApplicationElements(appId, params) {
  return request.get(`/application/${appId}/element`, { params })
}

// POST /application/:appId/element 新增表单元素
export function createApplicationElement(appId, data) {
  return request.post(`/application/${appId}/element`, data)
}

// PUT /application/:appId/element/:id 修改表单元素
export function updateApplicationElement(appId, elementId, data) {
  return request.put(`/application/${appId}/element/${elementId}`, data)
}

// DELETE /application/:appId/element/:id 删除表单元素
export function deleteApplicationElement(appId, elementId) {
  return request.delete(`/application/${appId}/element/${elementId}`)
}

// ========== 动态业务数据（/application/:id/data） ==========

// POST /application/:id/data 新增动态业务数据
export function createApplicationData(appId, data) {
  return request.post(`/application/${appId}/data`, data)
}

// PUT /application/:id/data/:dataId 更新动态业务数据
export function updateApplicationData(appId, dataId, data) {
  return request.put(`/application/${appId}/data/${dataId}`, data)
}

// GET /application/:id/data/:dataId 动态业务数据详情（含子表数据）
export function getApplicationDataDetail(appId, dataId) {
  return request.get(`/application/${appId}/data/${dataId}`)
}

// DELETE /application/:id/data/:dataId 删除动态业务数据
export function deleteApplicationData(appId, dataId) {
  return request.delete(`/application/${appId}/data/${dataId}`)
}

// ========== 流程版本管理 ==========

// GET /application/:id/versions 版本列表
export function listApplicationVersions(id) {
  return request.get(`/application/${id}/versions`)
}

// POST /application/:id/versions/publish 发布新版本（remark / effective_at 可选，effective_at 为空=立即生效）
export function publishApplicationVersion(id, data) {
  return request.post(`/application/${id}/versions/publish`, data)
}

// PUT /application/:id/versions/:versionId/edit 编辑待生效版本的生效时间和版本说明
export function updateApplicationVersionEffectiveAt(id, versionId, payload) {
  return request.put(`/application/${id}/versions/${versionId}/edit`, payload)
}

// PUT /application/:id/versions/:versionId 保存版本的三个 json 快照
export function updateApplicationVersion(id, versionId, data) {
  return request.put(`/application/${id}/versions/${versionId}`, data)
}

// PUT /application/:id/versions/:versionId/publish 基于已有版本再次发布
export function republishApplicationVersion(id, versionId, data) {
  return request.put(`/application/${id}/versions/${versionId}/publish`, data)
}

// DELETE /application/:id/versions/:versionId 删除待生效版本
export function deleteApplicationVersion(id, versionId) {
  return request.delete(`/application/${id}/versions/${versionId}`)
}

// POST /application/:id/versions/:versionId/copy-to-draft 把指定版本（通常是已失效）的三个 JSON 复制到设计中草稿
export function copyApplicationVersionToDraft(id, versionId) {
  return request.post(`/application/${id}/versions/${versionId}/copy-to-draft`)
}
