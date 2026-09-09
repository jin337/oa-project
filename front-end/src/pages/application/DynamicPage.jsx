import { Empty, Form, Message, Spin } from '@arco-design/web-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import * as applicationApi from '../../api/application'
import { useAuth } from '../../store/auth-context'
import DynamicDetail from './DynamicDetail'
import DynamicForm from './DynamicForm'
import DynamicList from './DynamicList'

// 合法页面状态与默认降级状态
const VALID_STATES = ['list', 'form', 'detail']
const DEFAULT_STATE = 'list'

/**
 * 在菜单树中查找 path 与当前路由精确匹配的菜单项（递归，返回首个命中）。
 * 动态页面路由使用菜单配置的原始 path（如 /examine），需要据此反查菜单项，
 * 以读取其上配置的 link_app（格式 code:state）。
 */
function findMenuByPath(menus, pathname) {
  let found = null
  const walk = (list) => {
    for (const m of list || []) {
      if (m?.path === pathname) {
        found = m
        return true
      }
      if (m?.children?.length && walk(m.children)) return true
    }
    return false
  }
  walk(menus)
  return found
}

/**
 * 解析菜单 link_app（格式 code:state，如 app_1788413612:list）：
 * - 无 ":" 或 state 缺失时降级为默认列表页（list）
 * - 返回 { code, state }，code 为空表示未配置关联应用
 */
function parseLinkApp(linkApp) {
  const raw = (linkApp || '').trim()
  if (!raw) return { code: '', state: DEFAULT_STATE }
  const [code = '', state = DEFAULT_STATE] = raw.split(':')
  return { code: code.trim(), state: (state || DEFAULT_STATE).trim() }
}

/**
 * 旧格式路径回退解析（页面内部跳转，如 DynamicList 的详情 /app/:code/detail/:id）：
 * 当当前路径匹配不到菜单项（无 link_app 可读）时，从 pathname 提取 code 与 state。
 * - /app/app_123/detail/5  → code=app_123, state=detail
 * - /app/app_123:list     → code=app_123, state=list
 */
function parsePathFallback(pathname) {
  if (!(pathname || '').startsWith('/app')) return { code: '', state: DEFAULT_STATE }
  const raw = pathname.replace(/^\/app\/?/, '')
  const segments = raw.split('/')
  let code = (segments[0] || '').trim()
  let state = (segments[1] || '').trim()
  if (code.includes(':')) {
    const [c, s] = code.split(':')
    code = (c || '').trim()
    state = (s || '').trim() || state
  }
  return { code, state: state || DEFAULT_STATE }
}

/**
 * 动态页面入口分发组件：
 * 导航路径保持菜单配置的原始 path（如 /examine），本组件依据当前 location.pathname
 * 从菜单树反查菜单项，读取其 link_app（code:state）作为请求参数：
 *   - list   → DynamicList（数据列表）
 *   - form   → DynamicForm（表单填写）
 *   - detail → DynamicDetail（只读详情）
 * 容错：菜单缺失 / link_app 未配置 / state 不合法时给出友好提示，不崩溃。
 */
export default function DynamicPage() {
  const location = useLocation()
  // 唯一数据源：登录后从后端获取的菜单树（本组件在 RequirePermission 内渲染，menus 已就绪）
  const { menus } = useAuth()
  // 当前路径对应的菜单项：仅当菜单树或路径变化时重算
  const menuItem = useMemo(
    () => findMenuByPath(menus, location.pathname),
    [menus, location.pathname],
  )
  // 解析顺序：优先读菜单项 link_app（导航走菜单原始 path 时的主路径）；
  // 菜单匹配不到（如 DynamicList 详情跳转 /app/:code/detail/:id）时回退旧格式路径解析
  const menuParsed = useMemo(() => parseLinkApp(menuItem?.link_app), [menuItem])
  const fallbackParsed = useMemo(
    () => parsePathFallback(location.pathname),
    [location.pathname],
  )
  const { code, state } = menuParsed.code ? menuParsed : fallbackParsed

  const [app, setApp] = useState(null)
  const [loading, setLoading] = useState(true)
  const [form] = Form.useForm()

  const fetchApp = useCallback(async () => {
    if (!code) return
    setLoading(true)
    try {
      const res = await applicationApi.getApplicationByCode(code, state)
      setApp(res.data)
    } catch {
      Message.error('应用配置加载失败')
    } finally {
      setLoading(false)
    }
  }, [code, state])

  useEffect(() => {
    fetchApp()
  }, [fetchApp])

  // 容错 1：菜单未配置 link_app（或菜单项缺失），无法确定要加载的应用
  if (!code) {
    return <Empty description="该菜单未关联应用配置，无法加载动态页面" />
  }

  // 容错 2：state 不合法（非 list / form / detail），友好提示并阻断渲染
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

  if (!app) {
    return <Empty description="应用配置不存在" />
  }

  // 按 state 分发渲染对应组件（code 由本组件解析后传给子组件，列表分页/详情跳转依赖）
  switch (state) {
    case 'list':
      return <DynamicList app={app} code={code} />
    case 'form':
      return <DynamicForm app={app} form={form} pageType="form" />
    case 'detail':
      return <DynamicDetail app={app} />
    default:
      // 双重保险：合法校验后理论上不可达，兜底渲染默认列表页
      return <DynamicList app={app} code={code} />
  }
}
