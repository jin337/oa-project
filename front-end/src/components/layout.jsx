import {
  Avatar,
  Breadcrumb,
  Dropdown,
  Layout,
  Menu,
  Space,
  Typography,
} from '@arco-design/web-react'
import {
  IconApps,
  IconDesktop,
  IconHome,
  IconSettings,
  IconStorage,
  IconUser,
} from '@arco-design/web-react/icon'
import { useEffect } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { APP_NAME } from '../config/app.js'
import { useMenuMeta } from '../hooks/useMenuMeta'
import { useAuth } from '../store/auth-context'
import { TabProvider, useTabs } from '../store/tab-context'
import TabsBar from './tabs-bar'

const Header = Layout.Header
const Content = Layout.Content
const MenuItem = Menu.Item
const SubMenu = Menu.SubMenu

// 后端菜单 icon 字段 -> Arco 图标组件映射
const ICON_MAP = {
  setting: <IconSettings />,
  user: <IconUser />,
  users: <IconUser />,
  safe: <IconSettings />,
  storage: <IconStorage />,
  apps: <IconApps />,
  home: <IconHome />,
  desktop: <IconDesktop />,
}

function menuIcon(menu) {
  return ICON_MAP[menu.icon] || <IconApps />
}

// 把后端菜单树转成 Arco Menu 项（只渲染目录和页面菜单，按钮权限项跳过；hidden=1 的菜单不显示在导航栏）
// 导航路径一律使用菜单配置的原始 path（link_app 仅用于动态页面请求应用数据，不参与路由派生）
function renderMenus(menus) {
  return menus
    .filter((m) => m.status === 1 && m.type !== 3 && m.hidden !== 1)
    .sort((a, b) => (a.sort || 0) - (b.sort || 0))
    .map((m) => {
      const children = m.children ? renderMenus(m.children) : []
      if (m.type === 1 && children.length > 0) {
        return (
          <SubMenu key={`dir-${m.id}`} title={m.name} icon={menuIcon(m)}>
            {children}
          </SubMenu>
        )
      }
      // 导航路径：菜单配置的原始 path（link_app 不参与路径派生）
      const navPath = m.path
      if (navPath) {
        return (
          <MenuItem key={navPath} icon={menuIcon(m)}>
            {m.name}
          </MenuItem>
        )
      }
      return null
    })
    .filter(Boolean)
}

/**
 * 面包屑：直接消费当前激活页签内嵌的 breadcrumbs（单一数据源：tab-context）。
 * 首页（/）与无页签的系统路径（如 /403）不渲染；
 * 渲染结构为 [首页图标, ...页签 breadcrumbs]。
 */
function ContentBreadcrumb() {
  const { tabs, activeTab } = useTabs()
  if (activeTab === '/') return null
  const active = tabs.find((t) => t.path === activeTab)
  const crumbs = active?.breadcrumbs
  if (!crumbs || !crumbs.length) return null
  return (
    <Breadcrumb className="mb-3">
      <Breadcrumb.Item key="/">
        <IconHome />
      </Breadcrumb.Item>
      {crumbs.map((title, idx) => (
        <Breadcrumb.Item key={idx}>{title}</Breadcrumb.Item>
      ))}
    </Breadcrumb>
  )
}

export default function MainLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, menus, logout, refreshProfile } = useAuth()

  // 进入后台后拉取用户资料与菜单（已有则跳过）
  useEffect(() => {
    refreshProfile().catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const profileMenu = (
    <Menu
      onClickMenuItem={(key) => {
        if (key === 'logout') {
          logout()
          navigate('/login', { replace: true })
        }
        if (key === 'profile') navigate('/profile')
      }}
    >
      <MenuItem key="profile" icon={<IconUser />}>
        用户设置
      </MenuItem>
      <MenuItem key="logout">退出登录</MenuItem>
    </Menu>
  )

  // 当前路径对应的菜单链（精确匹配或最长前缀匹配），由公共模块 useMenuMeta 统一提供
  const { chain: activeChain } = useMenuMeta(location.pathname)

  // 顶部导航高亮的菜单 key：动态子路由时高亮其父级菜单项
  const activeMenuKey = activeChain?.length ? activeChain[activeChain.length - 1].path : location.pathname

  return (
    <TabProvider>
      <Layout className="h-full">
        <Header className="flex items-center gap-8 border-b border-gray-200 bg-white px-6">
          {/* 左侧：Logo + 系统标题，点击返回首页 */}
          <div
            className="flex shrink-0 cursor-pointer items-center gap-2"
            onClick={() => navigate('/')}
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#165dff] text-lg text-white">
              <IconStorage />
            </div>
            <Typography.Text className="text-lg! font-semibold!">{APP_NAME}</Typography.Text>
          </div>

          {/* 中间：水平菜单，自适应宽度 */}
          <Menu
            mode="horizontal"
            selectedKeys={[activeMenuKey]}
            onClickMenuItem={(key) => {
              if (typeof key === 'string' && key.startsWith('/')) {
                navigate(key)
              }
            }}
            className="min-w-0 flex-1"
          >
            <MenuItem key="/" icon={<IconHome />}>
              工作台
            </MenuItem>
            {menus && menus.length > 0 ? renderMenus(menus) : null}
          </Menu>

          {/* 右侧：用户信息 + 退出登录 */}
          <Dropdown droplist={profileMenu} position="br">
            <Space className="shrink-0 cursor-pointer">
              <Avatar size={32} className="bg-[#165dff]!">
                <IconUser />
              </Avatar>
              <Typography.Text>
                {user?.profile?.nickname || user?.username || '加载中'}
              </Typography.Text>
            </Space>
          </Dropdown>
        </Header>

        {/* 页签栏 */}
        <TabsBar />

        <Content className="flex-1 overflow-auto bg-gray-50 p-4">
          {/* 面包屑：由当前激活页签的 breadcrumbs 驱动 */}
          <ContentBreadcrumb />
          <Outlet />
        </Content>
      </Layout>
    </TabProvider>
  )
}
