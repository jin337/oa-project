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
