import request from 'src/api/request'

// ========== 审批分类（/approval/category） ==========

// GET /approval/category 分类列表
export function listApprovalCategories(params) {
  return request.get('/approval/category', { params })
}

// POST /approval/category 新增分类
export function createApprovalCategory(data) {
  return request.post('/approval/category', data)
}

// PUT /approval/category/:id 修改分类
export function updateApprovalCategory(id, data) {
  return request.put(`/approval/category/${id}`, data)
}

// DELETE /approval/category/:id 删除分类
export function deleteApprovalCategory(id) {
  return request.delete(`/approval/category/${id}`)
}

// ========== 申请项（/approval/category/item） ==========

// GET /approval/category/item 申请项列表
export function listApprovalItems(params) {
  return request.get('/approval/category/item', { params })
}

// POST /approval/category/item 新增申请项
export function createApprovalItem(data) {
  return request.post('/approval/category/item', data)
}

// PUT /approval/category/item/:id 修改申请项
export function updateApprovalItem(id, data) {
  return request.put(`/approval/category/item/${id}`, data)
}

// DELETE /approval/category/item/:id 删除申请项
export function deleteApprovalItem(id) {
  return request.delete(`/approval/category/item/${id}`)
}

// ========== 审批列表（跨应用聚合查询，供我的发起/待办/已办/抄送/草稿箱使用） ==========

// GET /approval/list 审批列表
export function getApprovalList(params) {
  return request.get('/approval/list', { params })
}

// ========== 流程实例（/approval/instance） ==========

// POST /approval/instance 发起审批
export function createApprovalInstance(data) {
  return request.post('/approval/instance', data)
}

// POST /approval/instance/draft 保存审批草稿（不启动流程、不生成任务）
export function saveDraftInstance(data) {
  return request.post('/approval/instance/draft', data)
}

// PUT /approval/instance/:id/submit 从草稿提交发起审批
export function submitDraftInstance(id, data) {
  return request.put(`/approval/instance/${id}/submit`, data)
}

// GET /approval/instance/:id 实例详情（含任务列表+审批记录）
export function getApprovalInstanceDetail(id) {
  return request.get(`/approval/instance/${id}`)
}

// PUT /approval/instance/:id/withdraw 撤回
export function withdrawApprovalInstance(id) {
  return request.put(`/approval/instance/${id}/withdraw`)
}

// DELETE /approval/instance/:id 删除已终结的流程实例
export function deleteApprovalInstance(id) {
  return request.delete(`/approval/instance/${id}`)
}

// PUT /approval/instance/:instanceId/task/:taskId/approve 审批操作（同意/拒绝/驳回）
export function approveApprovalTask(instanceId, taskId, data) {
  return request.put(`/approval/instance/${instanceId}/task/${taskId}/approve`, data)
}

// PUT /approval/instance/:instanceId/task/:taskId/delegate 转交
export function delegateApprovalTask(instanceId, taskId, data) {
  return request.put(`/approval/instance/${instanceId}/task/${taskId}/delegate`, data)
}

// PUT /approval/instance/:instanceId/task/:taskId/add-sign 加签（type: 1-前加签 2-后加签）
export function addSignApprovalTask(instanceId, taskId, data) {
  return request.put(`/approval/instance/${instanceId}/task/${taskId}/add-sign`, data)
}
