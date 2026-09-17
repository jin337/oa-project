import {
  Button,
  Drawer,
  Empty,
  Input,
  Message,
  Popconfirm,
  Radio,
  Space,
  Spin,
} from '@arco-design/web-react'
import { useEffect, useState } from 'react'
import * as approvalApi from 'src/api/approval'
import DynamicDetail from 'src/pages/application/dynamic/DynamicDetail'
import { PersonSelectorModal } from 'src/pages/application/examine/PersonSelectorModal'
import PersonSelectorProvider from 'src/pages/application/examine/PersonSelectorProvider'
import { userIdFromKey } from 'src/pages/application/examine/flowModel'
import ApprovalTimeline from 'src/pages/approval/ApprovalTimeline.jsx'

/**
 * 审批记录动态详情 Drawer（公共组件）：
 * - 通过 record.instance_id 一次性请求流程实例详情接口
 * - 复用接口返回的 business_data 渲染动态详情，复用 detail_layout_json 构建布局
 * - 集成审批操作按钮：同意/拒绝（需 currentTask）、转交、加签、撤回
 *
 * @param {object} props.record        列表记录（含 instance_id / data_id / app_id 等）
 * @param {boolean} props.visible      Drawer 是否可见
 * @param {function} props.onCancel    关闭回调
 * @param {object} props.currentTask   当前用户的待办任务（含 id / instance_id），传入时显示同意/拒绝按钮
 * @param {function} props.onAction    操作成功后的回调（通知父组件刷新列表）
 */
export default function DetailDrawer({ record, visible, onCancel, currentTask, onAction }) {
  const [loading, setLoading] = useState(false)
  const [instance, setInstance] = useState(null)
  const [loadError, setLoadError] = useState(false)
  const [comment, setComment] = useState('')
  const [operating, setOperating] = useState(false)

  // 转交 Modal（用户选择统一使用 PersonSelectorModal）
  const [delegateVisible, setDelegateVisible] = useState(false)

  // 加签 Modal（用户选择统一使用 PersonSelectorModal）
  const [addSignerVisible, setAddSignerVisible] = useState(false)
  // 加签类型：1-前加签（加签人先审，通过后本人再审） 2-后加签（本人通过后加签人再审）
  const [addSignType, setAddSignType] = useState(2)

  useEffect(() => {
    if (!visible || !record) return
    let cancelled = false
    setLoading(true)
    setInstance(null)
    setLoadError(false)
    setComment('')

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
  }, [visible, record])

  // 关闭时重置所有状态
  useEffect(() => {
    if (!visible) {
      setDelegateVisible(false)
      setAddSignerVisible(false)
    }
  }, [visible])

  const dataId = record?.data_id ?? record?.id
  const appFromInstance = instance
    ? {
        id: instance.app_id,
        name: instance.app_name,
        detail_layout_json: instance.detail_layout_json,
      }
    : null
  const title = instance?.app_name || record?.item_name || record?.name || ''

  // 是否显示审批操作按钮（同意/拒绝）
  const showApproveButtons = Boolean(currentTask?.id)
  // 是否显示撤回按钮（发起人是当前用户 + 进行中状态）
  const showWithdraw = instance?.status === 0 && instance?.created_by > 0
  // 是否显示转交/加签按钮（有待办任务时）
  const showDelegateButtons = Boolean(currentTask?.id)

  // ========== 审批操作 ==========
  const handleApprove = async (action) => {
    if (!currentTask) return
    setOperating(true)
    try {
      await approvalApi.approveApprovalTask(currentTask.instance_id, currentTask.id, {
        action,
        comment: comment.trim() || undefined,
      })
      const names = { 1: '已同意', 2: '已拒绝', 3: '已驳回' }
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

  // ========== 撤回 ==========
  const handleWithdraw = async () => {
    if (!instance) return
    setOperating(true)
    try {
      await approvalApi.withdrawApprovalInstance(instance.id)
      Message.success('撤回成功，已转为草稿')
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
    if (!showApproveButtons && !showWithdraw && !showDelegateButtons) return null
    return (
      <div className="pt-3">
        {/* 审批意见输入 */}
        {showApproveButtons && (
          <div className="mb-3">
            <div className="mb-1 text-sm text-gray-500">审批意见</div>
            <Input.TextArea
              placeholder="请输入审批意见（可选）"
              value={comment}
              onChange={setComment}
              maxLength={500}
              showWordLimit
              autoSize={{ minRows: 2, maxRows: 4 }}
            />
          </div>
        )}
        <div className="flex items-center justify-between">
          <Space>
            {showDelegateButtons && (
              <Space>
                <Button size="small" onClick={openDelegateModal}>
                  转交
                </Button>
                <Button size="small" onClick={openAddSignerModal}>
                  加签
                </Button>
              </Space>
            )}
            {showWithdraw && (
              <Popconfirm
                title="撤回后该申请将转为草稿，确定撤回？"
                onOk={handleWithdraw}
                position="top"
              >
                <Button size="small" status="warning" loading={operating}>
                  撤回
                </Button>
              </Popconfirm>
            )}
          </Space>
          {showApproveButtons && (
            <Space>
              <Popconfirm title="确定拒绝该申请吗？" onOk={() => handleApprove(2)} position="top">
                <Button status="danger" size="small" loading={operating}>
                  拒绝
                </Button>
              </Popconfirm>
              <Popconfirm
                title="确定驳回该申请吗？（退回修改）"
                onOk={() => handleApprove(3)}
                position="top"
              >
                <Button status="warning" size="small" loading={operating}>
                  驳回
                </Button>
              </Popconfirm>
              <Popconfirm title="确定通过该申请吗？" onOk={() => handleApprove(1)} position="top">
                <Button type="primary" size="small" loading={operating}>
                  同意
                </Button>
              </Popconfirm>
            </Space>
          )}
        </div>
      </div>
    )
  }

  return (
    <PersonSelectorProvider>
      <Drawer
        width="50%"
        title={`详情 - ${title}`}
        visible={visible}
        onCancel={onCancel}
        footer={null}
        unmountOnExit
      >
        {loading ? (
          <div className="flex h-40 items-center justify-center">
            <Spin />
          </div>
        ) : instance ? (
          <>
            <DynamicDetail
              app={appFromInstance}
              dataId={dataId}
              initialData={instance?.business_data}
              fieldPerms={instance?.field_perms}
            />
            <ApprovalTimeline
              instanceId={record?.instance_id}
              visible={visible}
              initialData={instance}
              assigneeNameMap={instance?.assignee_name_map}
            />
            {renderActions()}
          </>
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
          checkTarget={1}
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
          checkTarget={1}
          selectMode={1}
          extra={
            <>
              <div className="mb-2 text-sm text-gray-500">加签类型</div>
              <Radio.Group value={addSignType} onChange={setAddSignType} className="mb-3">
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
    </PersonSelectorProvider>
  )
}
