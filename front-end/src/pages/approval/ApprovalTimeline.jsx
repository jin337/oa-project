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
import { useEffect, useMemo, useState } from 'react'
import * as approvalApi from 'src/api/approval'
import {
  hasExpandableMember,
  loadMemberDirectory,
  resolveNodePeople,
} from 'src/utils/flowMembers'
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
  6: { label: '待处理', color: 'orange', icon: IconClockCircle },
}

// 实例状态元信息
const INSTANCE_STATUS_META = {
  0: { label: '进行中', color: 'blue' },
  1: { label: '已通过', color: 'green' },
  2: { label: '已拒绝', color: 'red' },
  3: { label: '已退回', color: 'orangered' },
  4: { label: '已作废', color: 'gray' },
  5: { label: '已撤回', color: 'purple' },
  6: { label: '草稿', color: 'gray' },
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

/**
 * 未流转到的节点 / 抄送人的成员展示：成员引用（dept_x / role_x / group_x）展开为具体的人后
 * 逐个用 Tag 渲染，**全部展示不折叠** —— 这类节点还没有任务记录，Tag 是唯一的成员信息，
 * 若折叠成「等N人」就看不到到底是谁在等审批。
 * nameMap（userId → 姓名）优先用于人员引用。
 */
function MemberTags({ members, nameMap, directory }) {
  const list = members || []
  const people = resolveNodePeople({ members: list }, directory, nameMap)
  if (!people.length) {
    // 目录与 label 都拿不到姓名时，退回配置里的原始引用文本
    const raw = list.map((m) => m.label || m.key).filter(Boolean)
    if (!raw.length) return <span className="text-xs text-gray-400">未配置</span>
    return raw.map((text) => (
      <Tag key={text} size="small">
        {text}
      </Tag>
    ))
  }
  return people.map((p) => (
    <Tag key={p.id != null ? `u${p.id}` : `n${p.name}`} size="small">
      {p.name}
    </Tag>
  ))
}

/**
 * 任务节点（如「初审」）的展示形态拆分。判据在「节点」这一层，不在「人」这一层：
 * - 节点已流转（存在任务）→ 节点上所有人都出**任务卡片**。其中还没轮到自己的人没有任务记录，
 *   卡片状态显示为灰色「未流转」（后端依次审批只生成当前一个人的任务，见 approval_task.go 的
 *   `case 1: // 依次审批：只生成第一个人的任务`）
 * - 节点尚未流转（完全没有任务）→ 节点上所有人一律用 **Tag 平铺**
 * 另：任务的实际审批人不在展开结果里（转交对象、发起人自选成员、流程配置已变更）时补成卡片，
 * 避免真实发生过的审批记录被漏掉。
 * @returns {{cards: Array<{key: string, name: string|null, task?: object}>, tags: Array<{key: string, name: string}>}}
 */
function splitNodePeople(nodePeople, nodeTasks) {
  // 该任务节点还没有流转过来：整节点 Tag 平铺
  if (nodeTasks.length === 0) {
    return { cards: [], tags: nodePeople }
  }

  const byAssignee = new Map()
  nodeTasks.forEach((task) => {
    const key = String(task.assignee_id)
    if (!byAssignee.has(key)) byAssignee.set(key, [])
    byAssignee.get(key).push(task)
  })

  const cards = []
  const usedTaskIds = new Set()
  nodePeople.forEach((person) => {
    const mine = person.id != null ? byAssignee.get(String(person.id)) || [] : []
    if (mine.length) {
      mine.forEach((task) => {
        usedTaskIds.add(task.id)
        cards.push({ key: `task-${task.id}`, task, name: person.name })
      })
      return
    }
    // person.id 为空说明成员目录还没加载完（person 只是组 / 角色 / 部门的占位名），无法定位到人：
    // 交给下面的任务卡片兜底，避免把「财务审核组」当成一个人在卡片里显示
    if (person.id != null) {
      cards.push({ key: `pending-${person.id}`, name: person.name })
    }
  })

  // 转交 / 加签衍生任务（来源人不在流程配置里，前面未被消费）：按来源任务就近插入，
  // 而不是堆到节点末尾。规则：
  //   - 转交（delegated_from）：紧跟来源任务之后
  //   - 后加签（add_sign_type=2，我通过后加签人继续）：紧跟来源任务之后
  //   - 前加签（add_sign_type=1，加签人先审、通过后我再审批）：插到来源任务之前
  // 按任务创建顺序处理：同一来源的多次衍生，越新越靠近来源（splice 在 srcIdx+1 处不断顶入）。
  // 链式衍生（如转交后再加签）在同一轮内即可收敛；来源暂时找不到的下一轮再试。
  let pending = nodeTasks.filter((task) => !usedTaskIds.has(task.id))
  let guard = 0
  while (pending.length && guard++ < 100) {
    let advanced = false
    const next = []
    for (const task of pending) {
      const srcId = task.delegated_from > 0 ? task.delegated_from : task.add_sign_from
      const srcIdx = cards.findIndex((c) => c.task && c.task.id === srcId)
      if (srcIdx < 0) {
        next.push(task)
        continue
      }
      advanced = true
      usedTaskIds.add(task.id)
      const entry = { key: `task-${task.id}`, task, name: null }
      if (task.delegated_from > 0 || task.add_sign_type === 2) {
        cards.splice(srcIdx + 1, 0, entry)
      } else {
        cards.splice(srcIdx, 0, entry)
      }
    }
    pending = next
    if (!advanced) break
  }
  // 来源永远找不到的兜底（理论上不发生）：追加到末尾
  pending.forEach((task) => {
    usedTaskIds.add(task.id)
    cards.push({ key: `task-${task.id}`, task, name: null })
  })
  return { cards, tags: [] }
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

  // 成员目录（部门 / 角色 / 审核人员组 → 具体的人）：仅当流程里存在这几类引用时才加载，
  // 加载完成前成员文本回退显示原 label，不会出现空白。
  const [memberDirectory, setMemberDirectory] = useState(null)
  const needsMemberDirectory = useMemo(() => hasExpandableMember(flowNodes), [flowNodes])
  useEffect(() => {
    if (!visible || !needsMemberDirectory) return
    let cancelled = false
    loadMemberDirectory()
      .then((directory) => {
        if (!cancelled) setMemberDirectory(directory)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [visible, needsMemberDirectory])

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
        // 收集所有涉及的用户 ID（tasks 审批人 + 加签发起人 + 节点成员引用）
        const userIds = new Set()
        ;(data.approval_flow_tasks || []).forEach((t) => {
          if (t.assignee_id) userIds.add(t.assignee_id)
          // 加签任务的 created_by 是发起加签的人，时间线需要显示「由XX加签」
          if (t.add_sign_from > 0 && t.created_by) userIds.add(t.created_by)
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

  // 流程里只有发起人时（没有审批人 / 抄送人节点）不展示审批流程区，
  // 避免只显示一条孤立的「发起人」记录。下方 Timeline 实际只渲染 type 2 / 3。
  if (!flowNodes.some((n) => n.type === 2 || n.type === 3)) return null

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
              // 未流转到该节点时按「成员引用展开后的实际人数」展示（组 / 角色可能对应多人）
              const nodePeople = resolveNodePeople(node, memberDirectory, userNameMap)
              // 任务节点整块决定形态：节点已流转则全员任务卡片，节点未流转则全员 Tag 平铺
              const { cards: nodeCards, tags: nodeTags } = splitNodePeople(nodePeople, nodeTasks)
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
                      {/* 人数恒定按流程配置展开后的实际人数，不随已派发的任务条数变化 */}
                      {nodePeople.length}人（
                      {node.strategy === 2 ? '会签' : node.strategy === 3 ? '或签' : '依次审批'}）
                    </span>
                  </div>
                  {nodeCards.length === 0 && nodeTags.length === 0 ? (
                    <div className="mt-1 text-xs text-gray-400">未配置</div>
                  ) : nodeCards.length > 0 ? (
                    // 节点已流转：节点上所有人都出任务卡片
                    nodeCards.map((entry) => {
                      const { task } = entry
                      const userName = task
                        ? entry.name || userNameMap[task.assignee_id] || `用户#${task.assignee_id}`
                        : entry.name
                      // 该人还没轮到自己：没有任务记录，按「未流转」展示
                      if (!task) {
                        return (
                          <div key={entry.key} className="mt-1.5 rounded-md bg-gray-100 p-2">
                            <div className="flex min-w-0 items-center gap-1">
                              <span className="truncate text-sm font-medium text-gray-700">
                                {userName}
                              </span>
                              <Tag size="small" color="gray">
                                未流转
                              </Tag>
                            </div>
                          </div>
                        )
                      }
                      const meta = TASK_STATUS_META[task.status] || TASK_STATUS_META[0]
                      return (
                        <div key={entry.key} className="mt-1.5 rounded-md bg-gray-100 p-2">
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
                              {task.add_sign_from > 0 && (
                                <span className="text-purple-500">
                                  （由{task.created_by
                                    ? userNameMap[task.created_by] || `用户#${task.created_by}`
                                    : '他人'}加签）
                                </span>
                              )}
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
                    // 节点尚未流转：全员 Tag 平铺
                    <div className="mt-1.5 flex flex-wrap items-center gap-1">
                      {nodeTags.map((entry) => (
                        <Tag key={entry.key||entry.id} size="small">
                          {entry.name}
                        </Tag>
                      ))}
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
                  <div className="mt-1 flex flex-wrap gap-1">
                    <MemberTags
                      members={node.members}
                      nameMap={userNameMap}
                      directory={memberDirectory}
                    />
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
