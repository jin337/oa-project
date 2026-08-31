import { Avatar, Dropdown, Layout, Menu, Space, Typography } from '@arco-design/web-react'
import { IconApps, IconDesktop, IconHome, IconSettings, IconStorage, IconUser } from '@arco-design/web-react/icon'
import { useEffect } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../store/auth-context'

const Sider = Layout.Sider
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

// 把后端菜单树转成 Arco Menu 项（只渲染目录和页面菜单，按钮权限项跳过）
function renderMenus(menus) {
  return menus
    .filter((m) => m.status === 1 && m.type !== 3)
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
    <Menu onClickMenuItem={(key) => key === 'logout' && logout()}>
      <MenuItem key="logout">退出登录</MenuItem>
    </Menu>
  )

  return (
    <Layout className="h-full">
      <Sider breakpoint="xl" width={220} style={{ background: '#001529' }}>
        <div className="h-16 flex items-center justify-center text-white text-lg font-semibold">RBAC 管理系统</div>
        <Menu
          theme="dark"
          autoOpen
          selectedKeys={[location.pathname]}
          onClickMenuItem={(key) => {
            if (typeof key === 'string' && key.startsWith('/')) {
              navigate(key)
            }
          }}
          style={{ background: 'transparent' }}>
          <MenuItem key="/" icon={<IconHome />}>
            工作台
          </MenuItem>
          {menus && menus.length > 0 ? renderMenus(menus) : null}
        </Menu>
      </Sider>
      <Layout>
        <Header className="flex items-center justify-between bg-white p-4 border-b border-gray-200">
          <Typography.Title heading={6} style={{ margin: 0 }}>
            后台管理
          </Typography.Title>
          <Dropdown droplist={profileMenu} position="br">
            <Space className="cursor-pointer">
              <Avatar size={32} style={{ backgroundColor: '#165dff' }}>
                <IconUser />
              </Avatar>
              <Typography.Text>{user?.username || '加载中'}</Typography.Text>
            </Space>
          </Dropdown>
        </Header>
        <Content className="p-4 overflow-auto bg-gray-50">
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  )
}
