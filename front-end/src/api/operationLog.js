import request from 'src/api/request'

// GET /operation-logs 操作日志分页查询
export function listOperationLogs(params) {
  return request.get('/operation-logs', { params })
}
