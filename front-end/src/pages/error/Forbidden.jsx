import { Button, Result } from '@arco-design/web-react'
import { useNavigate } from 'react-router-dom'

export default function Forbidden() {
  const navigate = useNavigate()

  return (
    <Result
      status="403"
      title="403"
      subTitle="抱歉，您没有访问该页面的权限"
      extra={
        <Button type="primary" onClick={() => navigate('/')}>
          返回首页
        </Button>
      }
    />
  )
}
