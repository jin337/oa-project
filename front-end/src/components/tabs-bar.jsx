import { Dropdown, Menu, Tabs } from '@arco-design/web-react'
import { IconMore } from '@arco-design/web-react/icon'
import { useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTabs } from '../store/tab-context'

const TabPane = Tabs.TabPane
const MenuItem = Menu.Item

// 页签右键上下文菜单项（固定首页禁闭，关闭左侧/右侧对首页天然无操作）
const CONTEXT_MENU_KEYS = [
  { key: 'left', label: '关闭左侧' },
  { key: 'right', label: '关闭右侧' },
  { key: 'others', label: '关闭其他' },
  { key: 'all', label: '关闭所有' },
]

export default function TabsBar() {
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
