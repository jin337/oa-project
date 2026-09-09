import { Message } from '@arco-design/web-react'
import { useCallback, useEffect, useState } from 'react'
import * as applicationApi from '../../api/application'

/**
 * 动态业务数据详情加载 Hook：
 * 统一"详情数据请求 + 加载状态 + 表单回填 + detail_layout_json → form_layout_json 映射"，
 * 供 DynamicDetail（只读详情）与 DynamicList（编辑回填）等场景复用，
 * 保持 DynamicForm 的纯渲染职责不变。
 *
 * @param {object} app          应用配置（含 id / detail_layout_json；传 null 表示不由 hook 自动请求）
 * @param {string|number} dataId 数据记录 ID（传 null 表示暂不请求）
 * @param {object} form         目标表单实例（回填目标；可为 null）
 * @param {object} options      配置项 { autoFetch }：默认 true（挂载自动请求）；false 时由调用方手动触发 fetchDetail
 * @returns {{ detailData, loading, fetchDetail, detailApp }}
 *   - detailData  完整详情数据（含子表数组），请求成功后自动 setFieldsValue 回填
 *   - loading     请求中状态
 *   - fetchDetail 手动触发请求（支持覆盖 appId/dataId），返回 Promise<data|null>
 *   - detailApp   映射 detail_layout_json → form_layout_json 后的应用配置
 */
export function useApplicationDetailData(app, dataId, form, options = {}) {
  const { autoFetch = true } = options
  const [detailData, setDetailData] = useState(null)
  const [loading, setLoading] = useState(false)

  const fetchDetail = useCallback(
    async (overrideAppId, overrideDataId) => {
      const appId = overrideAppId ?? app?.id
      const dId = overrideDataId ?? dataId
      if (!appId || !dId) return null
      setLoading(true)
      try {
        const res = await applicationApi.getApplicationDataDetail(appId, dId)
        const data = res.data
        setDetailData(data)
        return data
      } catch {
        Message.error('详情数据加载失败')
        return null
      } finally {
        setLoading(false)
      }
    },
    [app?.id, dataId],
  )

  // 自动加载：挂载或依赖变化时请求（Drawer 等事件驱动场景通过 autoFetch:false + 手动调用）
  useEffect(() => {
    if (autoFetch) fetchDetail()
  }, [fetchDetail, autoFetch])

  // 数据加载完成后回填表单（含子表 Form.List 数组）
  useEffect(() => {
    if (detailData && form) form.setFieldsValue(detailData)
  }, [detailData, form])

  // detail_layout_json → form_layout_json 字段映射（DynamicForm 统一读取 form_layout_json）
  const detailApp = app ? { ...app, form_layout_json: app?.detail_layout_json } : null

  return { detailData, loading, fetchDetail, detailApp }
}
