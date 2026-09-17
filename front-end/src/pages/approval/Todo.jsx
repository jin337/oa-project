import { Button, Card, Space, Table } from '@arco-design/web-react'
import { useCallback, useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import * as approvalApi from 'src/api/approval'
import { ApprovalStatusTag } from 'src/pages/approval/approvalStatus.jsx'
import ApprovalDetailDrawer from 'src/pages/approval/DetailDrawer'
import { useTabs } from 'src/store/tab-context'

const PAGE_TITLE = '我的待办'

/** 我的待办：展示当前用户待处理的审批任务，支持审批/转交/加签/查看详情 */
export default function Todo() {
  const location = useLocation()
  const { addTab } = useTabs()
  const [list, setList] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(10)
  const [loading, setLoading] = useState(false)

  // 详情 Drawer（集成审批/转交/加签等全部操作）
  const [detailRecord, setDetailRecord] = useState(null)
  const [currentTask, setCurrentTask] = useState(null)

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

  // 打开详情（带审批操作）
  const handleOpenDetail = (record) => {
    setDetailRecord(record)
    setCurrentTask({ id: record.id, instance_id: record.instance_id })
  }

  // 关闭详情
  const handleCloseDetail = () => {
    setDetailRecord(null)
    setCurrentTask(null)
  }

  // 操作成功后刷新列表
  const handleAction = () => {
    fetchList()
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
    { title: '审批节点', dataIndex: 'node_name', render: (v) => v || '-' },
    { title: '部门', dataIndex: 'dept_name', render: (v) => v || '-' },
    { title: '申请人', dataIndex: 'created_name', render: (v) => v || '-' },
    {
      title: '申请时间',
      dataIndex: 'created_at',
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
      width: 90,
      render: (_, r) => (
        <Button type="primary" size="small" onClick={() => handleOpenDetail(r)}>
          审批
        </Button>
      ),
    },
  ]

  return (
    <Card title={PAGE_TITLE}>
      <Table
        rowKey={(r) => r.instance_id ? `${r.instance_id}_${r.id}` : r.id}
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

      {/* 详情 Drawer（集成同意/拒绝/撤回操作） */}
      <ApprovalDetailDrawer
        record={detailRecord}
        visible={Boolean(detailRecord)}
        onCancel={handleCloseDetail}
        currentTask={currentTask}
        onAction={handleAction}
      />


    </Card>
  )
}
