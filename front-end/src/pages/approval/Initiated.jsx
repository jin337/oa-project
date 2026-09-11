import { Button, Card, Message, Popconfirm, Space, Table } from '@arco-design/web-react'
import { useCallback, useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import * as applicationApi from '../../api/application'
import * as approvalApi from '../../api/approval'
import { useTabs } from '../../store/tab-context'
import ApprovalDetailDrawer from './ApprovalDetailDrawer'
import { ApprovalStatusTag } from './approvalStatus.jsx'

const PAGE_TITLE = '我的发起'

/** 我的发起：展示当前用户发起的所有审批记录（排除草稿），支持查看详情与撤回申请 */
export default function Initiated() {
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
      const res = await approvalApi.getMyInitiated({ page, size })
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

  // 撤回申请：审核状态流转回草稿（仅待审核 / 审核中可撤回）
  const handleWithdraw = async (record) => {
    try {
      await applicationApi.updateApplicationDataApproval(
        record.app_id,
        record.data_id ?? record.id,
        0,
      )
      Message.success('撤回成功，已转为草稿')
      fetchList()
    } catch (e) {
      // 错误已在请求层提示
    }
  }

  const columns = [
    { title: '申请项名称', dataIndex: 'app_name' },
    { title: '申请时间', dataIndex: 'created_at', width: 170 },
    {
      title: '审核状态',
      dataIndex: 'approval_status',
      width: 110,
      render: (v) => <ApprovalStatusTag status={v} />,
    },
    {
      title: '操作',
      key: 'action',
      width: 180,
      render: (_, r) => (
        <Space>
          <Button type="text" size="small" onClick={() => setDetailRecord(r)}>
            查看详情
          </Button>
          {[1, 2].includes(r.approval_status) && (
            <Popconfirm title="撤回后该申请将转为草稿，确定撤回？" onOk={() => handleWithdraw(r)}>
              <Button type="text" size="small" status="danger">
                撤回申请
              </Button>
            </Popconfirm>
          )}
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
