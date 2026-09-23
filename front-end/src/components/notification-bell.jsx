import { Badge, Button, Dropdown, Empty, List, Spin, Typography } from '@arco-design/web-react'
import { IconNotification } from '@arco-design/web-react/icon'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as notificationApi from 'src/api/notification'
import { getToken } from 'src/utils/auth'
import { formatTime } from 'src/utils/format'

// 通知类型文案
const TYPE_TEXT = { 1: '待办', 2: '退回', 3: '抄送', 4: '结果' }
// 多标签页同步通道
const bc = new BroadcastChannel('notification-sync')

export default function NotificationBell() {
  const navigate = useNavigate()
  const [count, setCount] = useState(0)
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(false)
  const [visible, setVisible] = useState(false)
  const dropdownOpenRef = useRef(false)

  // 加载未读数
  const loadCount = useCallback(async () => {
    try {
      const res = await notificationApi.notificationUnreadCount()
      setCount(res?.data?.count || 0)
    } catch {
      // 静默
    }
  }, [])

  // 加载通知列表
  const loadList = useCallback(async () => {
    setLoading(true)
    try {
      const res = await notificationApi.notificationList({ page: 1, size: 20 })
      setList(res?.data?.list || [])
    } catch {
      // 静默
    } finally {
      setLoading(false)
    }
  }, [])

  // SSE 实时连接（替代轮询）
  useEffect(() => {
    const token = getToken()
    if (!token) return

    const es = new EventSource(`/api/v1/notifications/stream?token=${token}`)

    // 连接成功事件（带初始未读数）
    es.addEventListener('connected', (e) => {
      try {
        const data = JSON.parse(e.data)
        setCount(data?.count || 0)
      } catch {
        // 静默
      }
    })

    // 收到新通知（实时推送）
    es.addEventListener('notification', () => {
      setCount((c) => {
        const newCount = c + 1
        bc.postMessage({ type: 'increment', count: newCount })
        return newCount
      })
      // 如果下拉打开，刷新列表
      if (dropdownOpenRef.current) {
        loadList()
      }
    })

    // 错误时自动重连（EventSource 原生支持）
    es.onerror = () => {
      // 静默，EventSource 会自动重连
    }

    return () => {
      es.close()
    }
  }, [loadCount, loadList])

  // 多标签页同步：接收其他标签页的通知状态
  useEffect(() => {
    bc.onmessage = (e) => {
      const { type, count, action } = e.data
      if (type === 'sync-count') {
        setCount(count)
      } else if (type === 'increment') {
        setCount(count)
      } else if (action === 'read-all') {
        setCount(0)
        if (dropdownOpenRef.current) loadList()
      } else if (action === 'read-one') {
        setCount((c) => Math.max(0, c - 1))
      }
    }
    return () => {
      bc.onmessage = null
    }
  }, [loadList])

  const handleVisibleChange = (v) => {
    setVisible(v)
    dropdownOpenRef.current = v
    if (v) loadList()
  }

  const handleReadAll = async () => {
    await notificationApi.notificationReadAll()
    setCount(0)
    bc.postMessage({ action: 'read-all' })
    loadList()
  }

  const handleClickItem = async (n) => {
    if (!n.read_at) {
      await notificationApi.notificationRead(n.id)
      setCount((c) => Math.max(0, c - 1))
      bc.postMessage({ action: 'read-one' })
    }
    // 跳转到对应页面
    if (n.type === 1) navigate('/approval/todo')
    else if (n.type === 2) navigate('/approval/initiated')
    else if (n.type === 3) navigate('/approval/tome')
    else if (n.type === 4) navigate('/approval/initiated')
    setVisible(false)
  }

  // 按时间分组：今天 / 昨天 / 更早
  const groupList = (() => {
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
    const yesterday = today - 86400000

    const groups = { 今天: [], 昨天: [], 更早: [] }
    list.forEach((n) => {
      const t = new Date(n.created_at).getTime()
      if (t >= today) groups['今天'].push(n)
      else if (t >= yesterday) groups['昨天'].push(n)
      else groups['更早'].push(n)
    })
    return Object.entries(groups).filter(([, items]) => items.length > 0)
  })()

  const dropdown = (
    <div className="max-h-96 w-80 overflow-auto rounded-lg bg-white shadow-lg border border-gray-100">
      <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2">
        <Typography.Text className="font-medium">通知</Typography.Text>
        {count > 0 && <Button type="text" size="mini" onClick={handleReadAll}>
          全部已读
        </Button>}
      </div>
      {loading ? (
        <div className="flex justify-center py-8">
          <Spin />
        </div>
      ) : list.length === 0 ? (
        <Empty className="py-8" description="暂无通知" />
      ) : (
        groupList.map(([groupName, items]) => (
          <div key={groupName}>
            <div className="bg-gray-50 px-3 py-1 text-xs text-gray-500">{groupName}</div>
            <List
              dataSource={items}
              render={(n) => (
                <List.Item
                  key={n.id}
                  className="cursor-pointer px-3! py-2!"
                  onClick={() => handleClickItem(n)}
                >
                  <div className="w-full">
                    <div className="flex items-center justify-between">
                      <Typography.Text className={n.read_at ? '' : 'font-medium'}>
                        [{TYPE_TEXT[n.type] || ''}]{n.title}
                      </Typography.Text>
                      <Typography.Text className="text-xs text-gray-400">
                        {formatTime(n.created_at)}
                      </Typography.Text>
                    </div>
                    <Typography.Text className="block text-xs text-gray-500">{n.msg}</Typography.Text>
                  </div>
                </List.Item>
              )}
            />
          </div>
        ))
      )}
    </div>
  )

  return (
    <Dropdown
      droplist={dropdown}
      trigger="click"
      popupVisible={visible}
      onVisibleChange={handleVisibleChange}
      position="br"
    >
      <Button
        type="text"
        icon={
          <Badge count={count} dot={count > 0}>
            <IconNotification />
          </Badge>
        }
      />
    </Dropdown>
  )
}
