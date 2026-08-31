import { Button, Checkbox, Form, Input, Message } from '@arco-design/web-react'
import { IconApps, IconLock, IconStorage, IconUser, IconUserGroup } from '@arco-design/web-react/icon'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../store/auth-context'
import { clearCredentials, getCredentials, saveCredentials } from '../utils/auth'

const FormItem = Form.Item

// 左侧核心功能亮点
const FEATURES = [
  {
    icon: <IconUserGroup />,
    title: '用户与组织管理',
    desc: '部门树形结构，账号与角色一站式维护',
  },
  {
    icon: <IconLock />,
    title: '细粒度权限控制',
    desc: '菜单、按钮、数据范围多维度授权',
  },
  {
    icon: <IconApps />,
    title: '灵活的角色体系',
    desc: 'RBAC 模型自由组合，权限随角色一键下发',
  },
]

export default function Login() {
  const [loading, setLoading] = useState(false)
  const [remember, setRemember] = useState(false)
  const [form] = Form.useForm()
  const navigate = useNavigate()
  const { login } = useAuth()

  // 初始化时读取缓存的账号密码并自动回填
  useEffect(() => {
    const credentials = getCredentials()
    if (credentials) {
      form.setFieldsValue({
        username: credentials.username || '',
        password: credentials.password || '',
      })
      setRemember(true)
    }
  }, [form])

  const handleSubmit = async (values) => {
    setLoading(true)
    try {
      await login(values)
      // 根据勾选状态决定保存或清除缓存凭证
      if (remember) {
        saveCredentials(values.username, values.password)
      } else {
        clearCredentials()
      }
      Message.success('登录成功')
      navigate('/', { replace: true })
    } catch (e) {
      // 错误提示已在请求层统一处理
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="h-full flex">
      {/* 左侧视觉展示区：小屏（<1024px）下自动隐藏 */}
      <div className="relative hidden w-1/2 overflow-hidden bg-linear-to-br from-blue-600 via-indigo-600 to-indigo-800 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        {/* 抽象几何装饰 */}
        <div className="absolute -top-28 -left-28 h-96 w-96 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute top-1/3 -right-32 h-80 w-80 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute bottom-10 left-1/4 h-40 w-40 rotate-12 rounded-3xl border border-white/20 bg-white/5" />
        <div className="absolute right-16 bottom-32 h-24 w-24 rounded-full border border-white/20" />

        {/* Logo 区 */}
        <div className="relative z-10 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15 backdrop-blur">
            <IconStorage className="text-2xl" />
          </div>
          <div>
            <div className="text-lg font-semibold leading-tight">RBAC 管理系统</div>
            <div className="text-xs text-white/70">Role-Based Access Control</div>
          </div>
        </div>

        {/* 标语 + 功能亮点：在面板内水平居中 */}
        <div className="relative z-10 mx-auto flex w-full max-w-lg flex-col items-center text-center">
          <h1 className="text-3xl leading-snug font-bold xl:text-4xl">
            统一身份与权限，
            <br />
            让组织管理更简单
          </h1>
          <p className="mt-4 max-w-md text-sm text-white/75">
            覆盖用户、角色、菜单、部门全链路管理，为团队提供安全、灵活、可扩展的权限底座。
          </p>

          <div className="mt-10 w-full space-y-6">
            {FEATURES.map((f) => (
              <div key={f.title} className="mx-auto flex w-full max-w-sm items-start gap-4 text-left">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/15 text-xl">{f.icon}</div>
                <div>
                  <div className="font-medium">{f.title}</div>
                  <div className="mt-1 text-sm text-white/70">{f.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 底部版权 */}
        <div className="relative z-10 text-xs text-white/60">© 2026 Full Stack Project · RBAC</div>
      </div>

      {/* 右侧登录操作区：无卡片设计，参照参考图 */}
      <div className="flex flex-1 items-center justify-center bg-gray-50 px-6">
        <div className="w-full max-w-sm">
          <h1 className="text-3xl font-bold text-gray-900">欢迎使用管理系统</h1>
          <p className="mt-2 text-sm text-gray-400">账号密码登录</p>

          <Form autoComplete="off" form={form} layout="vertical" className="mt-10" onSubmit={handleSubmit}>
            <FormItem
              field="username"
              rules={[
                { required: true, message: '请输入用户名' },
                { minLength: 2, message: '用户名至少 2 个字符' },
              ]}>
              <Input size="large" prefix={<IconUser />} placeholder="请输入用户名" allowClear />
            </FormItem>
            <FormItem
              field="password"
              rules={[
                { required: true, message: '请输入密码' },
                { minLength: 6, message: '密码至少 6 个字符' },
              ]}>
              <Input.Password size="large" prefix={<IconLock />} placeholder="请输入密码" />
            </FormItem>
            <div className="mb-5 flex items-center justify-between text-sm">
              <Checkbox checked={remember} onChange={setRemember}>
                记住密码
              </Checkbox>
              <Button type="text" size="mini" className="text-blue-600!" onClick={() => Message.info('请联系系统管理员重置密码')}>
                忘记密码？
              </Button>
            </div>
            <Button type="primary" size="large" long htmlType="submit" loading={loading}>
              登录
            </Button>
          </Form>
        </div>
      </div>
    </div>
  )
}
