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
  runOnSubmitAfter,
  runOnSubmitBefore,
  serializeTimeFields,
} from 'src/pages/application/dynamic/DynamicForm'
import { buildSelfSelectUserIDs } from 'src/pages/application/examine/flowModel'
import { ApprovalStatusTag } from 'src/pages/approval/approvalStatus.jsx'
import ApprovalTableToolbar from 'src/pages/approval/ApprovalTableToolbar'
import { useApprovalList } from 'src/pages/approval/useApprovalList'
import { formatTime } from 'src/utils/format'

const PAGE_TITLE = '草稿箱'

// 可配置列 key（操作列固定显示，不参与列设置）
const ALL_COL_KEYS = ['index', 'item_name', 'dept_name', 'created_at', 'approval_status']

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
        submitResult = await approvalApi.submitDraftInstance(record.instance_id, draftMembersPayload)
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
    {
      title: '创建时间',
      key: 'created_at',
      dataIndex: 'created_at',
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
      width: 160,
      render: (_, r) => (
        <Space>
          <Button type="text" size="small" onClick={() => openDraftEdit(r)}>
            编辑
          </Button>
          <Popconfirm position="lb" title="确定删除该草稿吗？" onOk={() => handleDelete(r)}>
            <Button type="text" size="small" status="danger">
              删除
            </Button>
          </Popconfirm>
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
        width="80%"
        visible={drawerVisible}
        onCancel={() => setDrawerVisible(false)}
        title={`编辑 - ${drawerApp?.item_name || drawerApp?.name || ''}`}
        unmountOnExit
        maskClosable={false}
        footer={
          <div className="flex justify-between gap-2">
            <Button type="primary" loading={drawerSaving} onClick={() => handleSubmit(draftRecord)}>
              提交审核
            </Button>
            <div className="flex gap-2">
              <Button onClick={() => setDrawerVisible(false)}>取消</Button>
              <Button type="primary" loading={drawerSaving} onClick={handleDraftSave}>
                保存草稿
              </Button>
            </div>
          </div>
        }
      >
        {drawerLoading ? (
          <div className="flex h-40 items-center justify-center">
            <Spin />
          </div>
        ) : drawerApp ? (
          /* 表单与审批流程左右布局：表单列自适应，流程列固定列宽并参与换行；
             空间不足（容器<985px:表单列 basis 560px + 流程列 400px + gap 24px = 984px）时流程列占满整行，两列顶部对齐 */
          <div className="@container flex flex-wrap items-start gap-6">
            <div className="min-w-0 grow shrink basis-140">
              <DynamicForm
                app={drawerApp}
                form={drawerForm}
                pageType="form"
                onValuesChange={setFormValues}
              />
            </div>
            <div className="w-full shrink-0 @min-[985px]:w-100">
              {/* 审批流程：抽屉内独立渲染审批流配置只读还原，按实际填报数据评估条件分支命中 */}
              <DynamicFlowView
                raw={drawerApp?.approval_flow_json}
                formData={formValues}
                onMembersChange={(nodeId, members) => {
                  setSelfSelectMembers((prev) => ({ ...prev, [nodeId]: members }))
                }}
              />
            </div>
          </div>
        ) : null}
      </Drawer>
    </Card>
  )
}
