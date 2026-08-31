import { lazy, Suspense } from 'react'
import { createBrowserRouter, RouterProvider, redirect } from 'react-router-dom'
import { Spin } from '@arco-design/web-react'
import { getToken } from './utils/auth'
import MainLayout from './components/layout.jsx'

// 路由页面全部懒加载：每个页面单独分包，按需下载
const Login = lazy(() => import('./pages/Login.jsx'))
const Dashboard = lazy(() => import('./pages/Dashboard.jsx'))
const UserManage = lazy(() => import('./pages/system/UserManage.jsx'))
const RoleManage = lazy(() => import('./pages/system/RoleManage.jsx'))
const MenuManage = lazy(() => import('./pages/system/MenuManage.jsx'))
const DeptManage = lazy(() => import('./pages/system/DeptManage.jsx'))
const NotFound = lazy(() => import('./pages/NotFound.jsx'))

function PageLoading() {
  return (
    <div className="h-full flex items-center justify-center" style={{ minHeight: 200 }}>
      <Spin />
    </div>
  )
}

// 懒加载页面统一包一层 Suspense
function Page({ children }) {
  return <Suspense fallback={<PageLoading />}>{children}</Suspense>
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
            <UserManage />
          </Page>
        ),
      },
      {
        path: 'system/role',
        element: (
          <Page>
            <RoleManage />
          </Page>
        ),
      },
      {
        path: 'system/menu',
        element: (
          <Page>
            <MenuManage />
          </Page>
        ),
      },
      {
        path: 'system/dept',
        element: (
          <Page>
            <DeptManage />
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

export default function App() {
  return <RouterProvider router={router} />
}
