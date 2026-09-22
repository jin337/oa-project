import { Empty, Form, Spin } from '@arco-design/web-react'
import { useEffect, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import DynamicForm, { evaluateDynamicStates } from 'src/pages/application/dynamic/DynamicForm'
import { useApplicationDetailData } from 'src/pages/application/dynamic/useApplicationDetailData'

/**
 * 动态详情还原组件：根据应用配置（state=detail）还原只读详情展示页面。
 * - 通过 dataId（优先 props 传入，其次路由参数 id）获取数据记录
 * - 数据请求 / 加载状态 / 回填 / detail_layout_json 映射统一交由 useApplicationDetailData 处理
 * - 使用 detail_layout_json 渲染只读表单（复用 DynamicForm，pageType='detail'）
 *
 * @param {object} app    应用配置对象（含 id / name / detail_layout_json 等字段）
 * @param {string|number} dataId  数据记录 ID（可选；Drawer 场景由父组件传入，路由场景回退 useParams().id）
 * @param {object} initialData  外部预加载的业务数据（传入时跳过自动请求，直接用于表单回填）
 * @param {array}  fieldPerms   字段权限 [{field, perm}]（审批详情场景由父组件传入，透传 DynamicForm 过滤隐藏字段）
 * @param {function} onFormReady  表单实例创建后的回调 (form) => void（审批场景父组件持有表单，提交时读取修改后的数据）
 */
export default function DynamicDetail({ app, dataId: propDataId, initialData, fieldPerms, onFormReady, editable = false }) {
  const { id: routeDataId } = useParams()
  const dataId = propDataId || routeDataId
  const [form] = Form.useForm()

  // 表单实例就绪后回调父组件（仅通知一次，form 实例在整个生命周期内稳定）
  useEffect(() => {
    onFormReady?.(form)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form])

  // 外部已提供数据时跳过自动请求（审批详情场景：复用实例接口返回的 business_data）
  const { detailData, loading, detailApp } = useApplicationDetailData(app, dataId, form, {
    autoFetch: !initialData,
  })

  // 外部数据变化时同步回填表单：detail 模式联动已禁用（handleValuesChange 按 isRuntime 控制），
  // setFieldsValue 回填不会触发 on_change 清空目标字段，普通回填即可
  useEffect(() => {
    if (initialData && form) {
      form.setFieldsValue(initialData)
    }
  }, [initialData, form])

  const displayData = initialData || detailData

  // detail 只读静态映射：基于完整业务数据预计算各动态状态字段（visible_if/disabled_if）的求值结果，
  // 传给 DynamicForm 后只读分支直接渲染，无需 shouldUpdate（可编辑审批字段 perm=2 仍走 shouldUpdate）
  const detailDynamicStates = useMemo(
    () =>
      app?.detail_layout_json && displayData
        ? evaluateDynamicStates(app.detail_layout_json, displayData)
        : undefined,
    [app?.detail_layout_json, displayData],
  )

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Spin />
      </div>
    )
  }

  if (!displayData) {
    return <Empty description="数据不存在或已删除" />
  }

  return (
    <DynamicForm
      app={detailApp}
      form={form}
      pageType="detail"
      fieldPerms={fieldPerms}
      editable={editable}
      detailDynamicStates={detailDynamicStates}
    />
  )
}
