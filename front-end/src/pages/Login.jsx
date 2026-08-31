import { Button, Card, Form, Input, Message, Typography } from '@arco-design/web-react'
import { IconLock, IconUser } from '@arco-design/web-react/icon'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../store/auth-context'

const FormItem = Form.Item

export default function Login() {
  const [loading, setLoading] = useState(false)
  const [form] = Form.useForm()
  const navigate = useNavigate()
  const { login } = useAuth()

  const handleSubmit = async (values) => {
    setLoading(true)
    try {
      await login(values)
      Message.success('登录成功')
      navigate('/', { replace: true })
    } catch (e) {
      // 错误提示已在请求层统一处理
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="h-full flex items-center justify-center bg-linear-to-br from-blue-50 to-indigo-100">
      <Card className="w-96 shadow-lg">
        <div className="text-center mb-6">
          <Typography.Title heading={4} style={{ margin: '8px 0' }}>
            RBAC 管理系统
          </Typography.Title>
        </div>
        <Form form={form} layout="vertical" onSubmit={handleSubmit}>
          <FormItem
            field="username"
            rules={[
              { required: true, message: '请输入用户名' },
              { minLength: 2, message: '用户名至少 2 个字符' },
            ]}>
            <Input prefix={<IconUser />} placeholder="请输入用户名" allowClear />
          </FormItem>
          <FormItem
            field="password"
            rules={[
              { required: true, message: '请输入密码' },
              { minLength: 6, message: '密码至少 6 个字符' },
            ]}>
            <Input.Password prefix={<IconLock />} placeholder="请输入密码" />
          </FormItem>
          <Button type="primary" htmlType="submit" long loading={loading}>
            登 录
          </Button>
        </Form>
      </Card>
    </div>
  )
}
