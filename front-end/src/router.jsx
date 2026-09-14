import { Spin } from '@arco-design/web-react'
import { lazy, Suspense } from 'react'
import {
  createBrowserRouter,
  Navigate,
  redirect,
  RouterProvider,
  useLocation,
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

// 路由权限校验包装组件：
// - 菜单未加载完成时显示加载中（避免误判）
// - 当前路径不在用户菜单（原始 path）中时重定向到 /403
// - 登录校验由外层路由 loader 负责，优先级高于本组件
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

  const allowedPaths = collectMenuPaths(menus)
  if (!allowedPaths.has(location.pathname)) {
    return <Navigate to="/403" replace />
  }

  return children
}

// Data Mode 路由：后台路由组通过 loader 做登录守卫，未登录直接重定向到登录页
const router = createBrowserRouter([
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
    loader: async () => {
      if (!getToken()) {
        return redirect('/login')
      }
      return null
    },
    children: [
      {
        index: true,
        element: (
          <Page>
            <Dashboard />
          </Page>
        ),
      },
      {
        path: 'system/user',
        element: (
          <Page>
            <RequirePermission>
              <UserManage />
            </RequirePermission>
          </Page>
        ),
      },
      {
        path: 'system/role',
        element: (
          <Page>
            <RequirePermission>
              <RoleManage />
            </RequirePermission>
          </Page>
        ),
      },
      {
        path: 'system/menu',
        element: (
          <Page>
            <RequirePermission>
              <MenuManage />
            </RequirePermission>
          </Page>
        ),
      },
      {
        path: 'system/dept',
        element: (
          <Page>
            <RequirePermission>
              <DeptManage />
            </RequirePermission>
          </Page>
        ),
      },
      {
        path: 'profile',
        element: (
          <Page>
            <RequirePermission>
              <Profile />
            </RequirePermission>
          </Page>
        ),
      },
      {
        path: 'application',
        element: (
          <Page>
            <RequirePermission>
              <ApplicationManage />
            </RequirePermission>
          </Page>
        ),
      },
      {
        path: 'application/:id/tables',
        element: (
          <Page>
            <TableManage />
          </Page>
        ),
      },
      {
        path: 'application/:id/form-elements',
        element: (
          <Page>
            <FormElementManage />
          </Page>
        ),
      },
      {
        path: 'application/:id/layout',
        element: (
          <Page>
            <LayoutManage />
          </Page>
        ),
      },
      {
        path: 'application/:id/examine',
        element: (
          <Page>
            <ExamineManage />
          </Page>
        ),
      },
      {
        path: 'approval/apply',
        element: (
          <Page>
            <RequirePermission>
              <ApprovalApply />
            </RequirePermission>
          </Page>
        ),
      },
      {
        path: 'approval/initiated',
        element: (
          <Page>
            <ApprovalInitiated />
          </Page>
        ),
      },
      {
        path: 'approval/todo',
        element: (
          <Page>
            <ApprovalTodo />
          </Page>
        ),
      },
      {
        path: 'approval/workplace',
        element: (
          <Page>
            <ApprovalWorkplace />
          </Page>
        ),
      },
      {
        path: 'approval/tome',
        element: (
          <Page>
            <ApprovalToMe />
          </Page>
        ),
      },
      {
        path: 'approval/drafts',
        element: (
          <Page>
            <ApprovalDrafts />
          </Page>
        ),
      },
      {
        path: '403',
        element: (
          <Page>
            <Forbidden />
          </Page>
        ),
      },
      // 动态应用页面路由：通配兜底，由 DynamicPage 从 location.pathname 解析 code / state 并分发渲染
      {
        path: '*',
        element: (
          <Page>
            <RequirePermission>
              <DynamicPage />
            </RequirePermission>
          </Page>
        ),
      },
    ],
  },
])

export { router, RouterProvider }
