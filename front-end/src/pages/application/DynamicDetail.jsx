import { Empty, Form, Message, Spin } from '@arco-design/web-react'
import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import * as applicationApi from '../../api/application'
import DynamicForm from './DynamicForm'

/**
 * 动态详情还原组件：根据应用配置（state=detail）还原只读详情展示页面。
 * - 通过 dataId（优先 props 传入，其次路由参数 id）获取数据记录
 * - 使用 detail_layout_json 渲染只读表单（复用 DynamicForm，pageType='detail'）
 *
 * @param {object} app    应用配置对象（含 id / name / detail_layout_json 等字段）
 * @param {string|number} dataId  数据记录 ID（可选；Drawer 场景由父组件传入，路由场景回退 useParams().id）
 */
export default function DynamicDetail({ app, dataId: propDataId }) {
  const { id: routeDataId } = useParams()
  const dataId = propDataId || routeDataId
  const [detailData, setDetailData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [form] = Form.useForm()

  const fetchDetail = useCallback(async () => {
    if (!app?.id || !dataId) return
    setLoading(true)
    try {
      const res = await applicationApi.getApplicationDataDetail(app.id, dataId)
      setDetailData(res.data)
    } catch {
      Message.error('详情数据加载失败')
    } finally {
      setLoading(false)
    }
  }, [app?.id, dataId])

  useEffect(() => {
    fetchDetail()
  }, [fetchDetail])

  // 数据加载完成后填充只读表单
  useEffect(() => {
    if (detailData) {
      form.setFieldsValue(detailData)
    }
  }, [detailData, form])

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Spin />
      </div>
    )
  }

  if (!detailData) {
    return <Empty description="数据不存在或已删除" />
  }

  // 将 detail_layout_json 映射为 DynamicForm 期望的 form_layout_json 字段
  const detailApp = {
    ...app,
    form_layout_json: app?.detail_layout_json,
  }

  return <DynamicForm app={detailApp} form={form} pageType="detail" />
}
