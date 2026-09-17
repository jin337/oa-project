import {
  Button,
  Card,
  Input,
  Message,
  Modal,
  Radio,
  Space,
  Table,
  Tag,
} from '@arco-design/web-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import * as approvalApi from 'src/api/approval'
import { listUsers } from 'src/api/user'
import { ApprovalStatusTag } from 'src/pages/approval/approvalStatus.jsx'
import ApprovalDetailDrawer from 'src/pages/approval/DetailDrawer'
import { useTabs } from 'src/store/tab-context'

const PAGE_TITLE = '我的待办'

/** 我的待办：展示当前用户待处理的审批任务，支持审批/转交/加签/查看详情 */
export default function Todo() {
  const location = useLocation()
  const { addTab } = useTabs()
  const [list, setList] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(10)
  const [loading, setLoading] = useState(false)

  // 详情 Drawer（集成审批操作）
  const [detailRecord, setDetailRecord] = useState(null)
  const [currentTask, setCurrentTask] = useState(null)

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
  // 加签类型：1-前加签 2-后加签
  const [addSignType, setAddSignType] = useState(2)

  const searchTimerRef = useRef(null)

  useEffect(() => {
    addTab({ path: location.pathname, title: PAGE_TITLE })
  }, [location.pathname, addTab])

  const fetchList = useCallback(async () => {
    setLoading(true)
    try {
      const res = await approvalApi.getApprovalList({ page, size, scope: 'todo' })
      setList(res.data?.list || [])
      setTotal(res.data?.total || 0)
    } catch (e) {
      // 错误已在请求层提示
    } finally {
      setLoading(false)
    }
  }, [page, size])

  useEffect(() => {
    fetchList()
  }, [fetchList])

  // 打开详情（带审批操作）
  const handleOpenDetail = (record) => {
    setDetailRecord(record)
    setCurrentTask({ id: record.id, instance_id: record.instance_id })
  }

  // 关闭详情
  const handleCloseDetail = () => {
    setDetailRecord(null)
    setCurrentTask(null)
  }

  // 操作成功后刷新列表
  const handleAction = () => {
    fetchList()
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
  const openDelegateModal = (task) => {
    if (!task && !currentTask) return
    // 列表页直接点“转交”时行数据即目标任务（详情页操作时 currentTask 已设置）
    if (task) setCurrentTask({ id: task.id, instance_id: task.instance_id })
    setDelegateUser(null)
    setDelegateSearch('')
    setDelegateResults([])
    setDelegateVisible(true)
  }

  const handleDelegate = async () => {
    if (!delegateUser || !currentTask) return
    setDelegateLoading(true)
    try {
      await approvalApi.delegateApprovalTask(currentTask.instance_id, currentTask.id, {
        to_user_id: delegateUser.id,
      })
      Message.success('转交成功')
      setDelegateVisible(false)
      handleCloseDetail()
      fetchList()
    } catch {
      // 错误已在请求层提示
    } finally {
      setDelegateLoading(false)
    }
  }

  // ========== 加签 ==========
  const openAddSignerModal = (task) => {
    if (!task && !currentTask) return
    // 列表页直接点“加签”时行数据即目标任务（详情页操作时 currentTask 已设置）
    if (task) setCurrentTask({ id: task.id, instance_id: task.instance_id })
    setAddSignerUser(null)
    setAddSignerSearch('')
    setAddSignerResults([])
    setAddSignType(2)
    setAddSignerVisible(true)
  }

  const handleAddSigner = async () => {
    if (!addSignerUser || !currentTask) return
    setAddSignerLoading(true)
    try {
      await approvalApi.addSignApprovalTask(currentTask.instance_id, currentTask.id, {
        user_id: addSignerUser.id,
        type: addSignType,
      })
      Message.success(addSignType === 1 ? '前加签成功' : '后加签成功')
      setAddSignerVisible(false)
      handleCloseDetail()
      fetchList()
    } catch {
      // 错误已在请求层提示
    } finally {
      setAddSignerLoading(false)
    }
  }

  // 渲染用户搜索结果
  const renderUserResults = (results, selectedUser, onSelect) => (
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

  const columns = [
    {
      title: '序号',
      key: 'index',
      width: 62,
      align: 'center',
      render: (_, __, index) => index + 1,
    },
    { title: '模块', dataIndex: 'app_name', render: (v) => v || '-' },
    { title: '审批节点', dataIndex: 'node_name', render: (v) => v || '-' },
    { title: '部门', dataIndex: 'dept_name', render: (v) => v || '-' },
    { title: '申请人', dataIndex: 'created_name', render: (v) => v || '-' },
    {
      title: '申请时间',
      dataIndex: 'created_at',
      width: 170,
      render: (v) => v?.slice(0, 19).replace('T', ' ') || '-',
    },
    {
      title: '状态',
      dataIndex: 'approval_status',
      width: 110,
      render: (v) => <ApprovalStatusTag status={v} />,
    },
    {
      title: '操作',
      key: 'action',
      width: 220,
      render: (_, r) => (
        <Space>
          <Button type="primary" size="small" onClick={() => handleOpenDetail(r)}>
            审批
          </Button>
          <Button type="text" size="small" onClick={() => openDelegateModal(r)}>
            转交
          </Button>
          <Button type="text" size="small" onClick={() => openAddSignerModal(r)}>
            加签
          </Button>
        </Space>
      ),
    },
  ]

  return (
    <Card title={PAGE_TITLE}>
      <Table
        rowKey={(r) => r.instance_id ? `${r.instance_id}_${r.id}` : r.id}
        columns={columns}
        data={list}
        loading={loading}
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

      {/* 详情 Drawer（集成同意/拒绝/撤回操作） */}
      <ApprovalDetailDrawer
        record={detailRecord}
        visible={Boolean(detailRecord)}
        onCancel={handleCloseDetail}
        currentTask={currentTask}
        onAction={handleAction}
      />

      {/* 转交 Modal */}
      <Modal
        title="转交审批"
        visible={delegateVisible}
        onCancel={() => setDelegateVisible(false)}
        onOk={handleDelegate}
        okText="确认转交"
        okButtonProps={{ disabled: !delegateUser, loading: delegateLoading }}
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
        {renderUserResults(delegateResults, delegateUser, (u) => setDelegateUser(u))}
      </Modal>

      {/* 加签 Modal */}
      <Modal
        title="加签"
        visible={addSignerVisible}
        onCancel={() => setAddSignerVisible(false)}
        onOk={handleAddSigner}
        okText="确认加签"
        okButtonProps={{ disabled: !addSignerUser, loading: addSignerLoading }}
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
        {renderUserResults(addSignerResults, addSignerUser, (u) => setAddSignerUser(u))}
      </Modal>
    </Card>
  )
}
