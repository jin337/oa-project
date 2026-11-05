import { Card, Empty, Grid, Select, Spin } from '@arco-design/web-react'
import { IconCheckCircle, IconClockCircle, IconEmail, IconSend } from '@arco-design/web-react/icon'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getApprovalDashboardFlows, getApprovalDashboardSummary } from 'src/api/approval'
import { ApprovalStatusTag } from 'src/pages/approval/components/approvalStatus'
import { formatTime } from 'src/utils/format'

const { Row, Col } = Grid

// 时间筛选选项：当天 / 本周 / 本月 / 本年 / 所有（「全部事项」与「流程监控」各自独立筛选）
const TIME_OPTIONS = [
  { label: '当天', value: 'today' },
  { label: '本周', value: 'week' },
  { label: '本月', value: 'month' },
  { label: '本年', value: 'year' },
  { label: '所有', value: 'all' },
]

// 子卡片配置：scope 与审批列表页一一对应
const SCOPES = [
  {
    key: 'todo',
    title: '我的待办',
    path: '/approval/todo',
    icon: <IconClockCircle />,
    color: 'rgb(var(--arcoblue-6))',
    bg: 'rgb(var(--arcoblue-1))',
  },
  {
    key: 'initiated',
    title: '我的发起',
    path: '/approval/initiated',
    icon: <IconSend />,
    color: 'rgb(var(--green-6))',
    bg: 'rgb(var(--green-1))',
  },
  {
    key: 'approved',
    title: '经我处理',
    path: '/approval/workplace',
    icon: <IconCheckCircle />,
    color: 'rgb(var(--orangered-6))',
    bg: 'rgb(var(--orangered-1))',
  },
  {
    key: 'cc',
    title: '抄送我的',
    path: '/approval/tome',
    icon: <IconEmail />,
    color: 'rgb(var(--purple-6))',
    bg: 'rgb(var(--purple-1))',
  },
]

// 流程监控记录归属 scope -> 列表页路径（点击跳转对应页面打开详情抽屉）
const SCOPE_PATH = {
  todo: '/approval/todo',
  initiated: '/approval/initiated',
  approved: '/approval/workplace',
  cc: '/approval/tome',
}

/**
 * 工作台：左侧「全部事项」四宫格计数 + 右侧「流程监控」与我相关的所有申请（全状态）。
 * 数据来源为两个独立接口（右上角时间筛选同时作用于两者）：
 *   - /approval/dashboard/summary —— 全部事项计数（我的待办/我的发起/经我处理/抄送我的）
 *   - /approval/dashboard/flows —— 流程监控（与我相关的所有申请，含归属 scopes，不分页）
 */
export default function Dashboard() {
  const navigate = useNavigate()
  const [counts, setCounts] = useState({})
  const [flows, setFlows] = useState([])
  const [loading, setLoading] = useState(true)
  // 时间筛选（默认「本月」）：全部事项计数与流程监控各自独立筛选
  const [timeRange, setTimeRange] = useState('month')
  const [flowTimeRange, setFlowTimeRange] = useState('month')

  // 全部事项计数：随 timeRange 变化重新拉取
  useEffect(() => {
    let alive = true
    setLoading(true)
    const params = timeRange === 'all' ? undefined : { time_range: timeRange }
    getApprovalDashboardSummary(params)
      .then((res) => {
        if (!alive) return
        const sum = res.data || {}
        setCounts({
          todo: sum.todo ?? 0,
          initiated: sum.initiated ?? 0,
          approved: sum.approved ?? 0,
          cc: sum.cc ?? 0,
        })
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [timeRange])

  // 流程监控：随 flowTimeRange 变化重新拉取
  useEffect(() => {
    let alive = true
    setLoading(true)
    const params = flowTimeRange === 'all' ? undefined : { time_range: flowTimeRange }
    getApprovalDashboardFlows(params)
      .then((res) => {
        if (alive) setFlows(res.data?.list || [])
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [flowTimeRange])

  return (
    <div className="w-full overflow-x-hidden">
      <Row gutter={16}>
        {/* 左侧 */}
        <Col span={18}>
          <Card
            title="全部事项"
            extra={
              <Select
                value={timeRange}
                onChange={setTimeRange}
                options={TIME_OPTIONS}
                size="small"
                bordered={false}
                style={{ width: 80 }}
              />
            }
            style={{ height: '100%' }}
          >
            <Spin loading={loading} style={{ display: 'block' }}>
              <Row gutter={[16, 16]}>
                {SCOPES.map((s) => (
                  <Col span={6} key={s.key}>
                    <div
                      role="button"
                      tabIndex={0}
                      className="flex cursor-pointer items-center rounded-lg border border-solid border-[rgb(var(--gray-3))] px-5 py-4 transition-colors hover:border-[rgb(var(--arcoblue-3))] hover:bg-[rgb(var(--arcoblue-1))]"
                      onClick={() => navigate(s.path)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') navigate(s.path)
                      }}
                    >
                      <div
                        className="mr-4 flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-xl"
                        style={{ color: s.color, backgroundColor: s.bg }}
                      >
                        {s.icon}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm text-[rgb(var(--gray-8))]">{s.title}</div>
                        <div className="text-2xl leading-tight font-semibold text-[rgb(var(--gray-10))]">
                          {counts[s.key] ?? '-'}
                        </div>
                      </div>
                    </div>
                  </Col>
                ))}
              </Row>
            </Spin>
          </Card>
        </Col>
        {/* 右侧 */}
        <Col span={6}>
          <Card
            title="流程监控"
            extra={
              <Select
                value={flowTimeRange}
                onChange={setFlowTimeRange}
                options={TIME_OPTIONS}
                size="small"
                bordered={false}
                style={{ width: 80 }}
              />
            }
            style={{ height: '100%' }}
            className="[&_.arco-card-body]:p-0!"
          >
            <Spin loading={loading} style={{ display: 'block' }}>
              {flows.length === 0 ? (
                <Empty description="暂无相关申请" />
              ) : (
                // 内容区固定最大高度：超过 3 条出现滚动条
                <div className="flex flex-col" style={{ maxHeight: 320, overflowY: 'auto' }}>
                  {flows.map((r, i) => {
                    // 模块名后追加单号：模块名（单号）
                    const name = r.item_name || r.app_name || '-'
                    const label = r.bill_no && name !== '-' ? `${name}（${r.bill_no}）` : name
                    return (
                      <div
                        key={r.instance_id ?? i}
                        role="button"
                        tabIndex={0}
                        className={`cursor-pointer px-4 py-3 transition-colors hover:bg-[rgb(var(--arcoblue-1))] ${i > 0 ? 'border-t border-solid border-[rgb(var(--gray-2))]' : ''}`}
                        onClick={() => {
                          // 按记录归属跳转对应页面打开详情抽屉（待办需携带任务参数，后端 scopes[0] 为最高优先级归属）
                          const target = SCOPE_PATH[r.scopes?.[0]] || SCOPE_PATH.initiated
                          navigate(target, { state: { openDetail: r } })
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            const target = SCOPE_PATH[r.scopes?.[0]] || SCOPE_PATH.initiated
                            navigate(target, { state: { openDetail: r } })
                          }
                        }}
                      >
                        {/* 上半部分：模块名（单号） | 申请时间 */}
                        <Row justify="space-between" align="center">
                          <Col
                            span={14}
                            className="truncate text-sm font-medium text-[rgb(var(--gray-10))]"
                          >
                            {label}
                          </Col>
                          <Col
                            span={10}
                            className="truncate text-right text-xs text-[rgb(var(--gray-6))]"
                          >
                            {formatTime(r.created_at)}
                          </Col>
                        </Row>
                        {/* 下半部分：当前审批节点 | 状态 */}
                        <Row justify="space-between" align="center" className="mt-1">
                          <Col span={14} className="truncate text-xs text-[rgb(var(--gray-6))]">
                            <span className="text-[rgb(var(--gray-5))]">审批节点：</span>
                            {r.node_name || '-'}
                          </Col>
                          <Col span={10} className="truncate text-right">
                            <ApprovalStatusTag status={r.approval_status} />
                          </Col>
                        </Row>
                      </div>
                    )
                  })}
                </div>
              )}
            </Spin>
          </Card>
        </Col>
      </Row>
    </div>
  )
}
