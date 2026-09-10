import request from './request'

// 审批流配置接口（按应用隔离）：后端路径假定为 /examine/:appId/flow
// flow 为审批流程节点数组（发起人 / 审批人 / 抄送人 / 条件分支），由 ExamineManage 设计器组装

// GET /examine/:appId/flow 获取指定应用的审批流配置
export function getExamineFlow(appId) {
  return request.get(`/examine/${appId}/flow`)
}

// PUT /examine/:appId/flow 保存审批流配置（body: { flow: [...] }）
export function saveExamineFlow(appId, flow) {
  return request.put(`/examine/${appId}/flow`, { flow })
}
