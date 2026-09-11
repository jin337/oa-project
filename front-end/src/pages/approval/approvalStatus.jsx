import { Tag } from '@arco-design/web-react'

// 审核状态映射（统一维护：发起 / 待办 / 已办 / 抄送 / 草稿箱等审批列表页共用）
export const APPROVAL_STATUS = {
  0: '草稿',
  1: '待审核',
  2: '审核中',
  3: '已通过',
  4: '不通过',
  5: '已驳回',
  6: '已作废',
  7: '已删除',
}

// 状态 → Tag 颜色（列表 / 详情统一视觉）
export const STATUS_TAG_COLOR = {
  0: 'gray',
  1: 'arcoblue',
  2: 'gold',
  3: 'green',
  4: 'red',
  5: 'orangered',
  6: 'gray',
  7: 'gray',
}

/** 审核状态 Tag：所有审批列表页统一使用，避免重复编写状态映射 */
export function ApprovalStatusTag({ status }) {
  return (
    <Tag color={STATUS_TAG_COLOR[status] || 'gray'}>
      {APPROVAL_STATUS[status] ?? `未知(${status})`}
    </Tag>
  )
}
