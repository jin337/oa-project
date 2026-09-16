import { Divider, Tag, Timeline } from '@arco-design/web-react'
import {
  IconBranch,
  IconCheck,
  IconClockCircle,
  IconClose,
  IconRedo,
  IconSend,
  IconStamp,
  IconUser,
} from '@arco-design/web-react/icon'
import { useEffect, useState } from 'react'
import * as approvalApi from 'src/api/approval'

/**
 * 审批流程时间线组件：展示流程实例的完整审批流转记录
 * 从 flow_snapshot_json 解析完整节点链，关联实际 tasks 数据，
 * 展示发起人、审批人、抄送人、条件分支等所有节点类型。
 *
 * @param {object} props
 * @param {number} props.instanceId 流程实例 ID
 * @param {boolean} props.visible 是否可见（控制数据加载）
 */

// 任务状态元信息
const TASK_STATUS_META = {
  0: { label: '待处理', color: 'orange', icon: IconClockCircle },
  1: { label: '已通过', color: 'green', icon: IconCheck },
  2: { label: '已拒绝', color: 'red', icon: IconClose },
  3: { label: '已驳回', color: 'orangered', icon: IconClose },
  4: { label: '已转交', color: 'blue', icon: IconRedo },
  5: { label: '已取消', color: 'gray', icon: IconClose },
}

// 实例状态元信息
const INSTANCE_STATUS_META = {
  0: { label: '进行中', color: 'blue' },
  1: { label: '已通过', color: 'green' },
  2: { label: '已拒绝', color: 'red' },
  3: { label: '已驳回', color: 'orangered' },
  4: { label: '已作废', color: 'gray' },
  5: { label: '已撤回', color: 'gray' },
}

// 节点类型图标映射（与 flowModel.js / constants.js 保持一致）
const NODE_TYPE_ICONS = {
  1: IconUser,
  2: IconStamp,
  3: IconSend,
  4: IconBranch,
}

// 节点类型背景色
const NODE_TYPE_BG = {
  1: 'bg-emerald-500',
  2: 'bg-amber-500',
  3: 'bg-blue-500',
  4: 'bg-purple-500',
}

/** 将 flow_snapshot 节点树递归展平为一维数组（跳过条件分支容器节点，保留其子节点） */
function flattenFlowNodes(nodes, executionPathSet) {
  const result = []
  const walk = (list) => {
    for (const node of list) {
      if (node.type === 4) {
        // 条件分支：递归展开各分支的 children
        if (node.branches) {
          for (const branch of node.branches) {
            if (branch.children?.length) {
              // 仅包含 execution_path 中存在的节点（已命中的分支）
              const hitChildren = branch.children.filter((c) => executionPathSet.has(c.id))
              walk(hitChildren)
            }
          }
        }
      } else {
        result.push(node)
      }
    }
  }
  walk(nodes || [])
  return result
}

/** 格式化成员列表为可读文本 */
function formatMembers(members) {
  if (!members?.length) return '未配置'
  return members.map((m) => m.label || m.key || '').filter(Boolean).join('、') || '未配置'
}

/** 抄送时机文本 */
const CC_TIMING_LABEL = { 1: '审批通过后抄送', 2: '流程结束时统一抄送' }

export default function ApprovalTimeline({ instanceId, visible }) {
  const [loading, setLoading] = useState(false)
  const [instance, setInstance] = useState(null)
  const [tasks, setTasks] = useState([])
  const [flowNodes, setFlowNodes] = useState([])
  const [userNameMap, setUserNameMap] = useState({})

  useEffect(() => {
    if (!visible || !instanceId) return
    let cancelled = false
    setLoading(true)
    setInstance(null)
    setTasks([])
    setFlowNodes([])
    setUserNameMap({})

    approvalApi
      .getApprovalInstanceDetail(instanceId)
      .then((res) => {
        if (cancelled) return
        const data = res.data
        setInstance(data)
        setTasks(data.tasks || [])

        // 解析流程快照节点链
        let nodes = []
        try {
          const snapshot = data.flow_snapshot_json
          nodes = Array.isArray(snapshot) ? snapshot : snapshot?.nodes || []
        } catch {
          // 解析失败时使用空数组
        }

        // 解析 execution_path 为 Set，用于判断节点是否被命中
        let execPathSet = new Set()
        try {
          const ep = data.execution_path
          const arr = typeof ep === 'string' ? JSON.parse(ep) : ep
          if (Array.isArray(arr)) arr.forEach((id) => execPathSet.add(id))
        } catch {
          // 无执行路径
        }

        setFlowNodes(flattenFlowNodes(nodes, execPathSet))

        // 收集所有涉及的用户 ID
        const userIds = new Set()
        ;(data.tasks || []).forEach((t) => {
          if (t.assignee_id) userIds.add(t.assignee_id)
        })
        if (data.created_by) userIds.add(data.created_by)

        // 批量查询用户姓名
        if (userIds.size > 0) {
          const nameMap = {}
          // 逐个查询（项目暂无批量用户接口，后续可优化）
          Promise.all(
            Array.from(userIds).map((uid) =>
              import('src/api/user').then(({ getUser }) =>
                getUser(uid)
                  .then((r) => {
                    const u = r.data
                    nameMap[uid] = u?.profile?.nickname || u?.username || `用户#${uid}`
                  })
                  .catch(() => {
                    nameMap[uid] = `用户#${uid}`
                  })
              )
            )
          ).then(() => {
            if (!cancelled) setUserNameMap(nameMap)
          })
        }
      })
      .catch(() => {
        // 错误已在请求层提示
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [visible, instanceId])

  if (loading) {
    return (
      <div className="py-4 text-center text-gray-400">加载审批流程...</div>
    )
  }

  if (!instance) return null

  const instMeta = INSTANCE_STATUS_META[instance.status] || { label: '未知', color: 'gray' }
  const createdByName = instance.created_by_name || `用户#${instance.created_by}`

  // 按 node_id 分组 tasks
  const tasksByNode = {}
  tasks.forEach((t) => {
    if (!tasksByNode[t.node_id]) tasksByNode[t.node_id] = []
    tasksByNode[t.node_id].push(t)
  })

  return (
    <>
      <Divider orientation="left">
        <span className="text-sm font-medium text-gray-700">审批流程</span>
        <Tag size="small" color={instMeta.color} className="ml-2">
          {instMeta.label}
        </Tag>
      </Divider>
      <div className="rounded-lg border border-gray-100 bg-gray-50/60 p-3">
        <Timeline>
          {/* 发起节点 */}
          <Timeline.Item
            dot={
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-white">
                <IconUser style={{ fontSize: 13 }} />
              </span>
            }
          >
            <div className="flex items-center gap-2">
              <span className="text-base font-medium">发起申请</span>
              <Tag size="small" color="green">已提交</Tag>
            </div>
            <div className="mt-0.5 text-xs text-gray-500">
              <span className="font-medium text-gray-700">{createdByName}</span>
              <span className="ml-2">
                {instance.created_at?.slice(0, 19).replace('T', ' ')}
              </span>
            </div>
          </Timeline.Item>

          {/* 流程节点（审批人 / 抄送人） */}
          {flowNodes.map((node) => {
            if (node.type === 2) {
              // 审批人节点
              const nodeTasks = tasksByNode[node.id] || []
              return (
                <Timeline.Item
                  key={node.id}
                  dot={
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-500 text-white">
                      <IconStamp style={{ fontSize: 13 }} />
                    </span>
                  }
                >
                  <div className="flex items-center gap-2">
                    <span className="text-base font-medium">{node.label || '审批'}</span>
                    {node.strategy === 2 && <Tag size="small" color="blue">会签</Tag>}
                    {node.strategy === 3 && <Tag size="small" color="blue">或签</Tag>}
                  </div>
                  {nodeTasks.length > 0 ? (
                    nodeTasks.map((task) => {
                      const meta = TASK_STATUS_META[task.status] || TASK_STATUS_META[0]
                      const Icon = meta.icon
                      const userName = userNameMap[task.assignee_id] || `用户#${task.assignee_id}`
                      return (
                        <div key={task.id} className="mt-1.5 rounded-md bg-white/80 p-2">
                          <div className="flex items-center gap-2">
                            <span
                              className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-white ${
                                task.status === 0
                                  ? 'bg-orange-400'
                                  : task.status === 1
                                    ? 'bg-green-500'
                                    : task.status === 4
                                      ? 'bg-blue-500'
                                      : 'bg-red-500'
                              }`}
                            >
                              <Icon style={{ fontSize: 11 }} />
                            </span>
                            <span className="text-sm font-medium text-gray-700">{userName}</span>
                            <Tag size="small" color={meta.color}>{meta.label}</Tag>
                          </div>
                          <div className="mt-0.5 flex items-center gap-3 text-xs text-gray-400">
                            {task.operated_at && (
                              <span>{task.operated_at.slice(0, 19).replace('T', ' ')}</span>
                            )}
                            {task.delegated_from > 0 && (
                              <span className="text-blue-500">（由他人转交）</span>
                            )}
                          </div>
                          {task.comment && (
                            <div className="mt-1 text-xs text-gray-600">意见：{task.comment}</div>
                          )}
                        </div>
                      )
                    })
                  ) : (
                    <div className="mt-1 text-xs text-gray-400">
                      {formatMembers(node.members)}
                    </div>
                  )}
                </Timeline.Item>
              )
            }

            if (node.type === 3) {
              // 抄送人节点
              const Icon = NODE_TYPE_ICONS[3]
              return (
                <Timeline.Item
                  key={node.id}
                  dot={
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-500 text-white">
                      <Icon style={{ fontSize: 13 }} />
                    </span>
                  }
                >
                  <div className="flex items-center gap-2">
                    <span className="text-base font-medium">{node.label || '抄送'}</span>
                    <Tag size="small" color="blue">抄送人</Tag>
                  </div>
                  <div className="mt-0.5 text-xs text-gray-500">
                    <span>{formatMembers(node.members)}</span>
                    {node.ccTiming && (
                      <span className="ml-2 text-gray-400">
                        {CC_TIMING_LABEL[node.ccTiming] || ''}
                      </span>
                    )}
                  </div>
                </Timeline.Item>
              )
            }

            return null
          })}
        </Timeline>
      </div>
    </>
  )
}
