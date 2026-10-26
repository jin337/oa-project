import { Button, Typography } from '@arco-design/web-react'
import { ApprovalStatusTag } from 'src/pages/approval/components/approvalStatus.jsx'
import { formatTime } from 'src/utils/format'

/**
 * 审批列表通用列定义工厂。
 * 待办 / 发起 / 已办 / 抄送我的 4 个列表共用同一组字段展示逻辑，
 * 各页面按需挑选、追加自己的「操作」列即可。
 *
 * openDetail(record) 由列表页注入：点击「模块」列打开详情抽屉。
 */

// 序号列
export const colIndex = {
  title: '序号',
  key: 'index',
  width: 62,
  align: 'center',
  render: (_, __, index) => index + 1,
}

// 模块列（点击打开详情）
export const colItem = (openDetail) => ({
  title: '模块',
  key: 'item_name',
  dataIndex: 'item_name',
  // 未从申请项发起（无 item_name）时回退展示流程配置名称
  render: (v, r) => (
    <Button type="text" size="small" className="-ml-4!" onClick={() => openDetail(r)}>
      {v || r?.app_name || '-'}
    </Button>
  ),
})

// 单号列
export const colBillNo = {
  title: '单号',
  key: 'bill_no',
  dataIndex: 'bill_no',
  width: 200,
  render: (v) => <Typography.Text copyable={v}>{v || '-'}</Typography.Text>,
}

// 部门列
export const colDept = {
  title: '部门',
  key: 'dept_name',
  dataIndex: 'dept_name',
  width: 110,
  render: (v) => v || '-',
}

// 申请人列
export const colCreatedName = {
  title: '申请人',
  key: 'created_name',
  dataIndex: 'created_name',
  width: 110,
  render: (v) => v || '-',
}

// 抄送人列（抄送我的列表：发起本次抄送的人）
export const colCCByName = {
  title: '抄送人',
  key: 'cc_by_name',
  dataIndex: 'cc_by_name',
  width: 110,
  render: (v) => v || '-',
}

// 审批节点（当前处理人）列
export const colNodeName = {
  title: '审批节点',
  key: 'node_name',
  dataIndex: 'node_name',
  width: 110,
  render: (v) => v || '-',
}

// 申请时间列
export const colCreatedAt = {
  title: '申请时间',
  key: 'created_at',
  dataIndex: 'created_at',
  width: 180,
  render: formatTime,
}

// 完成时间列
export const colFinishedAt = {
  title: '完成时间',
  key: 'finished_at',
  dataIndex: 'finished_at',
  width: 180,
  render: formatTime,
}

// 状态列
export const colStatus = {
  title: '状态',
  key: 'approval_status',
  dataIndex: 'approval_status',
  width: 90,
  align: 'center',
  render: (v) => <ApprovalStatusTag status={v} />,
}
