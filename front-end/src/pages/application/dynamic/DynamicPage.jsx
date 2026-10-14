import { Button, Empty, Form, Spin } from '@arco-design/web-react'
import { useEffect, useMemo } from 'react'
import { useLocation, useParams } from 'react-router-dom'
import { findMenuByPath } from 'src/hooks/useMenuMeta'
import DynamicForm, { evaluateDynamicStates } from 'src/pages/application/dynamic/DynamicForm'
import DynamicList from 'src/pages/application/dynamic/DynamicList'
import { useApplicationData } from 'src/pages/application/dynamic/useApplicationData'
import { safeSetFieldsValue, useApplicationDetailData } from 'src/pages/application/dynamic/useApplicationDetailData'
import NotFound from 'src/pages/error/NotFound'
import { useAuth } from 'src/store/auth-context'

// 合法页面状态与默认降级状态
// list：只读列表页（无新增入口，操作列仅「查看」）
// list-edit：可编辑列表页（工具栏「新增」+ 操作列「查看/编辑/删除」）
const VALID_STATES = ['list', 'list-edit', 'form', 'detail']
const DEFAULT_STATE = 'list'

/**
 * 解析菜单 link_app（code:state，如 app_123:list）：
 * 空值 / state 缺失或纯空白 → 降级 list；返回 { code, state }，code 空表示未配置关联流程
 */
function parseLinkApp(linkApp) {
  const raw = (linkApp || '').trim()
  if (!raw) return { code: '', state: DEFAULT_STATE }
  const [code = '', state = DEFAULT_STATE] = raw.split(':')
  const c = code.trim()
  const s = (state || '').trim()
  return { code: c, state: s || DEFAULT_STATE }
}

/**
 * 动态页面入口：按当前路径反查菜单项，读取 link_app（code:state）后分发渲染
 * list → DynamicList（只读）/ list-edit → DynamicList（可编辑：新增/编辑/删除）/
 * form → DynamicForm / detail → DynamicForm(pageType=detail)；
 * 菜单缺失、link_app 未配置、state 非法、加载失败时均有容错展示
 */
export default function DynamicPage() {
  const location = useLocation()
  const { menus } = useAuth()
  const [form] = Form.useForm()

  // 解析 code/state（格式 "页面编码:list"）：
  // 1) 优先取导航 state（location.state.link_app，不暴露于 URL）；
  // 2) 回退 sessionStorage 缓存（刷新 / 页签切换等 state 丢失场景）；
  // 3) 最后回退菜单项 link_app；均未配置 → 空 code 走 NotFound
  const { id: routeDataId } = useParams()

  const { code, state } = useMemo(() => {
    const stateLink = location.state?.link_app
    const cached = sessionStorage.getItem(`link_app:${location.pathname}`)
    return parseLinkApp(stateLink || cached || findMenuByPath(menus, location.pathname)?.link_app)
  }, [menus, location.pathname, location.state])

  // 流程配置加载（请求 / Loading / 错误态与重试统一由 Hook 管理）
  // list-edit 复用列表配置：后端只认 list / form / detail，新增抽屉由 autoCreate 触发
  const configState = state === 'list-edit' ? 'list' : state
  const { app, loading, error, retry } = useApplicationData(code, configState)

  // 详情模式数据加载（仅 state=detail 时启用；autoFetch 在 app 加载后才为 true）
  const { detailData, loading: detailLoading } = useApplicationDetailData(
    state === 'detail' ? app : null,
    state === 'detail' ? routeDataId : null,
    form,
    { autoFetch: state === 'detail' && Boolean(app) },
  )

  // 动态状态预计算：基于完整业务数据一次性求值 visible_if/disabled_if
  const detailDynamicStates = useMemo(
    () =>
      state === 'detail' && app?.detail_layout_json && detailData
        ? evaluateDynamicStates(app.detail_layout_json, detailData)
        : undefined,
    [state, app?.detail_layout_json, detailData],
  )

  // 详情数据回填表单（safeSetFieldsValue 补写动态状态字段，规避 Arco 快照覆盖）
  useEffect(() => {
    if (state === 'detail' && detailData) {
      safeSetFieldsValue(form, detailData, app?.detail_layout_json)
    }
  }, [state, detailData, form, app?.detail_layout_json])

  // 容错：link_app 未配置 → NotFound
  if (!code) {
    return <NotFound />
  }

  // 容错：state 非法
  if (!VALID_STATES.includes(state)) {
    return <Empty description={`不支持的页面状态：${state}`} />
  }

  if (loading || detailLoading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Spin />
      </div>
    )
  }

  // 容错：配置加载失败或不存在，提供重试入口
  if (error || !app) {
    return (
      <Empty description={error ? '流程配置加载失败' : '流程配置不存在'}>
        <Button type="primary" onClick={retry}>
          重新加载
        </Button>
      </Empty>
    )
  }

  // 按 state 分发渲染（code 传给列表页，供分页/详情跳转使用）
  switch (state) {
    case 'list':
      // 只读列表页：无新增入口，操作列仅「查看」
      return <DynamicList app={app} code={code} />
    case 'list-edit':
      // 可编辑列表页：工具栏提供「新增」，操作列提供「查看/编辑/删除」（不自动打开抽屉）
      return <DynamicList app={app} code={code} editable />
    case 'form':
      return <DynamicForm app={app} form={form} pageType="form" />
    case 'detail':
      return (
        <DynamicForm
          app={{ ...app, form_layout_json: app?.detail_layout_json }}
          form={form}
          pageType="detail"
          detailDynamicStates={detailDynamicStates}
        />
      )
    default:
      // 兜底：合法校验后不可达，渲染默认列表页
      return <DynamicList app={app} code={code} />
  }
}
