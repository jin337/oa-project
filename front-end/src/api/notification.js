import request from 'src/api/request'

// GET /notifications 通知列表
export function notificationList(params) {
  return request.get('/notifications', { params })
}

// GET /notifications/unread-count 未读数
export function notificationUnreadCount() {
  return request.get('/notifications/unread-count')
}

// PUT /notifications/read-all 全部已读
export function notificationReadAll() {
  return request.put('/notifications/read-all')
}

// PUT /notifications/:id/read 单条已读
export function notificationRead(id) {
  return request.put(`/notifications/${id}/read`)
}

// PUT /notifications/read 批量已读（body: { ids }）
export function notificationReadBatch(ids) {
  return request.put('/notifications/read', { ids })
}

// DELETE /notifications 批量删除（body: { ids }）
export function notificationDelete(ids) {
  return request.delete('/notifications', { data: { ids } })
}
