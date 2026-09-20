import { Badge, Button, Dropdown, Empty, List, Spin, Typography } from '@arco-design/web-react'
import { IconNotification } from '@arco-design/web-react/icon'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as notificationApi from 'src/api/notification'
import { formatTime } from 'src/utils/format'

// 通知类型文案
const TYPE_TEXT = { 1: '待办', 2: '退回', 3: '抄送', 4: '结果' }
// 轮询间隔：有未读 15s 轮询，无未读 60s 轮询（减少后台请求）
const POLL_ACTIVE = 15000
const POLL_IDLE = 60000

export default function NotificationBell() {
  const navigate = useNavigate()
  const [count, setCount] = useState(0)
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(false)
  const [visible, setVisible] = useState(false)
  // 用 ref 跟踪可见性/下拉打开态，避免 useEffect 依赖频繁重建定时器
  const pageVisibleRef = useRef(!document.hidden)
  const dropdownOpenRef = useRef(false)

  const loadCount = useCallback(async () => {
    try {
      const res = await notificationApi.notificationUnreadCount()
      setCount(res?.data?.count || 0)
    } catch {
      // 静默
    }
  }, [])

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

  // 未读数轮询：页面可见且下拉未打开时才轮询；有未读短间隔，无未读长间隔
  useEffect(() => {
    let timer
    let interval = 0

    const tick = () => {
      if (!pageVisibleRef.current || dropdownOpenRef.current) return
      loadCount()
      // 动态调整间隔：下一次按当前未读数决定
      clearInterval(timer)
      interval = count > 0 ? POLL_ACTIVE : POLL_IDLE
      timer = setInterval(tick, interval)
    }

    // 页面可见性变化：切回前台立即查一次
    const onVisibility = () => {
      pageVisibleRef.current = !document.hidden
      if (pageVisibleRef.current) loadCount()
    }
    document.addEventListener('visibilitychange', onVisibility)

    loadCount()
    timer = setInterval(tick, POLL_IDLE)

    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [loadCount, count])

  const handleVisibleChange = (v) => {
    setVisible(v)
    dropdownOpenRef.current = v
    if (v) loadList()
  }

  const handleReadAll = async () => {
    await notificationApi.notificationReadAll()
    setCount(0)
    loadList()
  }

  const handleClickItem = async (n) => {
    if (!n.read_at) {
      await notificationApi.notificationRead(n.id)
      setCount((c) => Math.max(0, c - 1))
    }
    // 跳转到对应页面
    if (n.type === 1) navigate('/approval/todo')
    else if (n.type === 2) navigate('/approval/initiated')
    else if (n.type === 3) navigate('/approval/tome')
    else if (n.type === 4) navigate('/approval/initiated')
    setVisible(false)
  }

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
        <List
          dataSource={list}
          render={(n) => (
            <List.Item
              key={n.id}
              className="cursor-pointer px-3! py-2!"
              onClick={() => handleClickItem(n)}
            >
              <div className="w-full">
                <div className="flex items-center justify-between">
                  <Typography.Text className={n.read_at ? '' : 'font-medium'}>
                    {n.title}
                  </Typography.Text>
                  <Typography.Text className="text-xs text-gray-400">
                    {formatTime(n.created_at)}
                  </Typography.Text>
                </div>
                <Typography.Text className="block text-xs text-gray-500">{n.msg}</Typography.Text>
                {n.content && (
                  <Typography.Text className="block text-xs text-gray-500">
                    [{TYPE_TEXT[n.type] || ''}意见] {n.content}
                  </Typography.Text>
                )}
              </div>
            </List.Item>
          )}
        />
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
