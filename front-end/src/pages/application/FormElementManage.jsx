import { Card, Empty } from '@arco-design/web-react'
import { useEffect } from 'react'
import { useLocation, useParams } from 'react-router-dom'
import * as applicationApi from '../../api/application'
import { useTabs } from '../../store/tab-context'

const MODULE_LABEL = '表单元素'

export default function FormElementManage() {
  const location = useLocation()
  const { id } = useParams()
  const { tabs, activeTab, addTab, updateTab } = useTabs()

  // 挂载时确保页签存在，并通过接口获取应用名后更新标题为「应用名 - 模块名」
  useEffect(() => {
    addTab({ path: location.pathname, title: MODULE_LABEL })
    let cancelled = false
    applicationApi
      .getApplication(id)
      .then((res) => {
        if (!cancelled && res.data?.name) {
          const title = `${res.data.name} - ${MODULE_LABEL}`
          updateTab(location.pathname, { title })
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [id, location.pathname, addTab, updateTab])

  // Card 标题与当前激活页签标题保持一致
  const currentTab = tabs.find((t) => t.path === activeTab)
  const cardTitle = currentTab?.title || MODULE_LABEL

  return (
    <Card title={cardTitle}>
      <div className="mb-3 text-sm text-gray-500">
        页面配置 ID：<span className="font-mono">{id}</span>
      </div>
      <Empty description="表单元素管理功能开发中，敬请期待" />
    </Card>
  )
}
