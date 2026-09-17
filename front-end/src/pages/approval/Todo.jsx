import {
  Button,
  Card,
  Message,
  Radio,
  Space,
  Table,
} from '@arco-design/web-react'
import { useCallback, useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import * as approvalApi from 'src/api/approval'
import { ApprovalStatusTag } from 'src/pages/approval/approvalStatus.jsx'
import ApprovalDetailDrawer from 'src/pages/approval/DetailDrawer'
import { PersonSelectorModal } from 'src/pages/application/examine/PersonSelectorModal'
import PersonSelectorProvider from 'src/pages/application/examine/PersonSelectorProvider'
import { userIdFromKey } from 'src/pages/application/examine/flowModel'
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

  // 转交 Modal（用户选择统一使用 PersonSelectorModal）
  const [delegateVisible, setDelegateVisible] = useState(false)
  const [delegateLoading, setDelegateLoading] = useState(false)

  // 加签 Modal（用户选择统一使用 PersonSelectorModal）
  const [addSignerVisible, setAddSignerVisible] = useState(false)
  const [addSignerLoading, setAddSignerLoading] = useState(false)
  // 加签类型：1-前加签 2-后加签
  const [addSignType, setAddSignType] = useState(2)

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

  // ========== 转交 ==========
  const openDelegateModal = (task) => {
    if (!task && !currentTask) return
    // 列表页直接点“转交”时行数据即目标任务（详情页操作时 currentTask 已设置）
    if (task) setCurrentTask({ id: task.id, instance_id: task.instance_id })
    setDelegateVisible(true)
  }

  const handleDelegate = async (userId) => {
    if (!userId || !currentTask) return
    setDelegateLoading(true)
    try {
      await approvalApi.delegateApprovalTask(currentTask.instance_id, currentTask.id, {
        to_user_id: userId,
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
    setAddSignType(2)
    setAddSignerVisible(true)
  }

  const handleAddSigner = async (userId) => {
    if (!userId || !currentTask) return
    setAddSignerLoading(true)
    try {
      await approvalApi.addSignApprovalTask(currentTask.instance_id, currentTask.id, {
        user_id: userId,
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
    <PersonSelectorProvider>
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
    </Card>
    </PersonSelectorProvider>
  )
}
