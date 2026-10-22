import { Button, Card, Message, Table } from '@arco-design/web-react'
import { useState } from 'react'
import * as approvalApi from 'src/api/approval'
import { PersonSelectModalWithData } from 'src/components/PersonSelectModalWithData'
import { userIdFromKey } from 'src/pages/application/examine/flowModel'
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
  'bill_no',
  'created_at',
  'node_name',
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
    {
      title: '序号',
      key: 'index',
      width: 62,
      align: 'center',
      render: (_, __, index) => index + 1,
    },
    {
      title: '模块',
      key: 'item_name',
      dataIndex: 'item_name',
      // 未从申请项发起（无 item_name）时回退展示流程配置名称；点击模块名打开详情抽屉
      render: (v, r) => (
        <Button type="text" size="small" className="-ml-4!" onClick={() => openDetail(r)}>
          {v || r?.app_name || '-'}
        </Button>
      ),
    },
    {
      title: '单号',
      key: 'bill_no',
      dataIndex: 'bill_no',
      width: 200,
      render: (v) => v || '-',
    },
    {
      title: '部门',
      key: 'dept_name',
      dataIndex: 'dept_name',
      width: 110,
      render: (v) => v || '-',
    },
    {
      title: '申请人',
      key: 'created_name',
      dataIndex: 'created_name',
      width: 110,
      render: (v) => v || '-',
    },
    {
      title: '审批节点',
      key: 'node_name',
      dataIndex: 'node_name',
      width: 110,
      render: (v) => v || '-',
    },
    {
      title: '申请时间',
      key: 'created_at',
      dataIndex: 'created_at',
      width: 180,
      render: formatTime,
    },
    {
      title: '完成时间',
      key: 'finished_at',
      dataIndex: 'finished_at',
      width: 180,
      render: formatTime,
    },
    {
      title: '状态',
      key: 'approval_status',
      dataIndex: 'approval_status',
      width: 90,
      align: 'center',
      render: (v) => <ApprovalStatusTag status={v} />,
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

      {/* 抄送人员选择：多选组织架构用户 */}
      {ccRecord && (
        <PersonSelectModalWithData
          title="选择抄送人"
          selectMode={2}
          onChange={async (items) => {
            const userIds = items?.map((it) => userIdFromKey(it?.key)).filter(Boolean)
            if (!userIds?.length) {
              Message.warning('请选择至少一位抄送人')
              return
            }
            try {
              await approvalApi.manualCCApprovalInstance(
                ccRecord.instance_id || ccRecord.id,
                userIds,
              )
              Message.success('已发送抄送')
              setCCRecord(null)
            } catch (e) {
              // 错误已在请求层提示
            }
          }}
          onCancel={() => setCCRecord(null)}
        />
      )}
    </Card>
  )
}
