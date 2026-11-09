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

// ========== 审批列表（跨流程聚合查询，供我的发起/待办/已办/抄送/草稿箱使用） ==========

// GET /approval/list 审批列表
export function getApprovalList(params) {
  return request.get('/approval/list', { params })
}

// GET /approval/dashboard/summary 工作台「全部事项」四类计数
// params: { time_range: 'today'|'7d'|'month'|'year'|'all' }
export function getApprovalDashboardSummary(params) {
  return request.get('/approval/dashboard/summary', { params })
}

// GET /approval/dashboard/flows 工作台「流程监控」与我相关的所有申请（全量，含 scopes 归属，点击跳对应页面开抽屉）
// params: { time_range: 'today'|'7d'|'month'|'year'|'all' }
export function getApprovalDashboardFlows(params) {
  return request.get('/approval/dashboard/flows', { params })
}

// GET /approval/locate/:instanceId 判定实例与当前用户的实时归属（todo/initiated/approved/cc/none）
// 通知点击跳转前调用：待办任务已被处理等情况时定位到真实可见的页面，避免跳到空列表
export function locateApprovalInstance(instanceId) {
  return request.get(`/approval/locate/${instanceId}`)
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

// PUT /approval/instance/:id/void 作废（仅进行中且无审批痕迹时可作废）
export function voidApprovalInstance(id) {
  return request.put(`/approval/instance/${id}/void`)
}

// POST /approval/instance/:id/urge 发起人催办（只发站内通知，同一实例 30 分钟内限一次）
export function urgeApprovalInstance(id) {
  return request.post(`/approval/instance/${id}/urge`)
}

// PUT /approval/instance/:id/resubmit 已驳回实例重新提交（发起人修改表单后继续审批）
export function resubmitApprovalInstance(id, businessData) {
  return request.put(`/approval/instance/${id}/resubmit`, { business_data: businessData })
}

// POST /approval/instance/:id/manual-cc 手动抄送指定用户（可多选）
export function manualCCApprovalInstance(id, userIds) {
  return request.post(`/approval/instance/${id}/manual-cc`, { user_ids: userIds })
}

// DELETE /approval/instance/:id 删除已终结的流程实例
export function deleteApprovalInstance(id) {
  return request.delete(`/approval/instance/${id}`)
}

// PUT /approval/instance/:instanceId/task/:taskId/approve 审批操作（同意；不同意入口下选择退回方式）
export function approveApprovalTask(instanceId, taskId, data) {
  return request.put(`/approval/instance/${instanceId}/task/${taskId}/approve`, data)
}

// PUT /approval/instance/:instanceId/task/:taskId/recall 审核撤回（审批人撤回自己的操作）
export function recallApprovalTask(instanceId, taskId) {
  return request.put(`/approval/instance/${instanceId}/task/${taskId}/recall`)
}

// PUT /approval/instance/:instanceId/task/:taskId/delegate 转交
export function delegateApprovalTask(instanceId, taskId, data) {
  return request.put(`/approval/instance/${instanceId}/task/${taskId}/delegate`, data)
}

// PUT /approval/instance/:instanceId/task/:taskId/add-sign 加签（type: 1-前加签 2-后加签）
export function addSignApprovalTask(instanceId, taskId, data) {
  return request.put(`/approval/instance/${instanceId}/task/${taskId}/add-sign`, data)
}
