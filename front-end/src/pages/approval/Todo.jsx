import { Button, Card, Table, Tag } from '@arco-design/web-react'
import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  colBillNo,
  colCreatedAt,
  colCreatedName,
  colDept,
  colIndex,
  colItem,
  colNodeName,
  colStatus,
  colSummarys,
  colTotalmoney,
} from 'src/pages/approval/components/approvalColumns'
import ApprovalTableToolbar from 'src/pages/approval/components/ApprovalTableToolbar'
import CCModal from 'src/pages/approval/components/CCModal'
import ApprovalDetailDrawer from 'src/pages/approval/components/DetailDrawer'
import { useApprovalList } from 'src/pages/approval/components/useApprovalList'

const PAGE_TITLE = '我的待办'

// 可配置列 key（操作列固定显示，不参与列设置）
const ALL_COL_KEYS = [
  'index',
  'item_name',
  'dept_name',
  'bill_no',
  'created_name',
  'created_at',
  'summarys',
  'totalmoney',
  'node_name',
  'approval_status',
  'deadline',
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

  // 从工作台「流程监控」点击跳转而来：自动打开对应详情抽屉（一次性消费 location.state）
  const location = useLocation()
  const navigate = useNavigate()
  useEffect(() => {
    const rec = location.state?.openDetail
    if (rec) {
      // 待办记录 ID 为任务 ID：携带任务参数，Drawer 内可直接审批
      openDetail(rec, { id: rec.id, instance_id: rec.instance_id })
      navigate(location.pathname, { replace: true, state: null })
    }
    // openDetail 为 hook 返回的稳定引用，仅需在 state 变化时触发
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state])

  const columns = [
    colIndex,
    colItem(openDetailWithTask),
    colDept,
    colBillNo,
    colCreatedName,
    colCreatedAt,
    colSummarys,
    colTotalmoney,
    colNodeName,
    colStatus,
    {
      // 待办超时：后端按实例提交时冻结的 taskTimeout 快照计算，前端只做展示
      title: '时限',
      key: 'deadline',
      width: 120,
      render: (_, r) => {
        if (!r.deadline) return '-'
        if (r.overdue) return <Tag color="red">已超时</Tag>
        const hours = Math.ceil((r.remaining_seconds || 0) / 3600)
        return <span>{hours > 0 ? `${hours} 小时后到期` : '即将到期'}</span>
      },
    },
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
        onRow={(r) => ({
          onDoubleClick: () => openDetailWithTask(r),
        })}
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
