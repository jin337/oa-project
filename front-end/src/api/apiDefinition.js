import request from 'src/api/request'

// GET /api-definitions 分页列表（支持 name/code 过滤）
export function listApiDefinitions(params) {
  return request.get('/api-definitions', { params })
}

// GET /api-definitions/:id 详情
export function getApiDefinition(id) {
  return request.get(`/api-definitions/${id}`)
}

// POST /api-definitions 新增
export function createApiDefinition(data) {
  return request.post('/api-definitions', data)
}

// PUT /api-definitions/:id 修改（code 不可改）
export function updateApiDefinition(id, data) {
  return request.put(`/api-definitions/${id}`, data)
}

// DELETE /api-definitions/:id 删除
export function deleteApiDefinition(id) {
  return request.delete(`/api-definitions/${id}`)
}

// POST /api-definitions/debug 试调（以当前用户身份真实请求目标内部接口）
export function debugApiDefinition(data) {
  return request.post('/api-definitions/debug', data)
}

// GET /api-definitions/backend/routes 枚举后端全部业务路由
export function listBackendRoutes() {
  return request.get('/api-definitions/backend/routes')
}

// POST /api-definitions/backend/import 一键导入后端路由为 HTTP 转发定义
export function importBackendRoutes() {
  return request.post('/api-definitions/backend/import')
}
