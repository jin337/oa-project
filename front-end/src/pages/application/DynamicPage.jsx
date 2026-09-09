import { Button, Empty, Form, Spin } from '@arco-design/web-react'
import { useMemo } from 'react'
import { useLocation } from 'react-router-dom'
import { findMenuByPath } from '../../hooks/useMenuMeta'
import { useAuth } from '../../store/auth-context'
import NotFound from '../error/NotFound'
import DynamicDetail from './DynamicDetail'
import DynamicForm from './DynamicForm'
import DynamicList from './DynamicList'
import { useApplicationData } from './useApplicationData'

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

  // 解析 code/state：仅以菜单项 link_app 为准；菜单缺失或未配置 → 空 code 走 NotFound
  const { code, state } = useMemo(
    () => parseLinkApp(findMenuByPath(menus, location.pathname)?.link_app),
    [menus, location.pathname],
  )

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
