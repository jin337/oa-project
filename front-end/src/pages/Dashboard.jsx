import { Card, Empty, Grid, Spin } from '@arco-design/web-react'
import { IconCheckCircle, IconClockCircle, IconEmail, IconSend } from '@arco-design/web-react/icon'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getApprovalList } from 'src/api/approval'
import { ApprovalStatusTag } from 'src/pages/approval/components/approvalStatus'
import { formatTime } from 'src/utils/format'

const { Row, Col } = Grid

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

// 进行中（未结束）状态：待审核 / 审核中 / 已退回
const RUNNING_STATUS = [1, 2, 5]

// 工作台一次最多拉取的发起记录数（用于过滤出全部进行中的流程）
const RUNNING_LIMIT = 100

/**
 * 工作台：左侧「全部事项」四宫格计数 + 右侧「流程监控」我发起的进行中流程进度。
 * 计数与进度均复用审批列表聚合接口 /approval/list 的 scope 参数。
 */
export default function Dashboard() {
  const navigate = useNavigate()
  const [counts, setCounts] = useState({})
  const [running, setRunning] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    Promise.all(
      SCOPES.map((s) =>
        getApprovalList({ page: 1, size: 1, scope: s.key })
          .then((res) => ({ key: s.key, total: res.data?.total || 0 }))
          .catch(() => ({ key: s.key, total: 0 })),
      ),
    )
      .then((list) => {
        if (!alive) return
        setCounts(Object.fromEntries(list.map((x) => [x.key, x.total])))
      })
      .catch(() => {})
    getApprovalList({ page: 1, size: RUNNING_LIMIT, scope: 'initiated' })
      .then((res) => {
        if (!alive) return
        const list = res.data?.list || []
        setRunning(list.filter((r) => RUNNING_STATUS.includes(r.approval_status)))
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [])

  return (
    <div className="space-y-4">
      <Row gutter={16}>
        {/* 左侧 */}
        <Col span={18}>
          <Card title="全部事项" style={{ height: '100%' }}>
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
          <Card title="流程监控" style={{ height: '100%' }} className="[&_.arco-card-body]:p-0!">
            <Spin loading={loading} style={{ display: 'block' }}>
              {running.length === 0 ? (
                <Empty description="暂无进行中的发起流程" />
              ) : (
                // 内容区固定最大高度：超过 3 条出现滚动条
                <div className="flex flex-col" style={{ maxHeight: 320, overflowY: 'auto' }}>
                  {running.map((r, i) => {
                    // 模块名后追加单号：模块名（单号）
                    const name = r.item_name || r.app_name || '-'
                    const label = r.bill_no && name !== '-' ? `${name}（${r.bill_no}）` : name
                    return (
                      <div
                        key={r.id ?? i}
                        role="button"
                        tabIndex={0}
                        className={`cursor-pointer py-3 px-4 transition-colors hover:bg-[rgb(var(--arcoblue-1))] ${i > 0 ? 'border-t border-solid border-[rgb(var(--gray-2))]' : ''}`}
                        onClick={() => navigate('/approval/initiated', { state: { openDetail: r } })}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            navigate('/approval/initiated', { state: { openDetail: r } })
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
