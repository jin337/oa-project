import request from 'src/api/request'

// GET /operation-logs 操作日志分页查询
export function listOperationLogs(params) {
  return request.get('/operation-logs', { params })
}

// GET /operation-logs/export 按筛选条件导出操作日志 xlsx。
// responseType=blob 时响应拦截器原样返回二进制；导出失败后端返回 JSON，
// 调用方需按 blob.type 判断并解析错误信息。导出耗时随数据量增长，单独放宽超时到 60s。
export function exportOperationLogs(params) {
  return request.get('/operation-logs/export', { params, responseType: 'blob', timeout: 60000 })
}
