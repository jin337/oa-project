import {
  Button,
  Card,
  Drawer,
  Dropdown,
  Form,
  Menu,
  Message,
  Modal,
  Spin,
  Table,
} from '@arco-design/web-react'
import { IconDoubleLeft, IconDoubleRight, IconDown } from '@arco-design/web-react/icon'
import { useState } from 'react'
import * as approvalApi from 'src/api/approval'
import { PersonSelectModalWithData } from 'src/components/PersonSelectModalWithData'
import DynamicFlowView from 'src/pages/application/dynamic/DynamicFlowView'
import DynamicForm, {
  parseLayoutJson,
  runOnSubmitAfter,
  runOnSubmitBefore,
  serializeTimeFields,
} from 'src/pages/application/dynamic/DynamicForm'
import { buildSelfSelectUserIDs, userIdFromKey } from 'src/pages/application/examine/flowModel'
import { ApprovalStatusTag } from 'src/pages/approval/approvalStatus.jsx'
import ApprovalTableToolbar from 'src/pages/approval/ApprovalTableToolbar'
import ApprovalDetailDrawer from 'src/pages/approval/DetailDrawer'
import { useApprovalList } from 'src/pages/approval/useApprovalList'
import { formatTime } from 'src/utils/format'

const PAGE_TITLE = '我的发起'

// 撤回：仅「审核中」的实例可撤回（前端业务状态 2 = 审核中）
// 作废/撤回/编辑的可用性以后端返回的能力标记为准（can_void / can_withdraw / can_edit），
// 前端不自行判断状态：审核中只能撤回，作废仅「已撤回」可用
// 删除不在此页提供：仅草稿可删，草稿归草稿箱管理
// 已撤回（业务状态 8）：可编辑，保存后转为草稿，或直接重新提交
// 副本：任何状态都可复制，复制出的数据就地填进申请抽屉，是否提交由用户决定
const WITHDRAWN_STATUS = 8

// 副本回填时要剥掉的字段（后端新建业务行时本就会跳过这些列，这里清掉是为了让提交的 payload 干净、
// 且绝不误用原单的行）：
// - bill_no：单号。后端 ensureBillNo 见到已有单号会直接复用（为重复提交、撤回后重新提交做的幂等），
//   若跟着复制过去，副本会与原单重号，必须让副本重新取号
// - id / parent_id / 审计字段：行主键与后端自动维护的字段
const COPY_STRIP_FIELDS = [
  'id',
  'parent_id',
  'bill_no',
  'deleted_at',
  'created_at',
  'created_by',
  'updated_at',
  'updated_by',
]

/** 副本回填：主表字段与子表行都剥掉 COPY_STRIP_FIELDS（附件等数组里没有这些字段，原样保留） */
function stripCopyFields(bizData) {
  const result = { ...bizData }
  COPY_STRIP_FIELDS.forEach((field) => delete result[field])
  Object.keys(result).forEach((key) => {
    const value = result[key]
    if (!Array.isArray(value)) return
    result[key] = value.map((row) => {
      if (!row || typeof row !== 'object' || Array.isArray(row)) return row
      const clean = { ...row }
      COPY_STRIP_FIELDS.forEach((field) => delete clean[field])
      return clean
    })
  })
  return result
}

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

// 撤回时间窗：提交后 30 分钟内可撤回（与后端 ApprovalInstanceWithdraw 校验一致）
const WITHDRAW_WINDOW_MS = 30 * 60 * 1000
function isWithinWithdrawWindow(record) {
  if (!record?.created_at) return true
  const t = new Date(record.created_at).getTime()
  if (Number.isNaN(t)) return true
  return Date.now() - t <= WITHDRAW_WINDOW_MS
}

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

  // 将草稿暂存的自选成员（nodeId -> [{ type, key, label }]）注入审批流节点 members，供 DynamicFlowView 展示已选人
  const injectDraftMembers = (flowSnapshot, membersMap) => {
    let nodes = flowSnapshot
    if (typeof flowSnapshot === 'string' && flowSnapshot) {
      try {
        nodes = JSON.parse(flowSnapshot)
      } catch {
        return flowSnapshot
      }
    }
    if (!Array.isArray(nodes)) return flowSnapshot
    const walk = (list) =>
      (list || []).map((n) => {
        const node = { ...n }
        if (membersMap[node.id]) {
          node.members = [...membersMap[node.id]]
        }
        if (n.type === 4 && Array.isArray(n.branches)) {
          node.branches = n.branches.map((b) => ({ ...b, children: walk(b && b.children) }))
        }
        return node
      })
    return walk(nodes)
  }

  // 已驳回编辑 Drawer（仿草稿箱编辑）：打开完整动态表单 + 审批流，底部"重新提交"
  const [editVisible, setEditVisible] = useState(false)
  const [editLoading, setEditLoading] = useState(false)
  const [editSaving, setEditSaving] = useState(false)
  const [editApp, setEditApp] = useState(null)
  const [editRecord, setEditRecord] = useState(null)
  const [editForm] = Form.useForm()
  const [formValues, setFormValues] = useState({})

  // 副本模式：抽屉里装的是复制出来的数据，不与任何实例绑定，提交时才真正创建新记录。
  // 底部因此给「保存草稿 / 提交审核」，直接关掉抽屉即等于不提交，原单不受影响。
  const [copyMode, setCopyMode] = useState(false)
  const [selfSelectMembers, setSelfSelectMembers] = useState({})
  const [selfSelectReady, setSelfSelectReady] = useState(true)
  const [flowCollapsed, setFlowCollapsed] = useState(false)

  // 关闭抽屉：一并退出副本模式并清掉自选人员，避免下一次「编辑」沿用副本的底部按钮
  const closeEditDrawer = () => {
    setEditVisible(false)
    setCopyMode(false)
    setSelfSelectMembers({})
    setSelfSelectReady(true)
  }

  // 打开已驳回/已撤回编辑 Drawer：加载实例详情回填动态表单，
  // 并从 approval_draft_members 恢复发起人自选审批人/抄送人（已撤回后由后端回写），
  // 避免抽屉打开即丢失已选人员、保存时被清空。
  const openRejectedEdit = async (record) => {
    setCopyMode(false)
    setEditRecord(record)
    setEditVisible(true)
    setEditLoading(true)
    setEditApp(null)
    setSelfSelectMembers({})
    setSelfSelectReady(true)
    editForm.resetFields()
    try {
      const res = await approvalApi.getApprovalInstanceDetail(record.instance_id || record.id)
      const inst = res.data
      // 从草稿暂存恢复自选成员：nodeId -> [userId] -> nodeId -> [{type,key,label}]
      const draftMembers = inst.approval_draft_members || {}
      const nameMap = inst.assignee_name_map || {}
      const selfSel = {}
      Object.entries(draftMembers).forEach(([nodeId, ids]) => {
        selfSel[nodeId] = (Array.isArray(ids) ? ids : []).map((uid) => ({
          type: 1,
          key: `user_${uid}`,
          label: nameMap[String(uid)] || `用户${uid}`,
        }))
      })
      setSelfSelectMembers(selfSel)
      setEditApp({
        id: inst.app_id,
        name: inst.app_name,
        form_layout_json: inst.form_layout_json,
        approval_flow_json: injectDraftMembers(inst.approval_flow_json, selfSel),
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

  // 打开副本抽屉：拉原单详情 → 剥掉行主键/单号/审计字段 → 就地回填动态表单。
  // 抽屉不与原单绑定，用户改完自行决定「保存草稿」还是「提交审核」，直接关掉则什么也不产生。
  const openCopy = async (record) => {
    setCopyMode(true)
    setEditRecord(record)
    setEditVisible(true)
    setEditLoading(true)
    setEditApp(null)
    setSelfSelectMembers({})
    setSelfSelectReady(true)
    editForm.resetFields()
    setFormValues({})
    try {
      const res = await approvalApi.getApprovalInstanceDetail(record.instance_id || record.id)
      const inst = res.data
      setEditApp({
        id: inst.app_id,
        name: inst.app_name,
        form_layout_json: inst.form_layout_json,
        approval_flow_json: inst.approval_flow_json,
      })
      const bizData = stripCopyFields(inst.business_data || {})
      editForm.setFieldsValue(bizData)
      setFormValues(bizData)
    } catch (e) {
      Message.error('数据加载失败，请稍后重试')
      closeEditDrawer()
    } finally {
      setEditLoading(false)
    }
  }

  // 副本：保存草稿（新建业务数据 + 草稿实例，落在草稿箱，之后可继续编辑或提交）
  const handleCopySaveDraft = async () => {
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
      const selfSelectUserIDs = buildSelfSelectUserIDs(selfSelectMembers)
      await approvalApi.saveDraftInstance({
        app_id: editApp.id,
        business_data: payload,
        approval_draft_members: Object.keys(selfSelectUserIDs).length
          ? selfSelectUserIDs
          : undefined,
      })
      Message.success('草稿保存成功，可在草稿箱继续编辑')
      closeEditDrawer()
      fetchList()
    } catch (e) {
      // 错误已在请求层提示
    } finally {
      setEditSaving(false)
    }
  }

  // 副本：提交审核（新建一条记录，原单不受任何影响）
  const handleCopySubmit = async () => {
    if (!selfSelectReady) {
      Message.error('请先为自选的审批人/抄送人节点选择人员后再提交')
      return
    }
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
      const selfSelectUserIDs = buildSelfSelectUserIDs(selfSelectMembers)
      await approvalApi.createApprovalInstance({
        app_id: editApp.id,
        business_data: payload,
        approval_draft_members: Object.keys(selfSelectUserIDs).length
          ? selfSelectUserIDs
          : undefined,
      })
      Message.success('提交成功')
      closeEditDrawer()
      fetchList()
    } catch (e) {
      // 错误已在请求层提示
    } finally {
      setEditSaving(false)
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

  // 作废申请：仅「已撤回」可作废（后端二次校验），作废后保留记录、显示「已作废」
  const handleVoid = async (record) => {
    try {
      await approvalApi.voidApprovalInstance(record.instance_id || record.id)
      Message.success('作废成功')
      fetchList()
    } catch (e) {
      // 错误已在请求层提示
    }
  }

  // 抄送：弹出人员选择器（多选），选中后调用接口抄送给指定用户
  const [ccRecord, setCCRecord] = useState(null)
  const openCC = (record) => setCCRecord(record)
  const closeCC = () => setCCRecord(null)

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
      // 抽屉内本次选择/调整的自选审批人、抄送人随保存一起带上，避免与界面展示不一致
      const selfSelectUserIDs = buildSelfSelectUserIDs(selfSelectMembers)
      await approvalApi.saveDraftInstance({
        instance_id: editRecord.instance_id || editRecord.id,
        app_id: editApp.id,
        business_data_id: editRecord.data_id ?? editRecord.id,
        business_data: payload,
        ...(Object.keys(selfSelectUserIDs).length
          ? { approval_draft_members: selfSelectUserIDs }
          : {}),
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

  // 已撤回编辑：直接提交审核（一步完成，不再先调 /draft 落库）
  const handleSubmitWithdrawn = async () => {
    if (!selfSelectReady) {
      Message.error('请先为自选的审批人/抄送人节点选择人员后再提交')
      return
    }
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
      const formConfig = layout?.formConfig || {}
      // 提交前事件
      const ok = await runOnSubmitBefore(formConfig, payload)
      if (!ok) {
        Message.info('表单提交前事件已拦截本次提交')
        return
      }
      const instanceId = editRecord.instance_id || editRecord.id
      const selfSelectUserIDs = buildSelfSelectUserIDs(selfSelectMembers)
      const res = await approvalApi.submitDraftInstance(instanceId, {
        business_data: payload,
        ...(Object.keys(selfSelectUserIDs).length
          ? { approval_draft_members: selfSelectUserIDs }
          : {}),
      })
      // 提交成功后事件
      await runOnSubmitAfter(formConfig, payload, res?.data)
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
      // 未从申请项发起（无 item_name）时回退展示流程配置名称；点击模块名打开详情抽屉
      render: (v, r) => (
        <Button
          type="text"
          size="small"
          className="-ml-4!"
          onClick={() => (r.can_edit ? openRejectedEdit(r) : openDetail(r))}
        >
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
      width: 90,
      align: 'center',
      render: (_, r) => {
        // 操作项定义：key / 文案 / 是否可用 / 点击动作；需要二次确认的项带 confirmText
        const defs = [
          {
            key: 'withdraw',
            label: '撤回',
            visible: r.can_withdraw && isWithinWithdrawWindow(r),
            confirmText: '撤回后该申请将标记为已撤回，可继续编辑或重新提交，确定撤回？',
            onClick: () => handleWithdraw(r),
          },
          {
            key: 'void',
            label: '作废',
            visible: r.can_void,
            confirmText: '作废后该单据将保留在列表中并标记为已作废，且不可恢复，确定作废？',
            onClick: () => handleVoid(r),
          },
          { key: 'copy', label: '副本', onClick: () => openCopy(r) },
          { key: 'cc', label: '抄送', onClick: () => openCC(r) },
        ].filter((d) => d.visible !== false)
        if (!defs.length) return '-'
        const menu = (
          <Menu
            style={{ width: 60 }}
            onClickMenuItem={(key) => {
              const d = defs.find((it) => it.key === key)
              if (!d) return
              if (d.confirmText) {
                Modal.confirm({
                  title: '操作确认',
                  content: d.confirmText,
                  okText: '确定',
                  cancelText: '取消',
                  onOk: () => d.onClick?.(),
                })
                return
              }
              d.onClick?.()
            }}
          >
            {defs?.map((d) => (
              <Menu.Item key={d.key}>{d.label}</Menu.Item>
            ))}
          </Menu>
        )
        return (
          <Dropdown trigger="click" position="br" droplist={menu}>
            <Button size="mini" type="text">
              操作 <IconDown />
            </Button>
          </Dropdown>
        )
      },
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

      {/* 编辑/副本 Drawer（共用一套表单）：副本底部为「保存草稿」+「提交审核」，关掉即不提交；
          已撤回底部为「保存草稿」+「提交审核」；已驳回底部为「重新提交」 */}
      <Drawer
        className="[&_.arco-drawer-content]:p-0!"
        width="80%"
        visible={editVisible}
        onCancel={closeEditDrawer}
        title={`${editApp?.item_name || editApp?.name || ''}${copyMode ? '-副本' : ''}`}
        unmountOnExit
        maskClosable={false}
        footer={
          <div className="flex justify-end gap-2">
            {copyMode ? (
              <>
                <Button type="primary" loading={editSaving} onClick={handleCopySubmit}>
                  提交审核
                </Button>
                <Button loading={editSaving} onClick={handleCopySaveDraft}>
                  保存草稿
                </Button>
              </>
            ) : Number(editRecord?.approval_status) === WITHDRAWN_STATUS ? (
              <>
                <Button type="primary" loading={editSaving} onClick={handleSubmitWithdrawn}>
                  提交审核
                </Button>
                <Button loading={editSaving} onClick={handleSaveWithdrawn}>
                  保存草稿
                </Button>
              </>
            ) : (
              <>
                <Button type="primary" loading={editSaving} onClick={handleResubmit}>
                  重新提交
                </Button>
                <Button loading={editSaving} onClick={handleSaveWithdrawn}>
                  保存草稿
                </Button>
              </>
            )}
          </div>
        }
      >
        {editLoading ? (
          <div className="flex h-40 items-center justify-center">
            <Spin />
          </div>
        ) : editApp ? (
          <div className="relative flex h-full flex-nowrap items-start">
            <div className={`absolute top-3 right-0 z-10`}>
              <Button
                size="mini"
                type="primary"
                status="success"
                icon={flowCollapsed ? <IconDoubleLeft /> : <IconDoubleRight />}
                onClick={() => setFlowCollapsed((v) => !v)}
              />
            </div>
            <div className="max-h-full flex-1 overflow-y-auto px-4 py-3">
              <div className="min-w-188">
                <DynamicForm
                  app={editApp}
                  form={editForm}
                  pageType="form"
                  onValuesChange={setFormValues}
                />
              </div>
            </div>
            <div
              className={`h-full shrink-0 overflow-y-auto border-l border-(--color-neutral-3) px-4 py-3 transition-all ${flowCollapsed ? 'm-0! w-0 border-l-0 p-0!' : 'w-100'}`}
            >
              {!flowCollapsed && (
                <DynamicFlowView
                  raw={editApp?.approval_flow_json}
                  formData={formValues}
                  onMembersChange={(nodeId, members) => {
                    setSelfSelectMembers((prev) => ({ ...prev, [nodeId]: members }))
                  }}
                  onReadyStateChange={setSelfSelectReady}
                />
              )}
            </div>
          </div>
        ) : null}
      </Drawer>

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
              closeCC()
            } catch (e) {
              // 错误已在请求层提示
            }
          }}
          onCancel={closeCC}
        />
      )}
    </Card>
  )
}
