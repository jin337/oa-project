import { Empty, Form, Spin } from '@arco-design/web-react'
import { useParams } from 'react-router-dom'
import DynamicForm from 'src/pages/application/dynamic/DynamicForm'
import { useApplicationDetailData } from 'src/pages/application/dynamic/useApplicationDetailData'

/**
 * 动态详情还原组件：根据应用配置（state=detail）还原只读详情展示页面。
 * - 通过 dataId（优先 props 传入，其次路由参数 id）获取数据记录
 * - 数据请求 / 加载状态 / 回填 / detail_layout_json 映射统一交由 useApplicationDetailData 处理
 * - 使用 detail_layout_json 渲染只读表单（复用 DynamicForm，pageType='detail'）
 *
 * @param {object} app    应用配置对象（含 id / name / detail_layout_json 等字段）
 * @param {string|number} dataId  数据记录 ID（可选；Drawer 场景由父组件传入，路由场景回退 useParams().id）
 */
export default function DynamicDetail({ app, dataId: propDataId }) {
  const { id: routeDataId } = useParams()
  const dataId = propDataId || routeDataId
  const [form] = Form.useForm()

  const { detailData, loading, detailApp } = useApplicationDetailData(app, dataId, form)

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

  // detailApp 已由 hook 将 detail_layout_json 映射为 form_layout_json
  return <DynamicForm app={detailApp} form={form} pageType="detail" />
}
