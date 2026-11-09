import { Badge, Button } from '@arco-design/web-react'
import { IconNotification } from '@arco-design/web-react/icon'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as notificationApi from 'src/api/notification'
import { getToken } from 'src/utils/auth'
import { API_PREFIX } from 'src/utils/constants'

// 多标签页同步通道（与通知中心页面共用同一频道）
const bc = new BroadcastChannel('notification-sync')

/**
 * 顶部消息入口：只负责未读数展示与跳转，通知列表/搜索/分页在独立的通知中心页面。
 * 保留 SSE 实时连接与多标签页同步：新通知到达时刷新徽标，并广播给已打开的通知中心页面。
 */
export default function NotificationBell() {
  const navigate = useNavigate()
  const [count, setCount] = useState(0)

  const loadCount = useCallback(async () => {
    try {
      const res = await notificationApi.notificationUnreadCount()
      setCount(res?.data?.count || 0)
    } catch {
      // 静默
    }
  }, [])

  useEffect(() => {
    loadCount()
  }, [loadCount])

  // SSE 实时连接（替代轮询）
  useEffect(() => {
    const token = getToken()
    if (!token) return

    const es = new EventSource(`${API_PREFIX}/notifications/stream?token=${token}`)

    // 连接成功事件（带初始未读数）
    es.addEventListener('connected', (e) => {
      try {
        const data = JSON.parse(e.data)
        setCount(data?.count || 0)
      } catch {
        // 静默
      }
    })

    // 收到新通知（实时推送）：更新徽标并广播，通知中心页面据此刷新列表
    es.addEventListener('notification', () => {
      setCount((c) => {
        const newCount = c + 1
        bc.postMessage({ type: 'increment', count: newCount })
        return newCount
      })
    })

    // 错误时自动重连（EventSource 原生支持）
    es.onerror = () => {
      // 静默，EventSource 会自动重连
    }

    return () => {
      es.close()
    }
  }, [])

  // 多标签页同步：其他标签页标记已读后，本标签页徽标同步
  useEffect(() => {
    bc.onmessage = (e) => {
      const { type, count: next, action } = e.data || {}
      if (type === 'sync-count' || type === 'increment') {
        setCount(next || 0)
      } else if (action === 'read-all') {
        setCount(0)
      } else if (action === 'read-one') {
        setCount((c) => Math.max(0, c - 1))
      }
    }
    return () => {
      bc.onmessage = null
    }
  }, [])

  return (
    <Button
      type="text"
      title="通知中心"
      onClick={() => navigate('/notification')}
      icon={
        <Badge count={count} dot={count > 0}>
          <IconNotification />
        </Badge>
      }
    />
  )
}
