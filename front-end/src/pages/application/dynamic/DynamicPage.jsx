import { Button, Empty, Form, Spin } from '@arco-design/web-react'
import { useMemo } from 'react'
import { useLocation } from 'react-router-dom'
import { findMenuByPath } from 'src/hooks/useMenuMeta'
import { useAuth } from 'src/store/auth-context'
import NotFound from 'src/pages/error/NotFound'
import DynamicDetail from 'src/pages/application/dynamic/DynamicDetail'
import DynamicForm from 'src/pages/application/dynamic/DynamicForm'
import DynamicList from 'src/pages/application/dynamic/DynamicList'
import { useApplicationData } from 'src/pages/application/dynamic/useApplicationData'

// 合法页面状态与默认降级状态
const VALID_STATES = ['list', 'form', 'detail']
const DEFAULT_STATE = 'list'

/**
 * 解析菜单 link_app（code:state，如 app_123:list）：
 * 空值 / state 缺失或纯空白 → 降级 list；返回 { code, state }，code 空表示未配置关联应用
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
 * list → DynamicList / form → DynamicForm / detail → DynamicDetail；
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
  const { code, state } = useMemo(() => {
    const stateLink = location.state?.link_app
    const cached = sessionStorage.getItem(`link_app:${location.pathname}`)
    return parseLinkApp(stateLink || cached || findMenuByPath(menus, location.pathname)?.link_app)
  }, [menus, location.pathname, location.state])

  // 应用配置加载（请求 / Loading / 错误态与重试统一由 Hook 管理）
  const { app, loading, error, retry } = useApplicationData(code, state)

  // 容错：link_app 未配置 → NotFound
  if (!code) {
    return <NotFound />
  }

  // 容错：state 非法
  if (!VALID_STATES.includes(state)) {
    return <Empty description={`不支持的页面状态：${state}`} />
  }

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Spin />
      </div>
    )
  }

  // 容错：配置加载失败或不存在，提供重试入口
  if (error || !app) {
    return (
      <Empty description={error ? '应用配置加载失败' : '应用配置不存在'}>
        <Button type="primary" onClick={retry}>
          重新加载
        </Button>
      </Empty>
    )
  }

  // 按 state 分发渲染（code 传给列表页，供分页/详情跳转使用）
  switch (state) {
    case 'list':
      return <DynamicList app={app} code={code} />
    case 'form':
      return <DynamicForm app={app} form={form} pageType="form" />
    case 'detail':
      return <DynamicDetail app={app} />
    default:
      // 兜底：合法校验后不可达，渲染默认列表页
      return <DynamicList app={app} code={code} />
  }
}
