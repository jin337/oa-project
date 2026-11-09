import {
  Avatar,
  Breadcrumb,
  Dropdown,
  Layout,
  Menu,
  Message,
  Select,
  Space,
  Tabs,
  Typography,
} from '@arco-design/web-react'
import { IconHome, IconMore, IconStorage, IconUser } from '@arco-design/web-react/icon'
import { useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import * as userApi from 'src/api/user'
import { MenuIcon } from 'src/components/icon-select'
import { APP_NAME } from 'src/config/app.js'
import { useMenuMeta } from 'src/hooks/useMenuMeta'
import KeepAliveOutlet from 'src/pages/layout/keep-alive-outlet'
import NotificationBell from 'src/pages/layout/notification-bell'
import { useAuth } from 'src/store/auth-context'
import { TabProvider, useTabs } from 'src/store/tab-context'

const Header = Layout.Header
const Content = Layout.Content
const MenuItem = Menu.Item
const SubMenu = Menu.SubMenu
const TabPane = Tabs.TabPane

// 页签右键上下文菜单项（固定首页禁闭，关闭左侧/右侧对首页天然无操作）
const CONTEXT_MENU_KEYS = [
  { key: 'left', label: '关闭左侧' },
  { key: 'right', label: '关闭右侧' },
  { key: 'others', label: '关闭其他' },
  { key: 'all', label: '关闭所有' },
]

// 把后端菜单树转成 Arco Menu 项（只渲染目录和页面菜单，按钮权限项跳过；hidden=1 的菜单不显示在导航栏）
// 导航路径一律使用菜单配置的原始 path（link_app 仅用于动态页面请求流程数据，不参与路由派生）
function renderMenus(menus) {
  return menus
    .filter((m) => m.status === 1 && m.type !== 3 && m.hidden !== 1)
    .sort((a, b) => (a.sort || 0) - (b.sort || 0))
    .map((m) => {
      const children = m.children ? renderMenus(m.children) : []
      if (m.type === 1 && children.length > 0) {
        return (
          <SubMenu
            key={`dir-${m.id}`}
            title={
              <>
                {m.icon && <MenuIcon name={m.icon} />}
                {m.name}
              </>
            }
            triggerProps={{ popupStyle: { maxHeight: '600px' } }}
          >
            {children}
          </SubMenu>
        )
      }
      // 导航路径：菜单配置的原始 path（link_app 不参与路径派生）
      const navPath = m.path
      if (navPath) {
        return (
          <MenuItem key={navPath}>
            {m.icon && (
              <>
                <MenuIcon name={m.icon} />
                &nbsp;
              </>
            )}
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
    <Breadcrumb className="mb-3 px-4">
      <Breadcrumb.Item key="/">
        <IconHome />
      </Breadcrumb.Item>
      {crumbs.map((title, idx) => (
        <Breadcrumb.Item key={idx}>{title}</Breadcrumb.Item>
      ))}
    </Breadcrumb>
  )
}

/**
 * 顶部导航栏：Logo + 水平菜单 + 用户信息下拉。
 * 独立组件避免主布局因菜单高亮/用户资料等局部状态变化而整体重渲染。
 */
function HeaderBar() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, menus, logout, updateUser, hasPerm } = useAuth()
  // 当前路径对应的菜单链（精确匹配或最长前缀匹配），用于顶部导航高亮
  const { chain: activeChain } = useMenuMeta(location.pathname)
  // 渲染可见菜单 key 集合（status=1、非按钮、非 hidden、有 path）
  // 用于高亮回退：隐藏子菜单（如 /application/list 的列表页 hidden=1 不渲染）命中时，回退到其可见父级
  const visibleMenuKeys = useMemo(() => {
    const keys = new Set()
    const walk = (list) => {
      for (const m of list || []) {
        if (m.status === 1 && m.type !== 3 && m.hidden !== 1 && m.path) keys.add(m.path)
        if (m.children) walk(m.children)
      }
    }
    walk(menus)
    return keys
  }, [menus])
  // 高亮 key：从菜单链末节点向前回退，取第一个渲染可见的菜单项；均不可见则回退当前路径
  const activeMenuKey = useMemo(() => {
    if (!activeChain?.length) return location.pathname
    for (let i = activeChain.length - 1; i >= 0; i--) {
      if (visibleMenuKeys.has(activeChain[i].path)) return activeChain[i].path
    }
    return location.pathname
  }, [activeChain, visibleMenuKeys, location.pathname])

  // 菜单树渲染结果缓存：菜单数据不变时不重新生成整棵菜单 JSX
  const menuItems = useMemo(() => (menus && menus.length > 0 ? renderMenus(menus) : null), [menus])

  // 切换当前部门：调用接口成功后更新全局用户状态中的 dept_id
  const handleSwitchDept = async (deptId) => {
    if (!deptId) return
    try {
      await userApi.switchDept(deptId)
      updateUser({ dept_id: deptId })
      Message.success('切换部门成功')
      // 切换部门后整体刷新，让各页面按新 dept_id 重新拉取数据/权限
      window.location.reload()
    } catch (e) {
      // 错误已在请求层提示
    }
  }

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
      {hasPerm('profile') && (
        <MenuItem key="profile" icon={<IconUser />}>
          用户设置
        </MenuItem>
      )}
      <MenuItem key="logout">退出登录</MenuItem>
    </Menu>
  )

  return (
    <Header className="flex items-center gap-8 border-b border-gray-200 bg-white px-6">
      {/* 左侧：Logo + 系统标题，点击返回首页 */}
      <div
        className="flex shrink-0 cursor-pointer items-center gap-2"
        onClick={() => navigate('/')}
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#165dff] text-lg text-white">
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
        {menuItems}
      </Menu>

      {/* 右侧：切换部门 + 用户信息 + 退出登录 */}
      <Space className="shrink-0">
        <NotificationBell />
        <Select
          bordered={false}
          autoWidth={{ maxWidth: 500 }}
          triggerProps={{
            autoAlignPopupWidth: false,
            autoAlignPopupMinWidth: true,
            position: 'br',
          }}
          placeholder="切换部门"
          value={user?.dept_id ?? undefined}
          options={(user?.dept_ids || []).map((d) => ({ label: d.name, value: d.id }))}
          onChange={handleSwitchDept}
        />
        <Dropdown droplist={profileMenu} trigger="click" position="br">
          <Space className="cursor-pointer">
            <Avatar size={32} className="bg-[#165dff]!">
              <IconUser />
            </Avatar>
            <Typography.Text>
              {user?.profile?.nickname || user?.username || '加载中'}
            </Typography.Text>
          </Space>
        </Dropdown>
      </Space>
    </Header>
  )
}

/**
 * 页签栏：多页签切换、关闭与右键上下文菜单，数据全部来自 tab-context。
 * 页签交互没有独立副作用与外部消费者，与 HeaderBar、ContentArea 同属布局骨架。
 */
function TabsBar() {
  const navigate = useNavigate()
  const location = useLocation()
  const { tabs, closeTab, closeOthers, closeAll, closeLeft, closeRight } = useTabs()

  // 右侧"更多"操作菜单：关闭其他 / 关闭全部（useMemo 稳定引用，避免 Dropdown 反复重建）
  const opsMenu = useMemo(
    () => (
      <Menu onClickMenuItem={(key) => (key === 'others' ? closeOthers() : closeAll())}>
        <MenuItem key="others">关闭其他页签</MenuItem>
        <MenuItem key="all">关闭所有页签</MenuItem>
      </Menu>
    ),
    [closeOthers, closeAll],
  )

  // 页签右键上下文菜单构建器（闭包持有目标页签 path）
  const buildContextMenu = useMemo(
    () => (tab) => (
      <Menu
        onClickMenuItem={(key) => {
          if (key === 'left') closeLeft(tab.path)
          if (key === 'right') closeRight(tab.path)
          if (key === 'others') closeOthers()
          if (key === 'all') closeAll()
        }}
      >
        {CONTEXT_MENU_KEYS.map((item) => (
          <MenuItem key={item.key}>{item.label}</MenuItem>
        ))}
      </Menu>
    ),
    [closeLeft, closeRight, closeOthers, closeAll],
  )

  return (
    <Tabs
      editable
      showAddButton={false}
      type="card-gutter"
      size="small"
      activeTab={location.pathname}
      onChange={(key) => {
        // 点击当前激活页签时不再压入新历史记录
        if (key !== location.pathname) {
          navigate(key)
        }
      }}
      onDeleteTab={(key) => closeTab(key)}
      overflow="scroll"
      className="shrink-0 border-b border-gray-200 bg-white px-2 [&_.arco-tabs-content]:hidden [&_.arco-tabs-header-nav::before]:hidden!"
      extra={
        <Dropdown droplist={opsMenu} position="br" trigger="hover">
          <div className="mx-1 flex h-8 cursor-pointer items-center rounded px-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800">
            <IconMore />
          </div>
        </Dropdown>
      }
    >
      {tabs.map((tab) => (
        <TabPane
          key={tab.path}
          closable={tab.closable}
          title={
            <Dropdown droplist={buildContextMenu(tab)} trigger="contextMenu" position="bl">
              <span className="inline-block select-none">{tab.title}</span>
            </Dropdown>
          }
        />
      ))}
    </Tabs>
  )
}

/**
 * 内容区：面包屑 + 页面出口容器。
 * 放在 TabProvider 内部以便消费 useTabs；
 * 高度按页面类型区分：工作台（/）不渲染面包屑，内容区可多占面包屑那一行高度（124px），
 * 其余页面预留面包屑行高（160px）。
 */
function ContentArea() {
  const { activeTab } = useTabs()
  const isHome = activeTab === '/'
  return (
    <Content className="flex-1 overflow-auto bg-gray-50 py-4">
      {/* 面包屑：由当前激活页签的 breadcrumbs 驱动 */}
      <ContentBreadcrumb />
      <div className={`w-full ${isHome ? 'h-[calc(100vh-124px)]' : 'h-[calc(100vh-160px)]'}`}>
        <KeepAliveOutlet />
      </div>
    </Content>
  )
}

export default function MainLayout() {
  return (
    <TabProvider>
      <Layout className="h-full">
        <HeaderBar />
        {/* 页签栏 */}
        <TabsBar />
        <ContentArea />
      </Layout>
    </TabProvider>
  )
}
