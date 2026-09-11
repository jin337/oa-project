import { Descriptions, Drawer } from '@arco-design/web-react'
import { ApprovalStatusTag } from './approvalStatus.jsx'

/** 审批记录详情 Drawer：展示记录基础信息（5 个审批列表页「查看详情」统一复用） */
export default function ApprovalDetailDrawer({ record, visible, onCancel }) {
  if (!record) return null
  const data = [
    { label: '申请项名称', value: record.item_name || record.name || '-' },
    { label: '申请时间', value: record.created_at || '-' },
    { label: '审核状态', value: <ApprovalStatusTag status={record.approval_status} /> },
    { label: '发起人', value: record.applicant_name || record.created_by || '-' },
    { label: '备注', value: record.remark || '-' },
  ]
  return (
    <Drawer width={480} title="审批详情" visible={visible} onCancel={onCancel} footer={null}>
      <Descriptions column={1} data={data} labelStyle={{ width: 90 }} />
    </Drawer>
  )
}
