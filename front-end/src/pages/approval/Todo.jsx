import { useCallback, useEffect, useState } from 'react'
import { Button, Card, Message, Space, Table } from '@arco-design/web-react'
import { useLocation } from 'react-router-dom'
import * as approvalApi from '../../api/approval'
import { useTabs } from '../../store/tab-context'
import { ApprovalStatusTag } from './approvalStatus.jsx'
import ApprovalDetailDrawer from './ApprovalDetailDrawer'

const PAGE_TITLE = '我的待办'

/** 我的待办：展示当前用户待处理的审批任务（待审核 / 审核中），提供去审批与查看详情 */
export default function Todo() {
  const location = useLocation()
  const { addTab } = useTabs()
  const [list, setList] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(10)
  const [loading, setLoading] = useState(false)
  const [detailRecord, setDetailRecord] = useState(null)

  useEffect(() => {
    addTab({ path: location.pathname, title: PAGE_TITLE })
  }, [location.pathname, addTab])

  const fetchList = useCallback(async () => {
    setLoading(true)
    try {
      const res = await approvalApi.getMyTodo({ page, size })
      setList(res.data?.list || [])
      setTotal(res.data?.total || 0)
    } catch (e) {
      // 错误已在请求层提示
    } finally {
      setLoading(false)
    }
  }, [page, size])

  useEffect(() => {
    fetchList()
  }, [fetchList])

  // 去审批：后续接入审批操作界面（当前占位）
  const handleApprove = (record) => {
    Message.info(`审批功能开发中（${record.item_name || record.name || ''}）`)
  }

  const columns = [
    { title: '申请项名称', dataIndex: 'app_name', render: (v, r) => r.name || v || '-' },
    { title: '申请人', dataIndex: 'applicant_name', render: (v) => v || '-' },
    { title: '申请时间', dataIndex: 'created_at', width: 170 },
    {
      title: '当前状态',
      dataIndex: 'approval_status',
      width: 110,
      render: (v) => <ApprovalStatusTag status={v} />,
    },
    {
      title: '操作',
      key: 'action',
      width: 170,
      render: (_, r) => (
        <Space>
          <Button type="text" size="small" onClick={() => setDetailRecord(r)}>
            查看详情
          </Button>
          <Button type="primary" size="small" onClick={() => handleApprove(r)}>
            去审批
          </Button>
        </Space>
      ),
    },
  ]

  return (
    <Card title={PAGE_TITLE}>
      <Table
        rowKey={(r) => r.data_id ?? r.id}
        columns={columns}
        data={list}
        loading={loading}
        pagination={{
          total,
          current: page,
          pageSize: size,
          showTotal: true,
          sizeCanChange: true,
          onChange: (p, s) => {
            setPage(p)
            setSize(s)
          },
        }}
      />
      <ApprovalDetailDrawer
        record={detailRecord}
        visible={Boolean(detailRecord)}
        onCancel={() => setDetailRecord(null)}
      />
    </Card>
  )
}
