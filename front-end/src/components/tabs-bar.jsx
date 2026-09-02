import { Dropdown, Menu, Tabs } from '@arco-design/web-react'
import { IconMore } from '@arco-design/web-react/icon'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTabs } from '../store/tab-context'

const TabPane = Tabs.TabPane
const MenuItem = Menu.Item

export default function TabsBar() {
  const navigate = useNavigate()
  const location = useLocation()
  const { tabs, closeTab, closeOthers, closeAll } = useTabs()

  // 右侧操作菜单：关闭其他 / 关闭全部
  const opsMenu = (
    <Menu onClickMenuItem={(key) => (key === 'others' ? closeOthers() : closeAll())}>
      <MenuItem key="others">关闭其他页签</MenuItem>
      <MenuItem key="all">关闭所有页签</MenuItem>
    </Menu>
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
      className="shrink-0 border-b border-gray-200 bg-white px-2 [&_.arco-tabs-content]:hidden"
      extra={
        <Dropdown droplist={opsMenu} position="br" trigger="hover">
          <div className="mx-1 flex h-8 cursor-pointer items-center rounded px-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800">
            <IconMore />
          </div>
        </Dropdown>
      }
    >
      {tabs.map((tab) => (
        <TabPane key={tab.path} closable={tab.closable} title={tab.title} />
      ))}
    </Tabs>
  )
}
