import { Button, Card, Message, Space, Table } from '@arco-design/web-react'
import { useCallback, useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import * as approvalApi from 'src/api/approval'
import { useTabs } from 'src/store/tab-context'
import { ApprovalStatusTag } from 'src/pages/approval/approvalStatus.jsx'
import ApprovalDetailDrawer from 'src/pages/approval/DetailDrawer'

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
      const res = await approvalApi.getApprovalList({ page, size, scope: 'todo' })
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
    {
      title: '序号',
      key: 'index',
      width: 62,
      align: 'center',
      render: (_, __, index) => index + 1,
    },
    { title: '模块', dataIndex: 'app_name', render: (v) => v || '-' },
    { title: '部门', dataIndex: 'dept_name', render: (v) => v || '-' },
    { title: '申请人', dataIndex: 'created_name', render: (v) => v || '-' },
    {
      title: '申请时间',
      dataIndex: 'created_at',
      width: 170,
      render: (v) => v?.slice(0, 19).replace('T', ' ') || '-',
    },
    {
      title: '完成时间',
      dataIndex: 'finished_at',
      width: 170,
      render: (v) => v?.slice(0, 19).replace('T', ' ') || '-',
    },
    {
      title: '状态',
      dataIndex: 'approval_status',
      width: 110,
      render: (v) => <ApprovalStatusTag status={v} />,
    },
    {
      title: '操作',
      key: 'action',
      width: 160,
      render: (_, r) => (
        <Space>
          <Button type="text" size="small" onClick={() => setDetailRecord(r)}>
            详情
          </Button>
          <Button type="primary" size="small" onClick={() => handleApprove(r)}>
            审批
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
