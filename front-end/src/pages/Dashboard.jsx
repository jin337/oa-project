import { Card, Descriptions, Grid, Spin, Tag, Typography } from '@arco-design/web-react'
import axios from 'axios'
import { useEffect, useState } from 'react'
import { useAuth } from '../store/auth-context'

const { Row, Col } = Grid

// GET /health（由 Vite 代理到后端根路径健康检查）：{ service, env, db_status, time }
export default function Dashboard() {
  const { user } = useAuth()
  const [health, setHealth] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    axios
      .get('/health')
      .then((res) => setHealth(res.data?.data))
      .catch(() => setError('后端服务未响应，请确认 back-end 已在 8180 端口启动'))
  }, [])

  return (
    <div className="space-y-4">
      <Card>
        <Typography.Title heading={6}>欢迎，{user?.username || '用户'}</Typography.Title>
        <Typography.Text type="secondary">
          这是承接 Go + Gin 后端的前端工作台，顶部菜单由后端接口动态返回。
        </Typography.Text>
      </Card>
      <Row gutter={16}>
        <Col span={12}>
          <Card title="后端服务状态">
            {error ? (
              <Tag color="red">{error}</Tag>
            ) : health ? (
              <Descriptions
                column={1}
                labelStyle={{ textAlign: 'right', paddingRight: 20 }}
                data={[
                  { label: '服务名', value: health.service },
                  { label: '运行环境', value: health.env },
                  {
                    label: '数据库',
                    value: (
                      <Tag color={health.db_status === 'ok' ? 'green' : 'red'}>
                        {health.db_status}
                      </Tag>
                    ),
                  },
                  { label: '服务器时间', value: health.time },
                ]}
              />
            ) : (
              <Spin />
            )}
          </Card>
        </Col>
        <Col span={12}>
          <Card title="当前账号">
            <Descriptions
              column={1}
              labelStyle={{ textAlign: 'right', paddingRight: 20 }}
              data={[
                { label: '用户名', value: user?.username || '-' },
                { label: '邮箱', value: user?.email || '-' },
                {
                  label: '状态',
                  value: (
                    <Tag color={user?.status === 1 ? 'green' : 'red'}>
                      {user?.status === 1 ? '启用' : '停用'}
                    </Tag>
                  ),
                },
                {
                  label: '角色',
                  value: (user?.roles || []).map((r) => r.name).join('、') || '-',
                },
              ]}
            />
          </Card>
        </Col>
      </Row>
    </div>
  )
}
