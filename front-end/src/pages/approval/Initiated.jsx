import {
  Button,
  Card,
  Drawer,
  Form,
  Message,
  Popconfirm,
  Space,
  Spin,
  Table,
} from '@arco-design/web-react'
import { useState } from 'react'
import * as approvalApi from 'src/api/approval'
import DynamicFlowView from 'src/pages/application/dynamic/DynamicFlowView'
import DynamicForm, {
  parseLayoutJson,
  serializeTimeFields,
} from 'src/pages/application/dynamic/DynamicForm'
import { ApprovalStatusTag } from 'src/pages/approval/approvalStatus.jsx'
import ApprovalTableToolbar from 'src/pages/approval/ApprovalTableToolbar'
import ApprovalDetailDrawer from 'src/pages/approval/DetailDrawer'
import { useApprovalList } from 'src/pages/approval/useApprovalList'
import { formatTime } from 'src/utils/format'

const PAGE_TITLE = '我的发起'

// 撤回：仅「审核中」状态的实例可撤回（前端业务状态 2 = 审核中）
const WITHDRAWABLE_STATUSES = [2]
// 删除：已终结实例可删除（不通过 / 已驳回）
const DELETABLE_STATUSES = [4, 5]
// 已驳回（业务状态 5）：可编辑后重新提交
const REJECTED_STATUS = 5

// 可配置列 key（操作列固定显示，不参与列设置）
const ALL_COL_KEYS = ['index', 'item_name', 'dept_name', 'created_at', 'finished_at', 'approval_status']

/** 我的发起：展示当前用户发起的所有审批记录（排除草稿），支持查看详情、撤回、删除、已驳回重新提交 */
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

  // 已驳回编辑 Drawer（仿草稿箱编辑）：打开完整动态表单 + 审批流，底部"重新提交"
  const [editVisible, setEditVisible] = useState(false)
  const [editLoading, setEditLoading] = useState(false)
  const [editSaving, setEditSaving] = useState(false)
  const [editApp, setEditApp] = useState(null)
  const [editRecord, setEditRecord] = useState(null)
  const [editForm] = Form.useForm()
  const [formValues, setFormValues] = useState({})

  // 打开已驳回编辑 Drawer：加载实例详情回填动态表单（参考草稿箱 openDraftEdit）
  const openRejectedEdit = async (record) => {
    setEditRecord(record)
    setEditVisible(true)
    setEditLoading(true)
    setEditApp(null)
    editForm.resetFields()
    try {
      const res = await approvalApi.getApprovalInstanceDetail(record.instance_id || record.id)
      const inst = res.data
      setEditApp({
        id: inst.app_id,
        name: inst.app_name,
        form_layout_json: inst.form_layout_json,
        approval_flow_json: inst.approval_flow_json,
      })
      const bizData = inst.business_data || {}
      editForm.setFieldsValue(bizData)
      setFormValues(bizData)
    } catch (e) {
      Message.error('数据加载失败，请稍后重试')
      setEditVisible(false)
    } finally {
      setEditLoading(false)
    }
  }

  // 重新提交：收集表单数据，调 resubmit 接口从驳回节点继续审批
  const handleResubmit = async () => {
    let values
    try {
      values = await editForm.validate()
    } catch (e) {
      return
    }
    setEditSaving(true)
    try {
      const layout = parseLayoutJson(editApp?.form_layout_json)
      const payload = serializeTimeFields(values, layout?.elements || [])
      await approvalApi.resubmitApprovalInstance(editRecord.instance_id || editRecord.id, payload)
      Message.success('已重新提交')
      setEditVisible(false)
      fetchList()
    } catch (e) {
      // 错误已在请求层提示
    } finally {
      setEditSaving(false)
    }
  }

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
    { title: '模块', key: 'item_name', dataIndex: 'item_name', render: (v) => v || '-' },
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
      width: 60,
      render: (_, r) => (
        <Space>
          <Button type="text" size="small" onClick={() => openDetail(r)}>
            详情
          </Button>
          {/* 已驳回：编辑后重新提交（参考草稿箱编辑 Drawer，底部为"重新提交"） */}
          {Number(r.approval_status) === REJECTED_STATUS && (
            <Button type="text" size="small" onClick={() => openRejectedEdit(r)}>
              编辑
            </Button>
          )}
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

      {/* 详情 Drawer（只读查看） */}
      <ApprovalDetailDrawer
        record={detailRecord}
        visible={Boolean(detailRecord)}
        onCancel={closeDetail}
      />

      {/* 已驳回编辑 Drawer（仿草稿箱编辑，底部"重新提交"） */}
      <Drawer
        width="50%"
        visible={editVisible}
        onCancel={() => setEditVisible(false)}
        title={`编辑 - ${editApp?.item_name || editApp?.name || ''}`}
        unmountOnExit
        footer={
          <div className="flex justify-end gap-2">
            <Button onClick={() => setEditVisible(false)}>取消</Button>
            <Button type="primary" loading={editSaving} onClick={handleResubmit}>
              重新提交
            </Button>
          </div>
        }
      >
        {editLoading ? (
          <div className="flex h-40 items-center justify-center">
            <Spin />
          </div>
        ) : editApp ? (
          <>
            <DynamicForm app={editApp} form={editForm} pageType="form" onValuesChange={setFormValues} />
            {/* 审批流只读还原 */}
            <DynamicFlowView
              raw={editApp?.approval_flow_json}
              formData={formValues}
            />
          </>
        ) : null}
      </Drawer>
    </Card>
  )
}
