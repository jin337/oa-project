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
import { useEffect, useMemo } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { APP_NAME } from '../config/app.js'
import { useAuth } from '../store/auth-context'
import { TabProvider } from '../store/tab-context'
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
      if (m.path) {
        return (
          <MenuItem key={m.path} icon={menuIcon(m)}>
            {m.name}
          </MenuItem>
        )
      }
      return null
    })
    .filter(Boolean)
}

// 动态子路由路径段 -> 显示名称映射（用于面包屑）
const SUB_ROUTE_NAMES = {
  tables: '表管理',
  'form-elements': '表单元素',
  layout: '布局管理',
}

// 在菜单树中查找当前路径对应的层级链（目录 → 页面），用于面包屑和菜单高亮
// 支持动态子路由：精确匹配优先，未命中时回退到最长前缀匹配（如 /application/1/tables → /application）
function findMenuChain(menus, pathname) {
  let prefixMatch = null
  const walk = (list, chain) => {
    for (const m of list || []) {
      if (m.status !== 1 || m.type === 3) continue
      const nextChain = [...chain, m]
      if (m.path === pathname) return nextChain
      // 记录最长前缀匹配，供动态子路由回退
      if (m.path && pathname.startsWith(m.path + '/')) {
        if (!prefixMatch || m.path.length > prefixMatch[prefixMatch.length - 1].path.length) {
          prefixMatch = nextChain
        }
      }
      if (m.children?.length) {
        const found = walk(m.children, nextChain)
        if (found) return found
      }
    }
    return null
  }
  return walk(menus, []) || prefixMatch
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

  // 当前路径对应的菜单链（精确匹配或最长前缀匹配）
  const activeChain = useMemo(
    () => findMenuChain(menus, location.pathname),
    [menus, location.pathname],
  )

  // 顶部导航高亮的菜单 key：动态子路由时高亮其父级菜单项
  const activeMenuKey = activeChain?.length ? activeChain[activeChain.length - 1].path : location.pathname

  // 根据当前路由与菜单树动态生成面包屑：根节点(首页图标) / 目录... / 当前页面
  const breadcrumbItems = useMemo(() => {
    const items = [{ title: '首页', path: '/', isRoot: true }]
    if (location.pathname === '/') return items

    if (activeChain && activeChain.length) {
      activeChain
        .filter((m) => m.path !== '/')
        .forEach((m) => items.push({ title: m.name, path: m.path || null }))

      // 前缀匹配（动态子路由）：在父级菜单后追加当前子页面名称
      const lastPath = activeChain[activeChain.length - 1]?.path
      if (lastPath && location.pathname !== lastPath && location.pathname.startsWith(lastPath + '/')) {
        const segment = location.pathname.split('/').pop()
        items.push({ title: SUB_ROUTE_NAMES[segment] || segment, path: null })
      }
    } else {
      items.push({ title: location.pathname, path: null })
    }
    return items
  }, [location.pathname, activeChain])

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
          {breadcrumbItems.length > 1 && (
            <Breadcrumb className="mb-3">
              {breadcrumbItems.map((item, idx) => (
                <Breadcrumb.Item key={item.path || item.title || idx}>
                  {item.isRoot ? <IconHome /> : item.title}
                </Breadcrumb.Item>
              ))}
            </Breadcrumb>
          )}
          <Outlet />
        </Content>
      </Layout>
    </TabProvider>
  )
}
