import { Button, Card, Space, Table } from '@arco-design/web-react'
import { ApprovalStatusTag } from 'src/pages/approval/approvalStatus.jsx'
import ApprovalTableToolbar from 'src/pages/approval/ApprovalTableToolbar'
import ApprovalDetailDrawer from 'src/pages/approval/DetailDrawer'
import { useApprovalList } from 'src/pages/approval/useApprovalList'
import { formatTime } from 'src/utils/format'

const PAGE_TITLE = '抄送我的'

// 可配置列 key（操作列固定显示，不参与列设置）
const ALL_COL_KEYS = [
  'index',
  'item_name',
  'dept_name',
  'created_name',
  'created_at',
  'finished_at',
  'approval_status',
]

/** 抄送我的：展示流程中抄送给当前用户的申请记录，只读查看详情 */
export default function ToMe() {
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
  } = useApprovalList('cc', { title: PAGE_TITLE, colKeys: ALL_COL_KEYS })

  const columns = [
    {
      title: '序号',
      key: 'index',
      width: 62,
      align: 'center',
      render: (_, __, index) => index + 1,
    },
    { title: '模块', key: 'item_name', dataIndex: 'item_name', render: (v, r) => v || '-' },
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
      title: '完成时间',
      key: 'finished_at',
      dataIndex: 'finished_at',
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
      width: 110,
      render: (_, r) => (
        <Space>
          <Button type="text" size="small" onClick={() => openDetail(r)}>
            详情
          </Button>
        </Space>
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
        rowKey={(r) => r.data_id ?? r.id}
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
      <ApprovalDetailDrawer
        record={detailRecord}
        visible={Boolean(detailRecord)}
        onCancel={closeDetail}
      />
    </Card>
  )
}
