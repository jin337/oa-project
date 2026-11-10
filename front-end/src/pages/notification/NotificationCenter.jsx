import {
  Button,
  Card,
  Input,
  Message,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from '@arco-design/web-react'
import { IconRefresh } from '@arco-design/web-react/icon'
import { useCallback, useEffect, useRef, useState } from 'react'
import { locateApprovalInstance } from 'src/api/approval'
import * as notificationApi from 'src/api/notification'
import ApprovalDetailDrawer from 'src/pages/approval/components/DetailDrawer'
import { formatTime } from 'src/utils/format'

// 通知类型文案（与后端写入口径一致：1待办 2退回 3抄送 4结果 5催办 6到期预警）
const TYPE_TEXT = { 1: '待办', 2: '退回', 3: '抄送', 4: '结果', 5: '催办', 6: '到期预警' }
const TYPE_COLOR = { 1: 'arcoblue', 2: 'orange', 3: 'purple', 4: 'green', 6: 'gold' }
const TYPE_OPTIONS = Object.entries(TYPE_TEXT).map(([value, label]) => ({
  value: Number(value),
  label,
}))

// 多标签页同步通道（与顶部消息按钮共用同一频道）
const bc = new BroadcastChannel('notification-sync')

// 已生效筛选条件 → 请求参数；全部类型/全部状态不传参，交由后端按缺省处理
function buildParams(page, size, cond) {
  const params = { page, size }
  if (cond.keyword) params.keyword = cond.keyword
  if (cond.type) params.type = cond.type
  if (cond.status !== 'all') params.status = cond.status
  return params
}

export default function NotificationCenter() {
  const [list, setList] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(10)
  const [loading, setLoading] = useState(false)
  const [unread, setUnread] = useState(0)
  // 多选：当前勾选的通知 id，供批量已读 / 批量删除使用
  const [selectedKeys, setSelectedKeys] = useState([])

  // 本页详情抽屉：detailRecord 控制可见性，detailTask 决定是否展示审批操作按钮
  const [detailRecord, setDetailRecord] = useState(null)
  const [detailTask, setDetailTask] = useState(null)
  // 抽屉打开序号：定位请求异步返回时，避免覆盖已关闭或已切换的抽屉状态
  const detailSeqRef = useRef(0)

  // 草稿筛选条件（变化不触发请求）与已生效条件（点击「搜索」后更新）
  const [keyword, setKeyword] = useState('')
  const [type, setType] = useState(undefined)
  const [status, setStatus] = useState('all')
  const [applied, setApplied] = useState({ keyword: '', type: 0, status: 'all' })

  const fetchList = useCallback(async (p, s, cond) => {
    setLoading(true)
    try {
      const res = await notificationApi.notificationList(buildParams(p, s, cond))
      setList(res?.data?.list || [])
      setTotal(res?.data?.total || 0)
    } catch {
      // 错误已在请求层提示
    } finally {
      setLoading(false)
    }
  }, [])

  // 拉取未读数并返回最新值，供批量操作后同步顶部消息按钮
  const loadUnread = useCallback(async () => {
    try {
      const res = await notificationApi.notificationUnreadCount()
      const cnt = res?.data?.count || 0
      setUnread(cnt)
      return cnt
    } catch {
      return null
    }
  }, [])

  useEffect(() => {
    fetchList(page, size, applied)
  }, [page, size, applied, fetchList])

  useEffect(() => {
    loadUnread()
  }, [loadUnread])

  // 多标签页同步：任一标签标记已读/收到新通知时，当前页刷新列表与未读数
  useEffect(() => {
    bc.onmessage = (e) => {
      const { type: msgType, action } = e.data || {}
      if (
        msgType === 'increment' ||
        msgType === 'sync-count' ||
        action === 'read-all' ||
        action === 'read-one'
      ) {
        fetchList(page, size, applied)
        loadUnread()
      }
    }
    return () => {
      bc.onmessage = null
    }
  }, [page, size, applied, fetchList, loadUnread])

  const handleSearch = () => {
    setApplied({ keyword: keyword.trim(), type: type || 0, status })
    setSelectedKeys([])
    setPage(1)
  }

  const handleReset = () => {
    setKeyword('')
    setType(undefined)
    setStatus('all')
    setApplied({ keyword: '', type: 0, status: 'all' })
    setSelectedKeys([])
    setPage(1)
  }

  // 刷新列表：清空已选，避免选中项与刷新后的数据不一致
  const handleRefresh = () => {
    setSelectedKeys([])
    fetchList(page, size, applied)
  }

  const handleReadAll = async () => {
    try {
      await notificationApi.notificationReadAll()
      setUnread(0)
      setSelectedKeys([])
      bc.postMessage({ action: 'read-all' })
      fetchList(1, size, applied)
      setPage(1)
      Message.success('已全部标记为已读')
    } catch {
      // 错误已在请求层提示
    }
  }

  // 批量标记已读：后端只更新所选中的未读通知，返回实际更新条数
  const handleReadBatch = async () => {
    if (!selectedKeys.length) return
    try {
      const res = await notificationApi.notificationReadBatch(selectedKeys)
      const updated = res?.data?.updated || 0
      setSelectedKeys([])
      const cnt = await loadUnread()
      if (cnt !== null) bc.postMessage({ type: 'sync-count', count: cnt })
      fetchList(page, size, applied)
      Message.success(updated > 0 ? `已标记 ${updated} 条为已读` : '所选通知均已是已读状态')
    } catch {
      // 错误已在请求层提示
    }
  }

  // 批量删除：二次确认后物理删除，不可恢复
  const handleDeleteBatch = () => {
    const count = selectedKeys.length
    if (!count) return
    Modal.confirm({
      title: '删除通知',
      content: `确定删除选中的 ${count} 条通知？删除后不可恢复。`,
      okText: '删除',
      cancelText: '取消',
      onOk: async () => {
        try {
          const res = await notificationApi.notificationDelete(selectedKeys)
          const deleted = res?.data?.deleted || 0
          setSelectedKeys([])
          const cnt = await loadUnread()
          if (cnt !== null) bc.postMessage({ type: 'sync-count', count: cnt })
          // 当前页被删空时回退一页，避免停留在空白页
          const remaining = total - deleted
          if (remaining > 0 && (page - 1) * size >= remaining) {
            setPage(page - 1)
          } else {
            fetchList(page, size, applied)
          }
          Message.success(`已删除 ${deleted} 条通知`)
        } catch {
          // 错误已在请求层提示
        }
      },
    })
  }

  const handleReadOne = async (n) => {
    try {
      await notificationApi.notificationRead(n.id)
      setUnread((c) => Math.max(0, c - 1))
      bc.postMessage({ action: 'read-one' })
      fetchList(page, size, applied)
    } catch {
      // 错误已在请求层提示
    }
  }

  // 点击通知（行或「查看」）：标记已读后在本页打开详情抽屉。
  // 归属仍实时判定（待办任务可能已被处理）：locate 只用于判断该实例当前是否有「我的待办」任务，
  // 有待办时携带 task_id，抽屉内可直接同意/退回/转交/加签；其余归属按只读详情展示。
  const handleClickItem = async (n) => {
    if (!n.read_at) {
      await handleReadOne(n)
    }
    if (!n.instance_id) {
      Message.info('该通知未关联审批单，暂无详情可查看')
      return
    }
    const seq = ++detailSeqRef.current
    setDetailTask(null)
    setDetailRecord({ instance_id: n.instance_id, item_name: n.title })
    try {
      const res = await locateApprovalInstance(n.instance_id)
      if (detailSeqRef.current !== seq) return
      const loc = res?.data
      if (loc?.scope === 'todo' && loc?.task_id) {
        setDetailTask({ id: loc.task_id, instance_id: n.instance_id })
      } else if (loc?.scope === 'none') {
        Message.info('该申请已不在你的列表可见范围，仅展示归档信息')
      }
    } catch {
      // 定位失败时按只读详情打开；接口错误已由请求层提示
    }
  }

  // 关闭本页详情抽屉，并作废尚未返回的定位结果
  const closeDetail = () => {
    detailSeqRef.current += 1
    setDetailRecord(null)
    setDetailTask(null)
  }

  const columns = [
    {
      key: 'read_at',
      title: '状态',
      dataIndex: 'read_at',
      width: 80,
      align: 'center',
      render: (v) => (v ? <Tag color="gray">已读</Tag> : <Tag color="red">未读</Tag>),
    },
    {
      key: 'type',
      title: '类型',
      dataIndex: 'type',
      width: 90,
      align: 'center',
      render: (v) => <Tag color={TYPE_COLOR[v] || 'gray'}>{TYPE_TEXT[v] || '-'}</Tag>,
    },
    {
      key: 'title',
      title: '模块',
      dataIndex: 'title',
      width: 200,
      render: (v, r) => (
        <Typography.Ellipsis
          showTooltip
          style={{ maxWidth: 200 }}
          className={r.read_at ? '' : 'font-medium'}
        >
          {v || '-'}
        </Typography.Ellipsis>
      ),
    },
    {
      key: 'summarys',
      title: '摘要',
      dataIndex: 'summarys',
      render: (v) => (
        <Typography.Ellipsis showTooltip style={{ maxWidth: 200 }}>
          {v || '-'}
        </Typography.Ellipsis>
      ),
    },
    {
      key: 'msg',
      title: '内容',
      dataIndex: 'msg',
      width: 300,
      render: (v) => (
        <Typography.Ellipsis showTooltip style={{ maxWidth: 360 }}>
          {v || '-'}
        </Typography.Ellipsis>
      ),
    },
    {
      key: 'created_at',
      title: '时间',
      dataIndex: 'created_at',
      width: 180,
      render: (v) => formatTime(v),
    },
    {
      key: 'action',
      title: '操作',
      width: 80,
      align: 'center',
      render: (_, r) => (
        <Button
          type="text"
          size="mini"
          onClick={(e) => {
            e.stopPropagation()
            handleClickItem(r)
          }}
        >
          查看
        </Button>
      ),
    },
  ]

  return (
    <>
      <Card
        title={`通知中心${unread > 0 ? `（${unread} 条未读）` : ''}`}
        extra={
          <Space>
            <Button icon={<IconRefresh />} onClick={handleRefresh}>
              刷新
            </Button>
            <Button type="primary" disabled={unread === 0} onClick={handleReadAll}>
              全部已读
            </Button>
          </Space>
        }
      >
        {/* 搜索区域 */}
        <div className="mb-3">
          <Space wrap>
            <Input
              className="w-64!"
              placeholder="按模块或内容搜索"
              allowClear
              value={keyword}
              onChange={setKeyword}
              onPressEnter={handleSearch}
            />
            <Select
              className="w-32!"
              placeholder="通知类型"
              allowClear
              value={type}
              onChange={setType}
              options={TYPE_OPTIONS}
            />
            <Select
              className="w-32!"
              value={status}
              onChange={setStatus}
              options={[
                { label: '全部状态', value: 'all' },
                { label: '未读', value: 'unread' },
                { label: '已读', value: 'read' },
              ]}
            />
            <Button type="primary" onClick={handleSearch}>
              搜索
            </Button>
            <Button onClick={handleReset}>重置</Button>
          </Space>
        </div>

        {/* 批量操作栏：常驻占位，未勾选时按钮禁用 */}
        <div className="mb-3 flex items-center gap-2">
          <Typography.Text type="secondary">已选 {selectedKeys.length} 条</Typography.Text>
          <Button size="small" disabled={!selectedKeys.length} onClick={handleReadBatch}>
            标记已读
          </Button>
          <Button
            size="small"
            status="danger"
            disabled={!selectedKeys.length}
            onClick={handleDeleteBatch}
          >
            删除
          </Button>
        </div>

        <Table
          rowKey="id"
          columns={columns}
          data={list}
          loading={loading}
          rowSelection={{
            type: 'checkbox',
            selectedRowKeys: selectedKeys,
            onChange: (keys) => setSelectedKeys(keys),
          }}
          pagination={{
            current: page,
            pageSize: size,
            total,
            showTotal: true,
            sizeCanChange: true,
            onChange: (p, s) => {
              setSelectedKeys([])
              setPage(p)
              setSize(s)
            },
          }}
          onRow={(record) => ({
            onClick: (e) => {
              // 勾选复选框不应触发行点击（打开详情抽屉）
              if (e?.target?.closest?.('.arco-checkbox')) return
              handleClickItem(record)
            },
            style: { cursor: 'pointer' },
          })}
        />
      </Card>

      {/* 详情抽屉：复用审批详情公共组件；归属为「我的待办」时可直接审批，其余按只读展示 */}
      <ApprovalDetailDrawer
        record={detailRecord}
        visible={Boolean(detailRecord)}
        onCancel={closeDetail}
        currentTask={detailTask}
        onAction={() => fetchList(page, size, applied)}
      />
    </>
  )
}
