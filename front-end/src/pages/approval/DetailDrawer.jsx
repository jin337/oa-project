import {
  Button,
  Drawer,
  Empty,
  Input,
  Message,
  Modal,
  Popconfirm,
  Radio,
  Space,
  Spin,
  Tag,
} from '@arco-design/web-react'
import { useEffect, useRef, useState } from 'react'
import * as approvalApi from 'src/api/approval'
import { listUsers } from 'src/api/user'
import DynamicDetail from 'src/pages/application/dynamic/DynamicDetail'
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

  // 转交 Modal
  const [delegateVisible, setDelegateVisible] = useState(false)
  const [delegateSearch, setDelegateSearch] = useState('')
  const [delegateResults, setDelegateResults] = useState([])
  const [delegateUser, setDelegateUser] = useState(null)
  const [delegateLoading, setDelegateLoading] = useState(false)

  // 加签 Modal
  const [addSignerVisible, setAddSignerVisible] = useState(false)
  const [addSignerSearch, setAddSignerSearch] = useState('')
  const [addSignerResults, setAddSignerResults] = useState([])
  const [addSignerUser, setAddSignerUser] = useState(null)
  const [addSignerLoading, setAddSignerLoading] = useState(false)
  // 加签类型：1-前加签（加签人先审，通过后本人再审） 2-后加签（本人通过后加签人再审）
  const [addSignType, setAddSignType] = useState(2)

  // 防抖定时器（用户搜索）
  const searchTimerRef = useRef(null)

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
      setDelegateUser(null)
      setAddSignerUser(null)
      setDelegateSearch('')
      setAddSignerSearch('')
    }
  }, [visible])

  const dataId = record?.data_id ?? record?.id
  const appFromInstance = instance
    ? { id: instance.app_id, name: instance.app_name, detail_layout_json: instance.detail_layout_json }
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

  // ========== 用户搜索（防抖） ==========
  const searchUsers = (keyword, setResults) => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    if (!keyword) {
      setResults([])
      return
    }
    searchTimerRef.current = setTimeout(async () => {
      try {
        const res = await listUsers({ username: keyword, page: 1, size: 20 })
        setResults(res.data?.list || res.data?.records || [])
      } catch {
        setResults([])
      }
    }, 300)
  }

  // ========== 转交 ==========
  const openDelegateModal = () => {
    setDelegateUser(null)
    setDelegateSearch('')
    setDelegateResults([])
    setDelegateVisible(true)
  }

  const handleDelegate = async () => {
    if (!delegateUser || !currentTask) return
    setOperating(true)
    try {
      await approvalApi.delegateApprovalTask(currentTask.instance_id, currentTask.id, {
        to_user_id: delegateUser.id,
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
    setAddSignerUser(null)
    setAddSignerSearch('')
    setAddSignerResults([])
    setAddSignType(2)
    setAddSignerVisible(true)
  }

  const handleAddSigner = async () => {
    if (!addSignerUser || !currentTask) return
    setOperating(true)
    try {
      await approvalApi.addSignApprovalTask(currentTask.instance_id, currentTask.id, {
        user_id: addSignerUser.id,
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

  // 渲染用户搜索结果列表
  const renderUserSearchResults = (results, selectedUser, onSelect) => (
    <div className="max-h-48 overflow-auto rounded border border-gray-200">
      {results.length === 0 ? (
        <div className="p-3 text-center text-sm text-gray-400">输入姓名搜索用户</div>
      ) : (
        results.map((u) => (
          <div
            key={u.id}
            className={`cursor-pointer px-3 py-2 text-sm hover:bg-gray-50 ${
              selectedUser?.id === u.id ? 'bg-blue-50 text-blue-600' : ''
            }`}
            onClick={() => onSelect(u)}
          >
            {u.nickname || u.username}
            <span className="ml-2 text-xs text-gray-400">({u.username})</span>
          </div>
        ))
      )}
    </div>
  )

  // 操作按钮区域
  const renderActions = () => {
    if (!showApproveButtons && !showWithdraw && !showDelegateButtons) return null
    return (
      <div className="border-t border-gray-100 pt-3">
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
              <Popconfirm title="撤回后该申请将转为草稿，确定撤回？" onOk={handleWithdraw} position="top">
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
              <Popconfirm title="确定驳回该申请吗？（退回修改）" onOk={() => handleApprove(3)} position="top">
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
    <>
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

      {/* 转交 Modal */}
      <Modal
        title="转交审批"
        visible={delegateVisible}
        onCancel={() => setDelegateVisible(false)}
        onOk={handleDelegate}
        okText="确认转交"
        okButtonProps={{ disabled: !delegateUser, loading: operating }}
        unmountOnExit
      >
        <div className="mb-2 text-sm text-gray-500">选择转交目标用户</div>
        <Input.Search
          placeholder="输入姓名搜索用户"
          value={delegateSearch}
          onChange={(v) => {
            setDelegateSearch(v)
            searchUsers(v, setDelegateResults)
          }}
          allowClear
          className="mb-2"
        />
        {delegateUser ? (
          <div className="mb-2">
            <Tag closable onClose={() => setDelegateUser(null)} color="blue">
              {delegateUser.nickname || delegateUser.username}
            </Tag>
          </div>
        ) : null}
        {renderUserSearchResults(delegateResults, delegateUser, (u) => setDelegateUser(u))}
      </Modal>

      {/* 加签 Modal */}
      <Modal
        title="加签"
        visible={addSignerVisible}
        onCancel={() => setAddSignerVisible(false)}
        onOk={handleAddSigner}
        okText="确认加签"
        okButtonProps={{ disabled: !addSignerUser, loading: operating }}
        unmountOnExit
      >
        <div className="mb-2 text-sm text-gray-500">加签类型</div>
        <Radio.Group value={addSignType} onChange={setAddSignType} className="mb-3">
          <Radio value={2}>后加签（我通过后，加签人继续审批）</Radio>
          <Radio value={1}>前加签（加签人先审，通过后我再审批）</Radio>
        </Radio.Group>
        <div className="mb-2 text-sm text-gray-500">选择加签用户</div>
        <Input.Search
          placeholder="输入姓名搜索用户"
          value={addSignerSearch}
          onChange={(v) => {
            setAddSignerSearch(v)
            searchUsers(v, setAddSignerResults)
          }}
          allowClear
          className="mb-2"
        />
        {addSignerUser ? (
          <div className="mb-2">
            <Tag closable onClose={() => setAddSignerUser(null)} color="blue">
              {addSignerUser.nickname || addSignerUser.username}
            </Tag>
          </div>
        ) : null}
        {renderUserSearchResults(addSignerResults, addSignerUser, (u) => setAddSignerUser(u))}
      </Modal>
    </>
  )
}
