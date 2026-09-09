import { Message } from '@arco-design/web-react'
import { useCallback, useEffect, useState } from 'react'
import * as applicationApi from '../../api/application'

/**
 * 按页面编码 + 页面状态加载应用配置的自定义 Hook：
 * - code 为空时不发起请求（由调用方负责容错展示）
 * - code/state 变化时重置旧数据，避免短暂渲染上一个应用的内容
 * - 请求失败置 error 并提供 retry（重新请求）
 *
 * @param {string} code  页面编码（如 app_1788413612；空值不请求）
 * @param {string} state 页面状态（list / form / detail）
 * @returns {{ app: object|null, loading: boolean, error: boolean, retry: () => Promise<void> }}
 */
export function useApplicationData(code, state) {
  const [app, setApp] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const fetchApp = useCallback(async () => {
    if (!code) {
      setApp(null)
      setError(false)
      setLoading(false)
      return
    }
    // 重置旧数据：code/state 切换时避免短暂显示上一个应用的内容
    setApp(null)
    setError(false)
    setLoading(true)
    try {
      const res = await applicationApi.getApplicationByCode(code, state)
      setApp(res.data)
    } catch {
      setError(true)
      Message.error('应用配置加载失败')
    } finally {
      setLoading(false)
    }
  }, [code, state])

  useEffect(() => {
    fetchApp()
  }, [fetchApp])

  return { app, loading, error, retry: fetchApp }
}
