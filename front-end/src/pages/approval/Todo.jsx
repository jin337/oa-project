import { Button, Card, Table } from '@arco-design/web-react'
import * as approvalApi from 'src/api/approval'
import ApprovalTableToolbar from 'src/pages/approval/ApprovalTableToolbar'
import { ApprovalStatusTag } from 'src/pages/approval/approvalStatus.jsx'
import ApprovalDetailDrawer from 'src/pages/approval/DetailDrawer'
import { useApprovalList } from 'src/pages/approval/useApprovalList'
import { formatTime } from 'src/utils/format'

const PAGE_TITLE = '我的待办'

// 可配置列 key（操作列固定显示，不参与列设置）
const ALL_COL_KEYS = ['index', 'app_name', 'node_name', 'dept_name', 'created_name', 'created_at', 'approval_status']

/** 我的待办：展示当前用户待处理的审批任务，支持审批/转交/加签/查看详情 */
export default function Todo() {
  const {
    list,
    total,
    page,
    size,
    loading,
    setPage,
    setSize,
    fetchList,
    detailRecord,
    currentTask,
    openDetail,
    closeDetail,
    keyword,
    setKeyword,
    handleSearch,
    handleReset,
    tableSize,
    visibleCols,
    setVisibleCols,
    sizeMenu,
  } = useApprovalList('todo', { title: PAGE_TITLE, withTask: true, colKeys: ALL_COL_KEYS })

  const columns = [
    {
      title: '序号',
      key: 'index',
      width: 62,
      align: 'center',
      render: (_, __, index) => index + 1,
    },
    { title: '模块', key: 'app_name', dataIndex: 'app_name', render: (v) => v || '-' },
    { title: '审批节点', key: 'node_name', dataIndex: 'node_name', render: (v) => v || '-' },
    { title: '部门', key: 'dept_name', dataIndex: 'dept_name', render: (v) => v || '-' },
    { title: '申请人', key: 'created_name', dataIndex: 'created_name', render: (v) => v || '-' },
    {
      title: '申请时间',
      key: 'created_at',
      dataIndex: 'created_at',
      width: 170,
      render: formatTime,
    },
    {
      title: '状态',
      key: 'approval_status',
      dataIndex: 'approval_status',
      width: 110,
      render: (v) => <ApprovalStatusTag status={v} />,
    },
    {
      title: '操作',
      key: 'action',
      width: 90,
      render: (_, r) => (
        <Button type="primary" size="small" onClick={() => openDetail(r, { id: r.id, instance_id: r.instance_id })}>
          审批
        </Button>
      ),
    },
  ]

  // 操作列固定显示，其余按 visibleCols 过滤
  const visibleColumns = columns.filter((c) => c.key === 'action' || visibleCols.includes(c.key))

  return (
    <Card title={PAGE_TITLE}>
      <ApprovalTableToolbar
        keyword={keyword}
        setKeyword={setKeyword}
        onSearch={handleSearch}
        onReset={handleReset}
        onRefresh={fetchList}
        sizeMenu={sizeMenu}
        visibleCols={visibleCols}
        setVisibleCols={setVisibleCols}
        columns={columns}
        colKeys={ALL_COL_KEYS}
      />
      <Table
        rowKey={(r) => (r.instance_id ? `${r.instance_id}_${r.id}` : r.id)}
        columns={visibleColumns}
        data={list}
        loading={loading}
        size={tableSize}
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

      {/* 详情 Drawer（集成同意/拒绝/转交/加签操作） */}
      <ApprovalDetailDrawer
        record={detailRecord}
        visible={Boolean(detailRecord)}
        onCancel={closeDetail}
        currentTask={currentTask}
        onAction={fetchList}
      />
    </Card>
  )
}
