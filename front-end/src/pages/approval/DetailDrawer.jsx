import { Drawer, Empty, Spin } from '@arco-design/web-react'
import { useEffect, useState } from 'react'
import * as applicationApi from 'src/api/application'
import DynamicDetail from 'src/pages/application/dynamic/DynamicDetail'

/**
 * 审批记录动态详情 Drawer：根据记录的页面编码（record.code，兼容 "code:state" 格式）请求
 * 对应的应用配置（state=detail），在 Drawer 内渲染 DynamicDetail 还原动态配置的详情页。
 * 负责应用配置的加载状态（Spin）与错误/空状态（Empty）处理，
 * 数据记录本身由 DynamicDetail 内部按 dataId 拉取。
 */
export default function DetailDrawer({ record, visible, onCancel }) {
  const [loading, setLoading] = useState(false)
  const [app, setApp] = useState(null)
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    if (!visible || !record) return
    let cancelled = false
    setLoading(true)
    setApp(null)
    setLoadError(false)

    // 兼容 "页面编码:页面状态"（如 app_xxx:detail）与纯页面编码：取第一段作为 code
    const [code = ''] = (record.code || '').trim().split(':')
    if (!code) {
      setLoadError(true)
      setLoading(false)
      return
    }

    applicationApi
      .getApplicationByCode(code, 'detail')
      .then((res) => {
        if (!cancelled) setApp(res.data)
      })
      .catch(() => {
        if (!cancelled) setLoadError(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [visible, record])

  const dataId = record?.data_id ?? record?.id

  return (
    <Drawer
      width="50%"
      title={`详情 - ${app?.name || record?.item_name || record?.name || ''}`}
      visible={visible}
      onCancel={onCancel}
      footer={null}
      unmountOnExit
    >
      {loading ? (
        <div className="flex h-40 items-center justify-center">
          <Spin />
        </div>
      ) : app ? (
        <>
          <DynamicDetail app={app} dataId={dataId} />
        </>
      ) : (
        <Empty description={loadError ? '应用配置加载失败' : '该记录未关联页面编码'} />
      )}
    </Drawer>
  )
}
