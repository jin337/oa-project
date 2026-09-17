import { Button, Card, Message, Popconfirm, Space, Table } from '@arco-design/web-react'
import * as approvalApi from 'src/api/approval'
import ApprovalTableToolbar from 'src/pages/approval/ApprovalTableToolbar'
import { ApprovalStatusTag } from 'src/pages/approval/approvalStatus.jsx'
import ApprovalDetailDrawer from 'src/pages/approval/DetailDrawer'
import { useApprovalList } from 'src/pages/approval/useApprovalList'
import { formatTime } from 'src/utils/format'

const PAGE_TITLE = '我的发起'

// 撤回：仅「审核中」状态的实例可撤回（前端业务状态 2 = 审核中）
const WITHDRAWABLE_STATUSES = [2]
// 删除：已终结实例可删除（不通过 / 已驳回）
const DELETABLE_STATUSES = [4, 5]

// 可配置列 key（操作列固定显示，不参与列设置）
const ALL_COL_KEYS = ['index', 'app_name', 'dept_name', 'created_at', 'finished_at', 'approval_status']

/** 我的发起：展示当前用户发起的所有审批记录（排除草稿），支持查看详情、撤回、删除 */
export default function Initiated() {
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
  } = useApprovalList('initiated', { title: PAGE_TITLE, colKeys: ALL_COL_KEYS })

  // 撤回申请：调用流程实例撤回接口（仅进行中状态可撤回，转为草稿）
  const handleWithdraw = async (record) => {
    try {
      await approvalApi.withdrawApprovalInstance(record.instance_id || record.id)
      Message.success('撤回成功，已转为草稿')
      fetchList()
    } catch (e) {
      // 错误已在请求层提示
    }
  }

  // 删除已终结的审批实例（已拒绝/已驳回/已作废/已撤回）
  const handleDelete = async (record) => {
    try {
      await approvalApi.deleteApprovalInstance(record.instance_id || record.id)
      Message.success('删除成功')
      fetchList()
    } catch (e) {
      // 错误已在请求层提示
    }
  }

  const columns = [
    {
      title: '序号',
      key: 'index',
      width: 62,
      align: 'center',
      render: (_, __, index) => index + 1,
    },
    { title: '模块', key: 'app_name', dataIndex: 'app_name', render: (v) => v || '-' },
    { title: '部门', key: 'dept_name', dataIndex: 'dept_name', render: (v) => v || '-' },
    { title: '申请时间', key: 'created_at', dataIndex: 'created_at', width: 170, render: formatTime },
    { title: '完成时间', key: 'finished_at', dataIndex: 'finished_at', width: 170, render: formatTime },
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
      width: 150,
      render: (_, r) => (
        <Space>
          <Button type="text" size="small" onClick={() => openDetail(r)}>
            详情
          </Button>
          {WITHDRAWABLE_STATUSES.includes(r.approval_status) && (
            <Popconfirm position="lb" title="撤回后该申请将转为草稿，确定撤回？" onOk={() => handleWithdraw(r)}>
              <Button type="text" size="small" status="warning">
                撤回
              </Button>
            </Popconfirm>
          )}
          {DELETABLE_STATUSES.includes(r.approval_status) && (
            <Popconfirm position="lb" title="确定删除该审批记录吗？" onOk={() => handleDelete(r)}>
              <Button type="text" size="small" status="danger">
                删除
              </Button>
            </Popconfirm>
          )}
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
        rowKey={(r) => r.instance_id ?? r.id}
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
