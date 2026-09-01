import { Spin } from '@arco-design/web-react'
import { lazy, Suspense } from 'react'
import { createBrowserRouter, Navigate, redirect, RouterProvider, useLocation } from 'react-router-dom'
import MainLayout from './components/layout.jsx'
import { useAuth } from './store/auth-context'
import { getToken } from './utils/auth'

// 路由页面全部懒加载：每个页面单独分包，按需下载
const Login = lazy(() => import('./pages/Login.jsx'))
const Dashboard = lazy(() => import('./pages/Dashboard.jsx'))
const UserManage = lazy(() => import('./pages/system/UserManage.jsx'))
const RoleManage = lazy(() => import('./pages/system/RoleManage.jsx'))
const MenuManage = lazy(() => import('./pages/system/MenuManage.jsx'))
const DeptManage = lazy(() => import('./pages/system/DeptManage.jsx'))
const Profile = lazy(() => import('./pages/Profile.jsx'))
const Forbidden = lazy(() => import('./pages/Forbidden.jsx'))
const NotFound = lazy(() => import('./pages/NotFound.jsx'))

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
// - 当前路径不在用户菜单中时重定向到 /403
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
        path: '403',
        element: (
          <Page>
            <Forbidden />
          </Page>
        ),
      },
      {
        path: '*',
        element: (
          <Page>
            <NotFound />
          </Page>
        ),
      },
    ],
  },
])

export { router, RouterProvider }
