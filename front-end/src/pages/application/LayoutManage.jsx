import { Button, Card, Empty } from '@arco-design/web-react'
import { IconLeft } from '@arco-design/web-react/icon'
import { useEffect } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { useTabs } from '../../store/tab-context'

const MODULE_LABEL = '布局管理'

export default function LayoutManage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { id } = useParams()
  const { addTab, updateTab } = useTabs()

  // 挂载时确保页签存在；仅在有 appName 时更新标题，避免页签切换时丢失应用名
  useEffect(() => {
    const appName = location.state?.appName
    if (appName) {
      const title = `${MODULE_LABEL} - ${appName}`
      addTab({ path: location.pathname, title })
      updateTab(location.pathname, { title })
    } else {
      // 页签切换 / 直接访问：仅确保页签存在，保留已有标题（addTab 幂等不覆盖）
      addTab({ path: location.pathname, title: MODULE_LABEL })
    }
  }, [location.pathname, location.state, addTab, updateTab])

  return (
    <Card
      title="布局管理"
      extra={
        <Button size="small" icon={<IconLeft />} onClick={() => navigate('/application')}>
          返回列表
        </Button>
      }
    >
      <div className="mb-3 text-sm text-gray-500">
        页面配置 ID：<span className="font-mono">{id}</span>
      </div>
      <Empty description="布局管理功能开发中，敬请期待" />
    </Card>
  )
}
