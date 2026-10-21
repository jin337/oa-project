import {
  Button,
  Drawer,
  Empty,
  Form,
  Input,
  Message,
  Radio,
  Space,
  Spin,
} from '@arco-design/web-react'
import { useEffect, useMemo, useState } from 'react'
import * as approvalApi from 'src/api/approval'
import * as deptApi from 'src/api/dept'
import { fetchAll } from 'src/api/fetchAll'
import * as roleApi from 'src/api/role'
import DynamicForm, {
  evaluateDynamicStates,
  parseLayoutJson,
  serializeTimeFields,
} from 'src/pages/application/dynamic/DynamicForm'
import { safeSetFieldsValue } from 'src/pages/application/dynamic/useApplicationDetailData'
import { PersonSelectorModal } from 'src/pages/application/examine/PersonSelectorModal'
import {
  buildOrgItemMap,
  buildRoleItemMap,
  buildUserDeptMap,
  transformDeptTree,
  transformRoleList,
  userIdFromKey,
} from 'src/pages/application/examine/flowModel'
import { SelectorDataContext } from 'src/pages/application/examine/selector-context'
import ApprovalTimeline from 'src/pages/approval/ApprovalTimeline.jsx'

/**
 * 审批记录动态详情 Drawer（公共组件）：
 * - 通过 record.instance_id 一次性请求流程实例详情接口
 * - 复用接口返回的 business_data 渲染动态详情，复用 detail_layout_json 构建布局
 * - 集成审批操作按钮：同意/拒绝（需 currentTask）、转交、加签（撤回仅在我的申请页）
 *
 * @param {object} props.record        列表记录（含 instance_id / data_id / app_id 等）
 * @param {boolean} props.visible      Drawer 是否可见
 * @param {function} props.onCancel    关闭回调
 * @param {object} props.currentTask   当前用户的待办任务（含 id / instance_id），传入时显示同意/拒绝按钮
 * @param {function} props.onAction    操作成功后的回调（通知父组件刷新列表）
 */
export default function DetailDrawer({
  record,
  visible,
  onCancel,
  currentTask,
  onAction,
  initialEditing = false,
}) {
  const [loading, setLoading] = useState(false)
  const [instance, setInstance] = useState(null)
  const [loadError, setLoadError] = useState(false)
  const [comment, setComment] = useState('')
  const [operating, setOperating] = useState(false)
  // 审批详情动态表单实例（字段权限 perm=2 可编辑字段修改后，提交时读取最新值）
  const [detailForm] = Form.useForm()
  // 已驳回发起人侧：只读态 -> 点"编辑"进入修改态，footer 显示"重新提交"
  const [editing, setEditing] = useState(false)

  // 转交 Modal（用户选择统一使用 PersonSelectorModal）
  const [delegateVisible, setDelegateVisible] = useState(false)

  // 加签 Modal（用户选择统一使用 PersonSelectorModal）
  const [addSignerVisible, setAddSignerVisible] = useState(false)
  // 加签类型：1-前加签（加签人先审，通过后本人再审） 2-后加签（本人通过后加签人再审）
  const [addSignType, setAddSignType] = useState(2)

  // 选择器数据源：抽屉打开时统一加载一次（组织架构 + 角色，仅启用），
  // 供 DynamicFlowView 自选节点弹层、转交/加签弹层共用，避免各自重复请求
  const [selectorData, setSelectorData] = useState({
    orgTree: [],
    roleList: [],
    orgItemMap: {},
    roleItemMap: {},
    userDeptMap: {},
    loading: false,
  })
  useEffect(() => {
    if (!visible) return undefined
    let cancelled = false
    setSelectorData((d) => ({ ...d, loading: true }))
    Promise.all([
      deptApi.getDeptUsersTree({ status: 1 }),
      fetchAll(roleApi.listRoles, { status: 1 }),
    ])
      .then(([deptRes, roleRes]) => {
        if (cancelled) return
        const orgTree = transformDeptTree(deptRes.data?.list || deptRes.data || [])
        const roleList = transformRoleList(roleRes.data?.list || roleRes.data || [])
        setSelectorData({
          orgTree,
          roleList,
          orgItemMap: buildOrgItemMap(orgTree),
          roleItemMap: buildRoleItemMap(roleList),
          userDeptMap: buildUserDeptMap(orgTree),
          loading: false,
        })
      })
      .catch(() => {
        if (!cancelled) setSelectorData((d) => ({ ...d, loading: false }))
      })
    return () => {
      cancelled = true
    }
  }, [visible])

  useEffect(() => {
    if (!visible || !record) return
    let cancelled = false
    setLoading(true)
    setInstance(null)
    setLoadError(false)
    setComment('')
    setEditing(initialEditing)

    if (record.instance_id) {
      approvalApi
        .getApprovalInstanceDetail(record.instance_id)
        .then((res) => {
          if (!cancelled) setInstance(res.data)
        })
        .catch(() => {
          if (!cancelled) setLoadError(true)
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    } else {
      if (!cancelled) setLoading(false)
    }

    return () => {
      cancelled = true
    }
  }, [visible, record, initialEditing])

  // 关闭时重置所有状态
  useEffect(() => {
    if (!visible) {
      setDelegateVisible(false)
      setAddSignerVisible(false)
    }
  }, [visible])

  const appFromInstance = instance
    ? {
        id: instance.app_id,
        name: instance.app_name,
        detail_layout_json: instance.detail_layout_json,
      }
    : null
  const title = record?.item_name || instance?.app_name || record?.name || ''

  // 动态状态预计算：基于完整业务数据一次性求值 visible_if/disabled_if，
  // 传给 DynamicForm 后只读分支直接渲染，无需 shouldUpdate 响应式监听
  const detailDynamicStates = useMemo(
    () =>
      appFromInstance?.detail_layout_json && instance?.business_data
        ? evaluateDynamicStates(appFromInstance.detail_layout_json, instance.business_data)
        : undefined,
    [appFromInstance?.detail_layout_json, instance?.business_data],
  )

  // 外部预加载数据回填表单：instance.business_data 已由审批实例接口返回，
  // 使用 safeSetFieldsValue 补写动态状态字段（visible_if/disabled_if），规避 Arco 快照覆盖
  useEffect(() => {
    if (instance?.business_data) {
      safeSetFieldsValue(detailForm, instance.business_data, appFromInstance?.detail_layout_json)
    }
  }, [instance?.business_data, detailForm, appFromInstance?.detail_layout_json])

  // 是否显示审批操作按钮（同意/拒绝）
  const showApproveButtons = Boolean(currentTask?.id)
  // 是否显示转交/加签按钮（有待办任务时）
  const showDelegateButtons = Boolean(currentTask?.id)

  // 当前任务所在节点的审批人操作权限（node.permissions：1-拒绝 / 2-转交 / 3-加签）
  // 快照为树形结构（条件分支的 children 内嵌节点），需递归查找；
  // 通过实例任务列表定位任务所属节点，旧快照无 permissions 时默认全部放行
  const currentNodePerms = (() => {
    const snapshot = instance?.approval_flow_json || []
    const curTask = (instance?.approval_flow_tasks || []).find((t) => t.id === currentTask?.id)
    const findNode = (nodes, id) => {
      for (const n of nodes || []) {
        if (n.id === id) return n
        const inBranch = (n.branches || []).map((b) => b.children || []).flat()
        const found = findNode(inBranch, id)
        if (found) return found
      }
      return null
    }
    const node = findNode(snapshot, curTask?.node_id)
    return node?.permissions?.length ? node.permissions : [1, 2, 3]
  })()

  // 退回权限：permissions 含 1（对齐钉钉，拒绝为审批人默认操作不受配置控制）
  const canReturn = showApproveButtons && currentNodePerms.includes(1)
  const canDelegate = showDelegateButtons && currentNodePerms.includes(2)
  const canAddSign = showDelegateButtons && currentNodePerms.includes(3)

  // 已驳回（status=3）的发起人侧详情：表单可编辑，footer 显示"重新提交"（对齐钉钉退回语义）
  const showResubmit = !currentTask && Number(instance?.status) === 3
  // 已驳回：默认只读，点"编辑"后表单才可改
  const resubmitEditing = showResubmit && editing

  // ========== 审批操作 ==========
  // 收集审批人修改后的表单数据：序列化时间字段后与实例初始数据比对，有差异才随审批提交
  // 被字段权限（perm=1）隐藏、未渲染到表单的字段不会出现在 getFieldsValue 中，
  // 提交前用初始快照按行补齐，保证子表全量重建时数据完整（避免缺失必填列导致 MySQL 1364）
  const mergeHiddenColumns = (values, initial) => {
    if (!initial || typeof initial !== 'object') return values
    const merged = { ...initial, ...values }
    Object.keys(initial).forEach((k) => {
      if (Array.isArray(initial[k]) && Array.isArray(values[k])) {
        merged[k] = values[k].map((row, i) => {
          const base = initial[k][i] && typeof initial[k][i] === 'object' ? initial[k][i] : {}
          const rowObj = row && typeof row === 'object' ? row : {}
          return { ...base, ...rowObj }
        })
      }
    })
    return merged
  }

  const buildModifiedBusinessData = () => {
    if (!instance?.business_data) return undefined
    const layout = parseLayoutJson(instance?.detail_layout_json)
    const values = serializeTimeFields(detailForm.getFieldsValue(), layout?.elements || [])
    const fullValues = mergeHiddenColumns(values, instance.business_data)
    if (JSON.stringify(fullValues) === JSON.stringify(instance.business_data)) return undefined
    return fullValues
  }

  const handleApprove = async (action) => {
    if (!currentTask) return
    // 拒绝/退回意见必填（对齐钉钉）
    if ((action === 2 || action === 3) && !comment.trim()) {
      Message.warning(action === 3 ? '退回时必须填写退回意见' : '拒绝时必须填写拒绝意见')
      return
    }
    setOperating(true)
    try {
      const businessData = buildModifiedBusinessData()
      await approvalApi.approveApprovalTask(currentTask.instance_id, currentTask.id, {
        action,
        comment: comment.trim() || undefined,
        business_data: businessData,
      })
      const names = { 1: '已同意', 2: '已拒绝', 3: '已退回' }
      Message.success(names[action] || '操作成功')
      setComment('')
      onAction?.()
      onCancel?.()
    } catch {
      // 错误已在请求层提示
    } finally {
      setOperating(false)
    }
  }

  // ========== 已驳回重新提交 ==========
  const handleResubmit = async () => {
    if (!instance) return
    setOperating(true)
    try {
      const businessData = buildModifiedBusinessData()
      await approvalApi.resubmitApprovalInstance(instance.id || record.instance_id, businessData)
      Message.success('已重新提交')
      onAction?.()
      onCancel?.()
    } catch {
      // 错误已在请求层提示
    } finally {
      setOperating(false)
    }
  }

  // ========== 转交 ==========
  const openDelegateModal = () => {
    setDelegateVisible(true)
  }

  const handleDelegate = async (userId) => {
    if (!userId || !currentTask) return
    setOperating(true)
    try {
      await approvalApi.delegateApprovalTask(currentTask.instance_id, currentTask.id, {
        to_user_id: userId,
      })
      Message.success('转交成功')
      setDelegateVisible(false)
      onAction?.()
      onCancel?.()
    } catch {
      // 错误已在请求层提示
    } finally {
      setOperating(false)
    }
  }

  // ========== 加签 ==========
  const openAddSignerModal = () => {
    setAddSignType(2)
    setAddSignerVisible(true)
  }

  const handleAddSigner = async (userId) => {
    if (!userId || !currentTask) return
    setOperating(true)
    try {
      await approvalApi.addSignApprovalTask(currentTask.instance_id, currentTask.id, {
        user_id: userId,
        type: addSignType,
      })
      Message.success(addSignType === 1 ? '前加签成功' : '后加签成功')
      setAddSignerVisible(false)
      onAction?.()
      onCancel?.()
    } catch {
      // 错误已在请求层提示
    } finally {
      setOperating(false)
    }
  }

  // 操作按钮区域
  const renderActions = () => {
    if (showResubmit && editing) {
      return (
        <div className="flex items-center justify-end">
          <Space>
            <Button size="small" onClick={onCancel}>
              取消
            </Button>
            <Button type="primary" size="small" loading={operating} onClick={handleResubmit}>
              重新提交
            </Button>
          </Space>
        </div>
      )
    }
    if (!showApproveButtons && !showDelegateButtons) return null
    return (
      <>
        {/* 审批意见输入 */}
        {showApproveButtons && (
          <Input.TextArea
            placeholder="请输入审批意见（可选）"
            value={comment}
            onChange={setComment}
            maxLength={500}
            showWordLimit
            autoSize={{ minRows: 2, maxRows: 4 }}
          />
        )}
        <div className="mt-3 flex items-center justify-between">
          <Space>
            {canDelegate && (
              <Button size="small" onClick={openDelegateModal}>
                转交
              </Button>
            )}
            {canAddSign && (
              <Button size="small" onClick={openAddSignerModal}>
                加签
              </Button>
            )}
            {canReturn && (
              <Button size="small" loading={operating} onClick={() => handleApprove(3)}>
                退回
              </Button>
            )}
          </Space>
          {showApproveButtons && (
            <Space>
              <Button
                size="small"
                onClick={onCancel}
              >
                关闭
              </Button>
              <Button
                status="danger"
                size="small"
                loading={operating}
                onClick={() => handleApprove(2)}
              >
                拒绝
              </Button>
              <Button
                type="primary"
                size="small"
                loading={operating}
                onClick={() => handleApprove(1)}
              >
                同意
              </Button>
            </Space>
          )}
        </div>
      </>
    )
  }

  // 审批状态映射（instance.status 实例状态枚举；文案以列表 approvalStatus.jsx 为准）
  const getStatusConfig = (status) => {
    const statusMap = {
      // 0 进行中 / 1 通过 / 2 拒绝 / 3 退回 / 4 作废 / 5 撤回 / 6 草稿
      0: { text: '审核中', color: '#ffb400' },
      1: { text: '审批通过', color: '#00b42a' },
      2: { text: '审批拒绝', color: '#f53f3f' },
      3: { text: '审批退回', color: '#ff7d00' },
      4: { text: '审批作废', color: '#86909c' },
      5: { text: '审批撤回', color: '#722ed1' },
      6: { text: '草稿', color: '#86909c' },
    }
    return statusMap[Number(status)] || { text: '未知状态', color: '#86909c' }
  }

  const statusConfig = getStatusConfig(instance?.status)

  return (
    <SelectorDataContext.Provider value={selectorData}>
      <Drawer
        className={'relative [&_.arco-drawer-content]:p-0!'}
        width="80%"
        title={`详情 - ${title}`}
        visible={visible}
        onCancel={onCancel}
        footer={
          renderActions() || (
            <Button size="small" onClick={onCancel}>
              关闭
            </Button>
          )
        }
        unmountOnExit
        maskClosable={false}
      >
        {/* 审批状态印章：显示在标题栏右上角 */}
        {instance && (
          <div className="absolute top-5 right-6 z-10">
            <span
              className="flex h-20 w-20 -rotate-45 items-center justify-center rounded-full bg-white text-base font-bold"
              style={{
                border: `2px solid ${statusConfig.color}`,
                color: statusConfig.color,
              }}
            >
              {statusConfig.text}
            </span>
          </div>
        )}

        {loading ? (
          <div className="flex h-40 items-center justify-center">
            <Spin />
          </div>
        ) : instance ? (
          /* 表单与审批流程左右布局：表单列自适应，流程列固定列宽并参与换行；
             空间不足（容器<985px:表单列 basis 560px + 流程列 400px + gap 24px = 984px）时流程列占满整行，两列顶部对齐 */
          <div className="@container flex flex-wrap items-start h-full">
            <div className="min-w-0 shrink grow basis-140 px-4 py-3 h-full overflow-y-auto">
              <DynamicForm
                app={{ ...appFromInstance, form_layout_json: appFromInstance?.detail_layout_json }}
                form={detailForm}
                pageType="detail"
                fieldPerms={instance?.field_perms}
                editable={Boolean(currentTask) || resubmitEditing}
                detailDynamicStates={detailDynamicStates}
              />
            </div>
            <div className="w-full shrink-0 @min-[985px]:w-100 border-l border-(--color-neutral-3) px-4 py-3 h-full overflow-y-auto">
              <ApprovalTimeline
                instanceId={record?.instance_id}
                visible={visible}
                initialData={instance}
                assigneeNameMap={instance?.assignee_name_map}
              />
            </div>
          </div>
        ) : !record?.instance_id ? (
          loadError ? (
            <Empty description="数据加载失败" />
          ) : (
            <Empty description="该记录未关联审批流程" />
          )
        ) : (
          <Empty description={loadError ? '数据加载失败' : '暂无数据'} />
        )}
      </Drawer>

      {/* 转交 Modal：用户选择统一使用 PersonSelectorModal（组织架构单选） */}
      {delegateVisible && (
        <PersonSelectorModal
          title="转交审批"
          modes={[1]}
          selectMode={1}
          onChange={(items) => {
            const uid = userIdFromKey(items[0]?.key)
            if (uid) handleDelegate(uid)
          }}
          onCancel={() => setDelegateVisible(false)}
        />
      )}

      {/* 加签 Modal：用户选择统一使用 PersonSelectorModal，extra 承载加签类型 */}
      {addSignerVisible && (
        <PersonSelectorModal
          title="加签"
          modes={[1]}
          selectMode={1}
          extra={
            <>
              <div className="mb-2 text-sm text-gray-500">加签类型</div>
              <Radio.Group
                direction="vertical"
                value={addSignType}
                onChange={setAddSignType}
                className="mb-3"
              >
                <Radio value={2}>后加签（我通过后，加签人继续审批）</Radio>
                <Radio value={1}>前加签（加签人先审，通过后我再审批）</Radio>
              </Radio.Group>
            </>
          }
          onChange={(items) => {
            const uid = userIdFromKey(items[0]?.key)
            if (uid) handleAddSigner(uid)
          }}
          onCancel={() => setAddSignerVisible(false)}
        />
      )}
    </SelectorDataContext.Provider>
  )
}
