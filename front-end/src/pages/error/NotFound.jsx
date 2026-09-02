import { Result, Button, Card } from '@arco-design/web-react'
import { useNavigate } from 'react-router-dom'

export default function NotFound() {
  const navigate = useNavigate()
  return (
    <Card>
      <Result
        status="404"
        subTitle="页面不存在或已被移除"
        extra={
          <Button type="primary" onClick={() => navigate('/')}>
            返回工作台
          </Button>
        }
      />
    </Card>
  )
}
