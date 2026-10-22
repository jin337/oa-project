import {
  Button,
  Card,
  Drawer,
  Form,
  Message,
  Popconfirm,
  Spin,
  Table,
} from '@arco-design/web-react'
import { IconDoubleLeft, IconDoubleRight } from '@arco-design/web-react/icon'
import { useState } from 'react'
import * as approvalApi from 'src/api/approval'
import DynamicFlowView from 'src/pages/application/dynamic/DynamicFlowView'
import DynamicForm, {
  parseLayoutJson,
  runOnSubmitAfter,
  runOnSubmitBefore,
  serializeTimeFields,
} from 'src/pages/application/dynamic/DynamicForm'
import { buildSelfSelectUserIDs } from 'src/pages/application/examine/flowModel'
import {
  colBillNo,
  colCreatedAt,
  colCreatedName,
  colDept,
  colIndex,
  colStatus,
} from 'src/pages/approval/approvalColumns'
import ApprovalTableToolbar from 'src/pages/approval/ApprovalTableToolbar'
import { useApprovalList } from 'src/pages/approval/useApprovalList'

const PAGE_TITLE = '草稿箱'

// 可配置列 key（操作列固定显示，不参与列设置）
const ALL_COL_KEYS = [
  'index',
  'item_name',
  'dept_name',
  'created_name',
  'bill_no',
  'created_at',
  'approval_status',
]

/** 草稿箱：展示当前用户状态为「草稿」的申请记录，支持继续编辑 / 提交审核 / 删除 */
export default function Drafts() {
  const {
    list,
    total,
    page,
    size,
    loading,
    setPage,
    setSize,
    fetchList,
    keyword,
    setKeyword,
    handleSearch,
    handleReset,
    tableSize,
    visibleCols,
    setVisibleCols,
    sizeMenu,
  } = useApprovalList('drafts', { title: PAGE_TITLE, colKeys: ALL_COL_KEYS })

  // 继续编辑 Drawer：加载流程配置 + 草稿详情回填动态表单
  const [drawerVisible, setDrawerVisible] = useState(false)
  const [drawerLoading, setDrawerLoading] = useState(false)
  const [drawerSaving, setDrawerSaving] = useState(false)
  const [drawerApp, setDrawerApp] = useState(null)
  const [draftRecord, setDraftRecord] = useState(null)
  const [drawerForm] = Form.useForm()
  // 抽屉内动态表单实时值（供审批流程条件分支命中评估使用）
  const [formValues, setFormValues] = useState({})
  // 发起人自选审批人（nodeId -> [{ type, key, label }]），提交时转为 nodeId -> [userId] 传给后端
  const [selfSelectMembers, setSelfSelectMembers] = useState({})
  const [flowCollapsed, setFlowCollapsed] = useState(false)

  // 将草稿暂存的自选成员（nodeId -> [{ type, key, label }]）注入审批流配置的自选节点 members，
  // 供 DynamicFlowView 展示已选审批人/抄送人；兼容 JSON 字符串与节点数组，条件分支 children 递归处理
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
        if (node.type === 4 && Array.isArray(node.branches)) {
          node.branches = node.branches.map((b) => ({ ...b, children: walk(b && b.children) }))
        }
        return node
      })
    return walk(nodes)
  }

  // 继续编辑：通过实例接口一次获取全部数据
  const openDraftEdit = async (record) => {
    setDraftRecord(record)
    setDrawerVisible(true)
    setDrawerLoading(true)
    setDrawerApp(null)
    drawerForm.resetFields()
    try {
      if (!record.instance_id) {
        Message.error('该草稿未关联审批流程，无法编辑')
        setDrawerVisible(false)
        return
      }
      // 一次请求获取实例详情（含 business_data + form_layout_json）
      const res = await approvalApi.getApprovalInstanceDetail(record.instance_id)
      const inst = res.data
      // 从草稿暂存 approval_draft_members（nodeId -> [userId]）恢复发起人自选审批人/抄送人，
      // 姓名经 assignee_name_map 映射；应用最新审批流配置中自选节点 members 为空，需注入后供 DynamicFlowView 展示
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
      // 构造 app 配置：form_layout_json → form_layout_json 映射供 DynamicForm 使用，approval_flow_json → approval_flow_json 映射供 DynamicFlowView 使用
      setDrawerApp({
        id: inst.app_id,
        name: inst.app_name,
        form_layout_json: inst.form_layout_json,
        approval_flow_json: injectDraftMembers(inst.approval_flow_json, selfSel),
      })
      const bizData = inst.business_data || {}
      drawerForm.setFieldsValue(bizData)
      setFormValues(bizData)
      // 回填自选成员状态：编辑打开时恢复已选成员，避免清空后保存草稿时 approval_draft_members 丢失并被后端清空暂存
      setSelfSelectMembers(selfSel)
    } catch (e) {
      Message.error('草稿加载失败，请稍后重试')
      setDrawerVisible(false)
    } finally {
      setDrawerLoading(false)
    }
  }

  // 保存草稿编辑：一次调用更新业务数据并保存审批流程草稿实例
  const handleDraftSave = async () => {
    let values
    try {
      values = await drawerForm.validate()
    } catch (e) {
      return
    }
    setDrawerSaving(true)
    try {
      // 时间字段（date/datetime/time 等）统一序列化为 MySQL 兼容格式
      const layout = parseLayoutJson(drawerApp?.form_layout_json)
      const payload = serializeTimeFields(values, layout?.elements || [])
      const selfSelectUserIDs = buildSelfSelectUserIDs(selfSelectMembers)
      // 一次调用：后端自动更新业务数据并保存审批草稿实例
      // instance_id 标识本次编辑的草稿实例：后端据此执行 UPDATE（更新）而非 INSERT（新增），
      // 避免从草稿箱每次保存都新增一条草稿记录
      await approvalApi.saveDraftInstance({
        instance_id: draftRecord.instance_id,
        app_id: drawerApp.id,
        business_data_id: draftRecord.data_id ?? draftRecord.id,
        business_data: payload,
        approval_draft_members: Object.keys(selfSelectUserIDs).length
          ? selfSelectUserIDs
          : undefined,
      })
      Message.success('草稿更新成功')
      setDrawerVisible(false)
      fetchList()
    } catch (e) {
      // 错误已在请求层提示
    } finally {
      setDrawerSaving(false)
    }
  }

  // 提交审核：先把抽屉里的表单改动与自选成员写回草稿实例，再从草稿提交发起审批
  const handleSubmit = async (record) => {
    let values
    try {
      values = await drawerForm.validate()
    } catch (e) {
      return
    }
    setDrawerSaving(true)
    try {
      // 时间字段（date/datetime/time 等）统一序列化为 MySQL 兼容格式
      const layout = parseLayoutJson(drawerApp?.form_layout_json)
      const payload = serializeTimeFields(values, layout?.elements || [])
      const formConfig = layout?.formConfig || {}
      // 提交前事件
      const ok = await runOnSubmitBefore(formConfig, payload)
      if (!ok) {
        Message.info('表单提交前事件已拦截本次提交')
        setDrawerSaving(false)
        return
      }
      let submitResult
      // 抽屉内本次选择/调整的自选审批人、抄送人必须随提交一起带上：
      // 后端会校验自选节点已选人，未带则回退草稿暂存值（可能是未选择或已被清空）
      const selfSelectUserIDs = buildSelfSelectUserIDs(selfSelectMembers)
      const draftMembersPayload = Object.keys(selfSelectUserIDs).length
        ? { approval_draft_members: selfSelectUserIDs }
        : undefined
      if (record.instance_id) {
        // 草稿实例：先写回表单改动（提交接口只覆盖自选成员，业务数据取实例上的存量），
        // 再提交，保证提交的是抽屉里的最新内容
        await approvalApi.saveDraftInstance({
          instance_id: record.instance_id,
          app_id: drawerApp.id,
          business_data_id: record.data_id ?? record.id,
          business_data: payload,
          ...(draftMembersPayload || {}),
        })
        submitResult = await approvalApi.submitDraftInstance(
          record.instance_id,
          draftMembersPayload,
        )
      } else {
        // 无实例（旧草稿），走发起审批接口：带 business_data 时后端按 business_data_id 更新已有业务数据
        submitResult = await approvalApi.createApprovalInstance({
          app_id: record.app_id,
          business_data_id: record.data_id ?? record.id,
          business_data: payload,
          ...(draftMembersPayload || {}),
        })
      }
      // 提交成功后事件
      await runOnSubmitAfter(formConfig, payload, submitResult?.data)
      Message.success('提交成功')
      setDrawerVisible(false)
      fetchList()
    } catch (e) {
      // 错误已在请求层提示
    } finally {
      setDrawerSaving(false)
    }
  }

  // 删除草稿
  const handleDelete = async (record) => {
    try {
      await approvalApi.deleteApprovalInstance(record.instance_id)
      Message.success('草稿删除成功')
      fetchList()
    } catch (e) {
      // 错误已在请求层提示
    }
  }

  const columns = [
    colIndex,
    {
      title: '模块',
      key: 'item_name',
      dataIndex: 'item_name',
      // 未从申请项发起（无 item_name）时回退展示流程配置名称
      render: (v, r) => (
        <Button type="text" size="small" className="-ml-4!" onClick={() => openDraftEdit(r)}>
          {v || r?.app_name || '-'}
        </Button>
      ),
    },
    colBillNo,
    colDept,
    colCreatedName,
    colCreatedAt,
    colStatus,
    {
      title: '操作',
      key: 'action',
      width: 70,
      align: 'center',
      render: (_, r) => (
        <Popconfirm position="lb" title="确定删除该草稿吗？" onOk={() => handleDelete(r)}>
          <Button type="text" size="small" status="danger">
            删除
          </Button>
        </Popconfirm>
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
        placeholder="按模块 / 申请人搜索"
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

      {/* 继续编辑 Drawer：注入动态表单并回填草稿数据 */}
      <Drawer
        className="[&_.arco-drawer-content]:p-0!"
        width="80%"
        visible={drawerVisible}
        onCancel={() => setDrawerVisible(false)}
        title={`编辑 - ${drawerApp?.item_name || drawerApp?.name || ''}`}
        unmountOnExit
        maskClosable={false}
        footer={
          <>
            <Button type="primary" loading={drawerSaving} onClick={() => handleSubmit(draftRecord)}>
              提交审核
            </Button>
            <Button loading={drawerSaving} onClick={handleDraftSave}>
              保存草稿
            </Button>
          </>
        }
      >
        {drawerLoading ? (
          <div className="flex h-40 items-center justify-center">
            <Spin />
          </div>
        ) : drawerApp ? (
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
                  app={drawerApp}
                  form={drawerForm}
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
                  raw={drawerApp?.approval_flow_json}
                  formData={formValues}
                  onMembersChange={(nodeId, members) => {
                    setSelfSelectMembers((prev) => ({ ...prev, [nodeId]: members }))
                  }}
                />
              )}
            </div>
          </div>
        ) : null}
      </Drawer>
    </Card>
  )
}
