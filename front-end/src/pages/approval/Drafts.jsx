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
import ApprovalTableToolbar from 'src/pages/approval/ApprovalTableToolbar'
import DynamicFlowView from 'src/pages/application/dynamic/DynamicFlowView'
import DynamicForm, {
  parseLayoutJson,
  serializeTimeFields,
} from 'src/pages/application/dynamic/DynamicForm'
import { buildSelfSelectUserIDs } from 'src/pages/application/examine/flowModel'
import { ApprovalStatusTag } from 'src/pages/approval/approvalStatus.jsx'
import { useApprovalList } from 'src/pages/approval/useApprovalList'
import { formatTime } from 'src/utils/format'

const PAGE_TITLE = '草稿箱'

// 可配置列 key（操作列固定显示，不参与列设置）
const ALL_COL_KEYS = ['index', 'app_name', 'dept_name', 'created_at', 'approval_status']

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

  // 继续编辑 Drawer：加载应用配置 + 草稿详情回填动态表单
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

  // 从流程快照收集发起人自选成员（approverType=3 节点已注入的 members），兼容 JSON 字符串与节点数组；
  // 用于编辑草稿打开时回填 selfSelectMembers 状态，保存时原样回传，避免自选审批人在编辑后丢失
  const collectSelfSelectMembers = (flowSnapshot) => {
    const result = {}
    let nodes = flowSnapshot
    if (typeof flowSnapshot === 'string' && flowSnapshot) {
      try {
        nodes = JSON.parse(flowSnapshot)
      } catch {
        return result
      }
    }
    const walk = (list) => {
      for (const n of list || []) {
        if (n && n.approverType === 3 && Array.isArray(n.members) && n.members.length) {
          result[n.id] = n.members
        }
        if (n && n.type === 4 && Array.isArray(n.branches)) {
          n.branches.forEach((b) => walk(b && b.children))
        }
      }
    }
    walk(Array.isArray(nodes) ? nodes : [])
    return result
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
      // 一次请求获取实例详情（含 business_data + detail_layout_json）
      const res = await approvalApi.getApprovalInstanceDetail(record.instance_id)
      const inst = res.data
      // 构造 app 配置：detail_layout_json → form_layout_json 映射供 DynamicForm 使用，approval_flow_json → approval_flow_json 映射供 DynamicFlowView 使用
      setDrawerApp({
        id: inst.app_id,
        name: inst.app_name,
        form_layout_json: inst.detail_layout_json,
        approval_flow_json: inst.approval_flow_json,
      })
      const bizData = inst.business_data || {}
      drawerForm.setFieldsValue(bizData)
      setFormValues(bizData)
      // 从流程快照恢复发起人自选审批人（approverType=3 节点已注入的 members），
      // 避免编辑打开时清空已选成员，导致保存草稿时 self_select_members 丢失并被后端清空暂存
      setSelfSelectMembers(collectSelfSelectMembers(inst.approval_flow_json))
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
        self_select_members: Object.keys(selfSelectUserIDs).length ? selfSelectUserIDs : undefined,
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

  // 提交审核：优先调用从草稿提交接口，无实例时降级为发起审批
  const handleSubmit = async (record) => {
    try {
      if (record.instance_id) {
        // 已有审批草稿实例，直接从草稿提交发起审批
        await approvalApi.submitDraftInstance(record.instance_id)
      } else {
        // 无实例（旧草稿），走发起审批接口
        await approvalApi.createApprovalInstance({
          app_id: record.app_id,
          business_data_id: record.data_id ?? record.id,
        })
      }
      Message.success('提交成功，等待审核')
      fetchList()
    } catch (e) {
      // 错误已在请求层提示
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
    { title: '模块', key: 'app_name', dataIndex: 'app_name', render: (v) => v || '-' },
    { title: '部门', key: 'dept_name', dataIndex: 'dept_name', render: (v) => v || '-' },
    { title: '创建时间', key: 'created_at', dataIndex: 'created_at', width: 170, render: formatTime },
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
      width: 240,
      render: (_, r) => (
        <Space>
          <Button type="text" size="small" onClick={() => openDraftEdit(r)}>
            编辑
          </Button>
          <Button type="text" size="small" onClick={() => handleSubmit(r)}>
            提交
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
        width="50%"
        visible={drawerVisible}
        onCancel={() => setDrawerVisible(false)}
        title={`编辑 - ${drawerApp?.item_name || drawerApp?.name || ''}`}
        unmountOnExit
        footer={
          <div className="flex justify-end gap-2">
            <Button onClick={() => setDrawerVisible(false)}>取消</Button>
            <Button type="primary" loading={drawerSaving} onClick={handleDraftSave}>
              保存草稿
            </Button>
          </div>
        }
      >
        {drawerLoading ? (
          <div className="flex h-40 items-center justify-center">
            <Spin />
          </div>
        ) : drawerApp ? (
          <>
            <DynamicForm app={drawerApp} form={drawerForm} pageType="form" onValuesChange={setFormValues} />
            {/* 审批流程：抽屉内独立渲染审批流配置只读还原，按实际填报数据评估条件分支命中 */}
            <DynamicFlowView
              raw={drawerApp?.approval_flow_json}
              formData={formValues}
              onMembersChange={(nodeId, members) => {
                setSelfSelectMembers((prev) => ({ ...prev, [nodeId]: members }))
              }}
            />
          </>
        ) : null}
      </Drawer>
    </Card>
  )
}
