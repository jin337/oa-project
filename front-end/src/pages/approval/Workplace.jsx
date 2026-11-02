import { Button, Card, Message, Modal, Space, Table } from '@arco-design/web-react'
import { useState } from 'react'
import * as approvalApi from 'src/api/approval'
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
import ApprovalTableToolbar from 'src/pages/approval/components/ApprovalTableToolbar'
import CCModal from 'src/pages/approval/components/CCModal'
import ApprovalDetailDrawer from 'src/pages/approval/components/DetailDrawer'
import { useApprovalList } from 'src/pages/approval/components/useApprovalList'

const PAGE_TITLE = '经我处理'

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

/** 经我处理：展示当前用户已处理完毕的历史审批记录，只读查看详情 */
export default function Workplace() {
  const [ccRecord, setCCRecord] = useState(null)
  const [recalling, setRecalling] = useState(false)
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
  } = useApprovalList('approved', { title: PAGE_TITLE, colKeys: ALL_COL_KEYS })

  // 审核撤回：确认后调用接口并刷新列表（仅本人操作、窗口内、最后一次操作时后端才放行）
  const handleRecall = (r) => {
    Modal.confirm({
      title: '撤回审批操作',
      content: `确定撤回本次审批操作吗？撤回后任务将恢复待处理，可重新审批。`,
      okText: '确认撤回',
      cancelText: '取消',
      onOk: async () => {
        setRecalling(true)
        try {
          await approvalApi.recallApprovalTask(r.instance_id, r.recall_task_id)
          Message.success('撤回成功')
          fetchList()
        } catch {
          // 错误已在请求层提示
        } finally {
          setRecalling(false)
        }
      },
    })
  }

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
        <Space>
          {r.can_recall && r.recall_task_id && (
            <Button
              type="text"
              size="small"
              status="warning"
              loading={recalling}
              onClick={() => handleRecall(r)}
            >
              撤回
            </Button>
          )}
          <Button type="text" size="small" onClick={() => setCCRecord(r)}>
            抄送
          </Button>
        </Space>
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
        rowKey={(r) => r.id ?? r.data_id}
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
          onDoubleClick: () => openDetail(r),
        })}
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
