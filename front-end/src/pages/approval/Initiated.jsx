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

// 撤回：仅「审核中」的实例可撤回（前端业务状态 2 = 审核中）
// 作废/撤回/编辑的可用性以后端返回的能力标记为准（can_void / can_withdraw / can_edit），
// 因为作废额外依赖「有无审批痕迹」，前端无法自行判断
// 删除不在此页提供：仅草稿可删，草稿归草稿箱管理
// 已撤回（业务状态 8）：可编辑，保存后转为草稿，或直接重新提交
const WITHDRAWN_STATUS = 8

// 可配置列 key（操作列固定显示，不参与列设置）
const ALL_COL_KEYS = [
  'index',
  'item_name',
  'dept_name',
  'created_name',
  'bill_no',
  'created_at',
  'finished_at',
  'approval_status',
]

/** 我的发起：展示当前用户发起的所有审批记录（排除草稿），支持查看详情、作废、撤回、已驳回/已撤回编辑 */
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

  // 撤回申请：调用流程实例撤回接口（仅进行中可撤回，落为「已撤回」，保留在我发起）
  const handleWithdraw = async (record) => {
    try {
      await approvalApi.withdrawApprovalInstance(record.instance_id || record.id)
      Message.success('撤回成功')
      fetchList()
    } catch (e) {
      // 错误已在请求层提示
    }
  }

  // 作废申请：仅进行中且无审批痕迹时可作废（后端二次校验），作废后保留记录、显示「已作废」
  const handleVoid = async (record) => {
    try {
      await approvalApi.voidApprovalInstance(record.instance_id || record.id)
      Message.success('作废成功')
      fetchList()
    } catch (e) {
      // 错误已在请求层提示
    }
  }

  // 已撤回编辑：保存修改（后端把实例转为草稿，之后在草稿箱继续完善）
  const handleSaveWithdrawn = async () => {
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
      await approvalApi.saveDraftInstance({
        instance_id: editRecord.instance_id || editRecord.id,
        app_id: editApp.id,
        business_data_id: editRecord.data_id ?? editRecord.id,
        business_data: payload,
      })
      Message.success('保存成功，已转为草稿')
      setEditVisible(false)
      fetchList()
    } catch (e) {
      // 错误已在请求层提示
    } finally {
      setEditSaving(false)
    }
  }

  // 已撤回编辑：直接提交审核（后端支持从「已撤回」提交）
  const handleSubmitWithdrawn = async () => {
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
      const instanceId = editRecord.instance_id || editRecord.id
      // 先保存表单改动，再从草稿提交，保证提交的是最新内容
      await approvalApi.saveDraftInstance({
        instance_id: instanceId,
        app_id: editApp.id,
        business_data_id: editRecord.data_id ?? editRecord.id,
        business_data: payload,
      })
      await approvalApi.submitDraftInstance(instanceId)
      Message.success('已重新提交')
      setEditVisible(false)
      fetchList()
    } catch (e) {
      // 错误已在请求层提示
    } finally {
      setEditSaving(false)
    }
  }

  // 删除：仅草稿可删，而草稿不出现在本页（草稿箱负责），故本页不提供删除入口。
  // 已撤回如需删除，先在编辑抽屉「保存草稿」转为草稿，再到草稿箱删除。

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
      // 未从申请项发起（无 item_name）时回退展示流程配置名称
      render: (v, r) => v || r?.app_name || '-',
    },
    { title: '部门', key: 'dept_name', dataIndex: 'dept_name', render: (v) => v || '-' },
    { title: '申请人', key: 'created_name', dataIndex: 'created_name', render: (v) => v || '-' },
    {
      title: '单号',
      key: 'bill_no',
      dataIndex: 'bill_no',
      width: 200,
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
      width: 120,
      render: (_, r) => (
        <Space>
          <Button type="text" size="small" onClick={() => openDetail(r)}>
            详情
          </Button>
          {/* 撤回：进行中即可（已有审批痕迹时也允许，落为「已撤回」保留在我发起） */}
          {r.can_withdraw && (
            <Popconfirm
              position="lb"
              title="撤回后该申请将标记为已撤回，可继续编辑或重新提交，确定撤回？"
              onOk={() => handleWithdraw(r)}
            >
              <Button type="text" size="small" status="warning">
                撤回
              </Button>
            </Popconfirm>
          )}
          {/* 编辑：已驳回（改完重新提交）/ 已撤回（改完保存或重新提交） */}
          {r.can_edit && (
            <Button type="text" size="small" onClick={() => openRejectedEdit(r)}>
              编辑
            </Button>
          )}
          {/* 作废：仅进行中且无审批痕迹（后端判定），作废后保留记录、置为「已作废」 */}
          {r.can_void && (
            <Popconfirm
              position="lb"
              title="作废后该单据将保留在列表中并标记为已作废，且不可恢复，确定作废？"
              onOk={() => handleVoid(r)}
            >
              <Button type="text" size="small" status="danger">
                作废
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

      {/* 编辑 Drawer：已驳回底部为「重新提交」；已撤回底部为「保存草稿」+「提交审核」 */}
      <Drawer
        width="60%"
        visible={editVisible}
        onCancel={() => setEditVisible(false)}
        title={`编辑 - ${editApp?.item_name || editApp?.name || ''}`}
        unmountOnExit
        footer={
          <div className="flex justify-end gap-2">
            <Button onClick={() => setEditVisible(false)}>取消</Button>
            {Number(editRecord?.approval_status) === WITHDRAWN_STATUS ? (
              <>
                <Button loading={editSaving} onClick={handleSaveWithdrawn}>
                  保存草稿
                </Button>
                <Button type="primary" loading={editSaving} onClick={handleSubmitWithdrawn}>
                  提交审核
                </Button>
              </>
            ) : (
              <Button type="primary" loading={editSaving} onClick={handleResubmit}>
                重新提交
              </Button>
            )}
          </div>
        }
      >
        {editLoading ? (
          <div className="flex h-40 items-center justify-center">
            <Spin />
          </div>
        ) : editApp ? (
          <>
            <DynamicForm
              app={editApp}
              form={editForm}
              pageType="form"
              onValuesChange={setFormValues}
            />
            {/* 审批流只读还原 */}
            <DynamicFlowView raw={editApp?.approval_flow_json} formData={formValues} />
          </>
        ) : null}
      </Drawer>
    </Card>
  )
}
