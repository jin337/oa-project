import { Spin } from '@arco-design/web-react'
import { lazy, Suspense, useMemo } from 'react'
import {
  BrowserRouter,
  matchPath,
  Navigate,
  useLocation,
  useRoutes,
} from 'react-router-dom'
import MainLayout from 'src/components/layout.jsx'
import { useAuth } from 'src/store/auth-context'
import { getToken } from 'src/utils/auth'

// 路由页面全部懒加载：每个页面单独分包，按需下载
const Login = lazy(() => import('src/pages/Login.jsx'))
const Dashboard = lazy(() => import('src/pages/Dashboard.jsx'))
// 系统管理
const UserManage = lazy(() => import('src/pages/system/UserManage.jsx'))
const RoleManage = lazy(() => import('src/pages/system/RoleManage.jsx'))
const MenuManage = lazy(() => import('src/pages/system/MenuManage.jsx'))
const DeptManage = lazy(() => import('src/pages/system/DeptManage.jsx'))

// 个人中心
const Profile = lazy(() => import('src/pages/profile/Profile.jsx'))

// 应用管理
const ApplicationManage = lazy(() => import('src/pages/application/ApplicationManage.jsx'))
const TableManage = lazy(() => import('src/pages/application/TableManage.jsx'))
const FormElementManage = lazy(() => import('src/pages/application/FormElementManage.jsx'))
const LayoutManage = lazy(() => import('src/pages/application/LayoutManage.jsx'))
const ExamineManage = lazy(() => import('src/pages/application/ExamineManage.jsx'))
const DynamicPage = lazy(() => import('src/pages/application/dynamic/DynamicPage.jsx'))

// 错误页面
const Forbidden = lazy(() => import('src/pages/error/Forbidden.jsx'))

// 审批申请页：分类 + 申请项管理
const ApprovalApply = lazy(() => import('src/pages/approval/Apply.jsx'))
// 审批列表页：我的发起 / 我的待办 / 我审批的 / 抄送我的 / 草稿箱
const ApprovalInitiated = lazy(() => import('src/pages/approval/Initiated.jsx'))
const ApprovalTodo = lazy(() => import('src/pages/approval/Todo.jsx'))
const ApprovalWorkplace = lazy(() => import('src/pages/approval/Workplace.jsx'))
const ApprovalToMe = lazy(() => import('src/pages/approval/ToMe.jsx'))
const ApprovalDrafts = lazy(() => import('src/pages/approval/Drafts.jsx'))

function PageLoading() {
  return (
    <div className="flex min-h-50 items-center justify-center">
      <Spin />
    </div>
  )
}

// 懒加载页面统一包一层 Suspense
function Page({ children }) {
  return <Suspense fallback={<PageLoading />}>{children}</Suspense>
}

/**
 * 菜单 path（模式）-> 页面组件映射表。
 * 路由结构不再写死：由后端返回的菜单树驱动生成，这里只需注册"菜单路径 -> 渲染哪个页面"。
 * 菜单 path 支持动态段（如 /application/:id/tables），与 React Router 路径模式一致。
 * 未在此注册的菜单路径（如动态应用列表页 /application/list）统一交给 DynamicPage 分发渲染。
 */
const PAGE_MAP = [
  // 工作台（首页）
  { pattern: '/', component: Dashboard },
  // 系统管理
  { pattern: '/system/user', component: UserManage },
  { pattern: '/system/role', component: RoleManage },
  { pattern: '/system/menu', component: MenuManage },
  { pattern: '/system/dept', component: DeptManage },
  // 个人中心
  { pattern: '/profile', component: Profile },
  // 应用配置
  { pattern: '/application', component: ApplicationManage },
  { pattern: '/application/:id/tables', component: TableManage },
  { pattern: '/application/:id/elements', component: FormElementManage },
  { pattern: '/application/:id/layout', component: LayoutManage },
  { pattern: '/application/:id/examine', component: ExamineManage },
  // 审批管理
  { pattern: '/approval/apply', component: ApprovalApply },
  { pattern: '/approval/initiated', component: ApprovalInitiated },
  { pattern: '/approval/todo', component: ApprovalTodo },
  { pattern: '/approval/workplace', component: ApprovalWorkplace },
  { pattern: '/approval/tome', component: ApprovalToMe },
  { pattern: '/approval/drafts', component: ApprovalDrafts },
]

// 菜单路径 -> 页面组件：先精确匹配映射表，未命中交给 DynamicPage（动态应用/列表页等）
function matchPage(path) {
  const hit = PAGE_MAP.find((p) => p.pattern === path)
  return hit ? hit.component : DynamicPage
}

// 扁平化菜单树，收集所有可访问的路由路径（排除按钮类型 type=3）
// 一律使用菜单配置的原始 path（link_app 仅用于动态页面请求应用数据，不参与权限路径派生）
function collectMenuPaths(menus) {
  const paths = new Set()
  const walk = (list) => {
    for (const m of list || []) {
      if (m?.path && m.type !== 3) {
        paths.add(m.path)
      }
      if (m?.children) {
        walk(m.children)
      }
    }
  }
  walk(menus)
  return paths
}

// 当前路径是否在用户菜单（原始 path）中：支持动态段模式匹配（如 /application/10/tables 命中 /application/:id/tables）
function isPathAllowed(menus, pathname) {
  const paths = collectMenuPaths(menus)
  for (const p of paths) {
    if (matchPath(p, pathname)) return true
  }
  return false
}

// 路由权限校验包装组件：
// - 菜单未加载完成时显示加载中（避免误判）
// - 当前路径不在用户菜单（原始 path，含动态段匹配）中时重定向到 /403
function RequirePermission({ children }) {
  const { menus, menusLoaded } = useAuth()
  const location = useLocation()

  if (!menusLoaded) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spin />
      </div>
    )
  }

  if (!isPathAllowed(menus, location.pathname)) {
    return <Navigate to="/403" replace />
  }

  return children
}

/**
 * 由后端菜单树动态生成子路由：
 * - 仅注册"页面菜单"（type=2、启用、有 path）——目录与按钮不注册路由
 * - 每个菜单路径通过 PAGE_MAP 匹配页面组件，未注册的交给 DynamicPage
 * - 统一包 RequirePermission（权限校验 + 动态段模式匹配）
 */
function buildMenuRoutes(menus) {
  const routes = []
  const walk = (list) => {
    for (const m of list || []) {
      if (m.type === 2 && m.status === 1 && m.path) {
        const Component = matchPage(m.path)
        routes.push({
          // 嵌套路由使用相对路径（去掉前导斜杠）
          path: m.path.replace(/^\//, ''),
          element: (
            <Page>
              <RequirePermission>
                <Component />
              </RequirePermission>
            </Page>
          ),
        })
      }
      if (m.children?.length) {
        walk(m.children)
      }
    }
  }
  walk(menus)
  return routes
}

/**
 * 动态路由根组件：
 * - 登录守卫：未登录且不在登录页 → 重定向登录页；已登录访问登录页 → 回首页
 * - 菜单树加载完成前显示全局加载（路由依赖 menus 生成）
 * - 路由结构 = 登录页 + 主布局(首页/菜单动态路由/403/兜底403)
 */
function AppRouter() {
  const location = useLocation()
  const { menus, menusLoaded } = useAuth()

  const routes = useMemo(
    () => [
      {
        path: '/login',
        element: (
          <Page>
            <Login />
          </Page>
        ),
      },
      {
        path: '/',
        element: <MainLayout />,
        children: [
          { index: true, element: <Page><Dashboard /></Page> },
          ...buildMenuRoutes(menus),
          { path: '403', element: <Page><Forbidden /></Page> },
          // 未注册路径统一重定向 403（菜单外的路径不可访问）
          { path: '*', element: <Navigate to="/403" replace /> },
        ],
      },
    ],
    [menus],
  )

  // 注意：所有 hook 必须无条件调用（useRoutes 也是 hook），条件 return 一律放在 hook 之后
  const element = useRoutes(routes)

  // 登录守卫：未登录且不在登录页 → 重定向登录页；已登录访问登录页 → 回首页
  if (!getToken() && location.pathname !== '/login') {
    return <Navigate to="/login" replace />
  }
  if (getToken() && location.pathname === '/login') {
    return <Navigate to="/" replace />
  }

  // 菜单未加载完成时显示全局加载（仅对已登录用户；未登录用户直接渲染登录页，不需要菜单）
  if (getToken() && !menusLoaded) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spin size={40} tip="菜单加载中..." />
      </div>
    )
  }

  return element
}

export default function AppRouterProvider() {
  return (
    <BrowserRouter>
      <AppRouter />
    </BrowserRouter>
  )
}
