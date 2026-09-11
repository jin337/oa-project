import { useCallback, useEffect, useState } from 'react'
import { Button, Card, Space, Table } from '@arco-design/web-react'
import { useLocation } from 'react-router-dom'
import * as approvalApi from '../../api/approval'
import { useTabs } from '../../store/tab-context'
import { ApprovalStatusTag } from './approvalStatus.jsx'
import ApprovalDetailDrawer from './ApprovalDetailDrawer'

const PAGE_TITLE = '抄送我的'

/** 抄送我的：展示流程中抄送给当前用户的申请记录 */
export default function ToMe() {
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
      const res = await approvalApi.getMyCc({ page, size })
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

  const columns = [
    { title: '申请项名称', dataIndex: 'item_name', render: (v, r) => r.name || v || '-' },
    { title: '申请人', dataIndex: 'applicant_name', render: (v) => v || '-' },
    { title: '申请时间', dataIndex: 'created_at', width: 170 },
    { title: '抄送时间', dataIndex: 'cc_time', width: 170, render: (v) => v || '-' },
    {
      title: '当前状态',
      dataIndex: 'approval_status',
      width: 110,
      render: (v) => <ApprovalStatusTag status={v} />,
    },
    {
      title: '操作',
      key: 'action',
      width: 110,
      render: (_, r) => (
        <Space>
          <Button type="text" size="small" onClick={() => setDetailRecord(r)}>
            查看详情
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
