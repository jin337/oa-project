import { Button, Card, Table } from '@arco-design/web-react'
import { useState } from 'react'
import {
  colBillNo,
  colCreatedAt,
  colCreatedName,
  colDept,
  colIndex,
  colItem,
  colNodeName,
  colStatus,
} from 'src/pages/approval/components/approvalColumns'
import CCModal from 'src/pages/approval/components/CCModal'
import ApprovalTableToolbar from 'src/pages/approval/components/ApprovalTableToolbar'
import ApprovalDetailDrawer from 'src/pages/approval/components/DetailDrawer'
import { useApprovalList } from 'src/pages/approval/components/useApprovalList'

const PAGE_TITLE = '我的待办'

// 可配置列 key（操作列固定显示，不参与列设置）
const ALL_COL_KEYS = [
  'index',
  'item_name',
  'node_name',
  'dept_name',
  'created_name',
  'bill_no',
  'created_at',
  'approval_status',
]

/** 我的待办：展示当前用户待处理的审批任务，支持审批/转交/加签/查看详情 */
export default function Todo() {
  const [ccRecord, setCCRecord] = useState(null)
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

  // 待办：点击「模块」列打开详情时需携带当前任务 ID，用于 Drawer 内审批
  const openDetailWithTask = (r) => openDetail(r, { id: r.id, instance_id: r.instance_id })

  const columns = [
    colIndex,
    {
      ...colItem(openDetailWithTask),
      // 待办模块点击要带任务
    },
    colBillNo,
    colDept,
    colNodeName,
    colCreatedName,
    colCreatedAt,
    colStatus,
    {
      title: '操作',
      key: 'action',
      width: 70,
      align: 'center',
      render: (_, r) => (
        <Button type="text" size="small" onClick={() => setCCRecord(r)}>
          抄送
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

      <CCModal record={ccRecord} onClose={() => setCCRecord(null)} onSuccess={fetchList} />
    </Card>
  )
}
