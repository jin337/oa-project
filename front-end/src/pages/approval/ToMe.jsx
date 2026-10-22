import { Button, Card, Table } from '@arco-design/web-react'
import { useState } from 'react'
import {
  colBillNo,
  colCreatedAt,
  colCreatedName,
  colDept,
  colFinishedAt,
  colIndex,
  colItem,
  colNodeName,
  colStatus,
} from 'src/pages/approval/components/approvalColumns'
import CCModal from 'src/pages/approval/components/CCModal'
import ApprovalTableToolbar from 'src/pages/approval/components/ApprovalTableToolbar'
import ApprovalDetailDrawer from 'src/pages/approval/components/DetailDrawer'
import { useApprovalList } from 'src/pages/approval/components/useApprovalList'

const PAGE_TITLE = '抄送我的'

// 可配置列 key（操作列固定显示，不参与列设置）
const ALL_COL_KEYS = [
  'index',
  'item_name',
  'dept_name',
  'created_name',
  'bill_no',
  'node_name',
  'created_at',
  'finished_at',
  'approval_status',
]

/** 抄送我的：展示流程中抄送给当前用户的申请记录，只读查看详情 */
export default function ToMe() {
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
    colIndex,
    colItem(openDetail),
    colBillNo,
    colDept,
    colNodeName,
    colCreatedName,
    colCreatedAt,
    colFinishedAt,
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

      <CCModal record={ccRecord} onClose={() => setCCRecord(null)} onSuccess={fetchList} />
    </Card>
  )
}
