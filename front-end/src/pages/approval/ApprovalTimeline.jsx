import { Divider, Tag, Timeline } from '@arco-design/web-react'
import {
  IconBranch,
  IconCheckCircle,
  IconClockCircle,
  IconCloseCircle,
  IconRedo,
  IconSend,
  IconStamp,
  IconUser,
} from '@arco-design/web-react/icon'
import { useEffect, useState } from 'react'
import * as approvalApi from 'src/api/approval'
import { formatTime } from 'src/utils/format'

/**
 * 审批流程时间线组件：展示流程实例的完整审批流转记录
 * 从 approval_flow_json 解析完整节点链，关联实际 tasks 数据，
 * 展示发起人、审批人、抄送人、条件分支等所有节点类型。
 *
 * @param {object} props
 * @param {number} props.instanceId 流程实例 ID
 * @param {boolean} props.visible 是否可见（控制数据加载）
 * @param {object} props.initialData 外部预加载的实例数据，传入时跳过自身 API 请求
 * @param {object} props.assigneeNameMap 外部预解析的用户姓名映射（userId -> 姓名），传入时跳过用户查询请求
 */

// 任务状态元信息
const TASK_STATUS_META = {
  0: { label: '待处理', color: 'orange', icon: IconClockCircle },
  1: { label: '已通过', color: 'green', icon: IconCheckCircle },
  2: { label: '已拒绝', color: 'red', icon: IconCloseCircle },
  3: { label: '已退回', color: 'orangered', icon: IconCloseCircle },
  4: { label: '已转交', color: 'blue', icon: IconRedo },
  5: { label: '已取消', color: 'gray', icon: IconCloseCircle },
}

// 实例状态元信息
const INSTANCE_STATUS_META = {
  0: { label: '进行中', color: 'blue' },
  1: { label: '已通过', color: 'green' },
  2: { label: '已拒绝', color: 'red' },
  3: { label: '已退回', color: 'orangered' },
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

/** 格式化成员列表为可读文本，利用 userNameMap 解析人员 key（如 user_5 → 真实姓名） */
function formatMembers(members, nameMap) {
  if (!members?.length) return '未配置'
  return (
    members
      .map((m) => {
        if (m.label) return m.label
        // 人员类型 key 格式为 "user_{id}"，通过 nameMap 解析真实姓名
        if (m.type === 1 && m.key && nameMap) {
          const uid = m.key.replace('user_', '')
          if (nameMap[uid]) return nameMap[uid]
        }
        return m.key || ''
      })
      .filter(Boolean)
      .join('、') || '未配置'
  )
}

/** 抄送时机文本 */
const CC_TIMING_LABEL = { 1: '审批通过后抄送', 2: '流程结束时统一抄送' }

export default function ApprovalTimeline({
  instanceId,
  visible,
  initialData,
  assigneeNameMap: externalNameMap,
}) {
  const [loading, setLoading] = useState(false)
  const [instance, setInstance] = useState(null)
  const [tasks, setTasks] = useState([])
  const [flowNodes, setFlowNodes] = useState([])
  const [userNameMap, setUserNameMap] = useState({})

  useEffect(() => {
    if (!visible || !instanceId) return
    let cancelled = false

    // 处理实例数据：解析节点链、设置任务、解析用户姓名
    const processInstanceData = (data) => {
      if (cancelled) return
      setInstance(data)
      setTasks(data.approval_flow_tasks || [])

      // 解析流程快照节点链
      let nodes = []
      try {
        const snapshot = data.approval_flow_json
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

      // 用户姓名：优先使用外部传入的映射（已解析），否则逐个查询
      if (externalNameMap) {
        if (!cancelled) setUserNameMap(externalNameMap)
      } else {
        // 收集所有涉及的用户 ID（tasks + 成员引用）
        const userIds = new Set()
        ;(data.approval_flow_tasks || []).forEach((t) => {
          if (t.assignee_id) userIds.add(t.assignee_id)
        })
        if (data.created_by) userIds.add(data.created_by)
        // 从节点 members 中提取人员引用（approverType=3 自选节点注入的 key 格式为 user_{id}）
        nodes.forEach((n) => {
          ;(n.members || []).forEach((m) => {
            if (m.type === 1 && m.key) {
              const uid = m.key.replace('user_', '')
              if (uid) userIds.add(uid)
            }
          })
        })

        // 无外部姓名映射时的兜底：逐个查询
        if (userIds.size > 0) {
          const nameMap = {}
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
                  }),
              ),
            ),
          ).then(() => {
            if (!cancelled) setUserNameMap(nameMap)
          })
        }
      }
    }

    // 外部已提供数据时跳过 API 请求
    if (initialData) {
      processInstanceData(initialData)
      return () => {
        cancelled = true
      }
    }

    setLoading(true)
    setInstance(null)
    setTasks([])
    setFlowNodes([])
    setUserNameMap({})

    approvalApi
      .getApprovalInstanceDetail(instanceId)
      .then((res) => {
        processInstanceData(res.data)
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
  }, [visible, instanceId, externalNameMap, initialData])

  if (loading) {
    return <div className="py-4 text-center text-gray-400">加载审批流程...</div>
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
        <Timeline className="pl-1.5">
          {/* 发起节点 */}
          <Timeline.Item
            className="min-h-10! pb-5"
            key="initiator"
            dot={
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-white">
                <IconUser style={{ fontSize: 13 }} />
              </span>
            }
          >
            <div className="flex items-center gap-2">
              <span className="font-medium">发起人</span>
            </div>
            <div className="mt-0.5 flex items-center justify-between text-xs text-gray-500">
              <span className="truncate text-sm font-medium text-gray-700">{createdByName}</span>
              <span>{formatTime(instance.created_at)}</span>
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
                  className="min-h-10! pb-5"
                  dot={
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-500 text-white">
                      <IconStamp style={{ fontSize: 13 }} />
                    </span>
                  }
                >
                  <div className="flex items-center gap-2">
                    <span className="font-medium">
                      {node.label || '审批'}：
                      {nodeTasks.length > 0 ? nodeTasks.length : node.members?.length || 0}人（
                      {node.strategy === 2 ? '会签' : node.strategy === 3 ? '或签' : '依次审批'}）
                    </span>
                  </div>
                  {nodeTasks.length > 0 ? (
                    nodeTasks.map((task) => {
                      const meta = TASK_STATUS_META[task.status] || TASK_STATUS_META[0]
                      const userName = userNameMap[task.assignee_id] || `用户#${task.assignee_id}`
                      return (
                        <div key={task.id} className="mt-1.5 rounded-md bg-gray-100 p-2">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex min-w-0 items-center gap-1">
                              <span className="truncate text-sm font-medium text-gray-700">
                                {userName}
                              </span>
                              <Tag size="small" color={meta.color}>
                                {meta.label}
                              </Tag>
                            </div>
                            <div className="flex shrink-0 items-center gap-2 text-xs text-gray-400">
                              {task.delegated_from > 0 && (() => {
                                const srcTask = tasks.find((t) => t.id === task.delegated_from)
                                const srcName = srcTask?.assignee_id
                                  ? userNameMap[srcTask.assignee_id]
                                  : null
                                return (
                                  <span className="text-blue-500">
                                    （由{srcName || '他人'}转交）
                                  </span>
                                )
                              })()}
                              {task.operated_at && (
                                <span>{formatTime(task.operated_at)}</span>
                              )}
                            </div>
                          </div>
                          {task.comment && (
                            <div className="mt-1 text-xs text-gray-600">{task.comment}</div>
                          )}
                        </div>
                      )
                    })
                  ) : (
                    <div className="mt-1 text-xs text-gray-400">
                      {formatMembers(node.members, userNameMap)}
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
                  className="min-h-10!"
                  dot={
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-500 text-white">
                      <Icon style={{ fontSize: 13 }} />
                    </span>
                  }
                >
                  <div className="flex items-center gap-2">
                    <span className="font-medium">
                      {node.label || '抄送'}
                      {node.ccTiming ? `（${CC_TIMING_LABEL[node.ccTiming]}）` : ''}
                    </span>
                  </div>
                  <div className="mt-0.5 text-xs text-gray-500">
                    <span>{formatMembers(node.members, userNameMap)}</span>
                  </div>
                </Timeline.Item>
              )
            }

            return null
          })}
        </Timeline>
    </>
  )
}
