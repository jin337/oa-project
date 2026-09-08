import request from './request'

// GET /application 分页列表
export function listApplications(params) {
  return request.get('/application', { params })
}

// GET /application/:id 详情
export function getApplication(id) {
  return request.get(`/application/${id}`)
}

// GET /application/by-code/:code 按页面编码（code）查询应用配置（动态菜单页面渲染用）
export function getApplicationByCode(code) {
  return request.get(`/application/by-code/${code}`)
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

// ========== 动态页面数据（/application/:appId/data） ==========

// GET /application/:appId/data 通用数据列表查询（动态配置页面的表格数据，params 携带 table_name 与搜索字段）
export function listApplicationData(appId, params) {
  return request.get(`/application/${appId}/data`, { params })
}

// GET /application/:appId/data/:id 数据详情（含子表数据，动态配置页面的详情弹窗；主键假定为 id）
export function getApplicationDataDetail(appId, id, params) {
  return request.get(`/application/${appId}/data/${id}`, { params })
}

// POST /application/:appId/data 通用数据新增（动态表单提交：主表字段数据 + 子表数据）
// @param {number|string} appId     应用 ID（后端据此定位主表名）
// @param {object} mainData         主表字段数据（布局中普通表单元素的值）
// @param {object} subTables        子表数据 { table_key: [行数据...] }（布局中表格组件的 Form.List 数组值）
export function createApplicationData(appId, mainData, subTables) {
  return request.post(`/application/${appId}/data`, {
    data: mainData,
    sub_tables: subTables,
  })
}
