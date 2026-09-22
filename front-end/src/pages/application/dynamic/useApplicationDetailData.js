import { Message } from '@arco-design/web-react'
import { useCallback, useEffect, useState } from 'react'
import * as applicationApi from 'src/api/application'

/**
 * 安全回填表单值：规避 Arco Form 缺陷 ——
 * setFieldsValue 一次写入时，若同时包含 shouldUpdate 依赖字段（如 disabled_if: "${form.user_id}"
 * 依赖的 user_id）与目标字段（phone），shouldUpdate 重渲染会使用中间快照将目标字段覆盖为空。
 * 因此在整体回填后，再对配置了动态状态（visible_if / disabled_if）的字段单独补写一次。
 * @param {object} form   Arco Form 实例
 * @param {object} data   业务数据（主表字段 + 子表数组）
 * @param {object} layout 应用布局（form_layout_json / detail_layout_json，含 elements 与子表 columns）
 */
export function safeSetFieldsValue(form, data, layout) {
  if (!form || !data) return
  form.setFieldsValue(data)
  const patch = {}
  const collect = (els) => {
    ;(Array.isArray(els) ? els : []).forEach((el) => {
      if (Array.isArray(el)) return collect(el)
      if (!el || typeof el !== 'object') return
      // 主表元素：自身配置了动态状态
      if (el.field_key && (el.dynamic_states?.visible_if || el.dynamic_states?.disabled_if) && data[el.field_key] !== undefined) {
        patch[el.field_key] = data[el.field_key]
      }
      // 子表元素：列级动态状态，按行补写（cgsq_detail[i].colKey）
      if (Array.isArray(el.columns)) {
        const rows = data[el.field_key]
        if (Array.isArray(rows)) {
          el.columns.forEach((col) => {
            if (col.field_key && (col.dynamic_states?.visible_if || col.dynamic_states?.disabled_if)) {
              rows.forEach((row, i) => {
                if (row && row[col.field_key] !== undefined) {
                  patch[`${el.field_key}[${i}].${col.field_key}`] = row[col.field_key]
                }
              })
            }
          })
        }
      }
    })
  }
  collect(layout?.elements)
  if (Object.keys(patch).length) form.setFieldsValue(patch)
}


/**
 * 动态业务数据详情加载 Hook：
 * 统一"详情数据请求 + 加载状态 + 表单回填 + detail_layout_json → form_layout_json 映射"，
 * 供 DynamicForm(pageType=detail) 与 DynamicList（编辑回填）等场景复用，
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

  // 数据加载完成后回填表单（含子表 Form.List 数组；safeSetFieldsValue 规避 shouldUpdate 字段被覆盖）
  useEffect(() => {
    if (detailData && form) safeSetFieldsValue(form, detailData, app?.form_layout_json || app?.detail_layout_json)
  }, [detailData, form, app])

  // detail_layout_json → form_layout_json 字段映射（DynamicForm 统一读取 form_layout_json）
  const detailApp = app ? { ...app, form_layout_json: app?.detail_layout_json } : null

  return { detailData, loading, fetchDetail, detailApp }
}
