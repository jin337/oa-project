import { Badge, Button, Divider, Tag, Timeline } from '@arco-design/web-react'
import { IconBranch, IconPlus, IconSend, IconStamp, IconUser } from '@arco-design/web-react/icon'
import { useCallback, useEffect, useMemo, useState } from 'react'
import * as deptApi from 'src/api/dept'
import { fetchAll } from 'src/api/fetchAll'
import * as roleApi from 'src/api/role'
import { OPERATOR_OPTIONS } from 'src/pages/application/constants'
import {
  buildOrgItemMap,
  buildRoleItemMap,
  buildUserDeptMap,
  transformDeptTree,
  transformRoleList,
} from 'src/pages/application/examine/flowModel'
import { PersonSelectorModal } from 'src/pages/application/examine/PersonSelectorModal'
import { SelectorDataContext, useSelectorData } from 'src/pages/application/examine/selector-context'
import {
  hasExpandableMember,
  loadMemberDirectory,
  resolveMemberPeople,
  resolveNodePeople,
} from 'src/utils/flowMembers'

/**
 * ==================== 审批流程只读展示（独立组件） ====================
 * 从 DynamicForm.jsx 抽离并迁移至 dynamic 目录：审批流配置（approval_flow_json）的
 * 可视化还原，供审批模块各 Drawer（详情 / 编辑 / 申请）在抽屉内独立渲染使用。
 * 节点类型数字枚举与 ExamineManage.jsx 保持一致。
 * 左侧使用 Arco Timeline（时间轴）组件呈现审批流走向；节点成员（审核人员组 / 角色 / 部门
 * 展开成的人）一律用 Tag 平铺展示，**全部展示不折叠**。
 * 「发起人自选」（approverType=3）节点以「选择审批人 / 选择抄送人」按钮唤起 PersonSelectorModal。
 */

// 审批节点类型元信息（与 ExamineManage.jsx 数字枚举保持一致；bg/icon 供 Timeline 节点 dot 使用）
const APPROVAL_NODE_META = {
  1: { label: '发起人', color: 'green', bg: 'bg-emerald-500', icon: IconUser }, // 1-发起人
  2: { label: '审批人', color: 'orange', bg: 'bg-amber-500', icon: IconStamp }, // 2-审批人
  3: { label: '抄送人', color: 'blue', bg: 'bg-blue-500', icon: IconSend }, // 3-抄送人
  4: { label: '条件分支', color: 'purple', bg: 'bg-purple-500', icon: IconBranch }, // 4-条件分支
}
// 审批方式：1-依次审批 / 2-会签 / 3-或签（多选审批人摘要展示用，如「2人依次审批」）
const STRATEGY_MAP = { 1: '依次审批', 2: '会签', 3: '或签' }
// 条件关系：1-且(AND) / 2-或(OR)
const RELATION_MAP = { 1: '且（AND）', 2: '或（OR）' }
// 逻辑运算符 value 枚举：与 constants.js 的 OPERATOR_OPTIONS 严格一致（1-大于 / 2-小于 / 3-等于 / 4-不等于 / 5-包含 / 6-不包含）
const [OP_GREATER, OP_LESS, OP_EQUAL, OP_NOT_EQUAL, OP_CONTAINS, OP_NOT_CONTAINS] =
  OPERATOR_OPTIONS.map((o) => o.value)

/* ==================== 条件评估（基于实际填报表单数据） ==================== */

/** 宽松等值比较：两侧均可转数字时按数值比较，否则按字符串比较 */
const compareEqual = (a, b) => {
  const na = Number(a)
  const nb = Number(b)
  if (a !== '' && b !== '' && !Number.isNaN(na) && !Number.isNaN(nb)) return na === nb
  return String(a ?? '') === String(b ?? '')
}

/**
 * 获取规则字段在表单数据中的实际值：
 * - 子表字段（rule.table_key 对应 formData 中为数组）按 rule.agg 聚合：
 *   row（默认）返回全部非空行值数组，由 evaluateRule 任一行命中；sum 合计；avg 平均
 * - 主表字段（无 table_key 或 table_key 对应数据非数组）直接取 formData[field]
 */
const resolveFieldValue = (rule, formData) => {
  if (!formData) return undefined
  const tk = rule.table_key
  if (tk) {
    const tableData = formData[tk]
    if (Array.isArray(tableData) && tableData.length) {
      const values = tableData
        .map((row) => row[rule.field])
        .filter((v) => v !== undefined && v !== null && v !== '')
      if (!values.length) return undefined
      const nums = values.map(Number)
      const allNum = nums.every((n) => !Number.isNaN(n))
      switch (rule.agg) {
        case 'sum':
          return allNum ? nums.reduce((a, b) => a + b, 0) : values
        case 'avg':
          return allNum ? nums.reduce((a, b) => a + b, 0) / nums.length : values
        default: // row
          return values
      }
    }
    return formData[rule.field]
  }
  return formData[rule.field]
}

/** 单值按 operator 比较 */
const matchScalar = (actual, cond, op) => {
  switch (op) {
    case OP_GREATER:
      return Number(actual) > Number(cond)
    case OP_LESS:
      return Number(actual) < Number(cond)
    case OP_EQUAL:
      return compareEqual(actual, cond)
    case OP_NOT_EQUAL:
      return !compareEqual(actual, cond)
    case OP_CONTAINS:
      return String(actual ?? '').includes(String(cond ?? ''))
    case OP_NOT_CONTAINS:
      return !String(actual ?? '').includes(String(cond ?? ''))
    default:
      return false
  }
}

/** 单条规则评估：operator 为数字枚举（1-大于 / 2-小于 / 3-等于 / 4-不等于 / 5-包含 / 6-不包含） */
const evaluateRule = (rule, formData) => {
  if (!rule) return false
  const actual = resolveFieldValue(rule, formData)
  const cond = rule.value
  // 子表「单行」模式：任一行命中即满足
  if (Array.isArray(actual)) {
    return actual.some((v) => matchScalar(v, cond, rule.operator))
  }
  return matchScalar(actual, cond, rule.operator)
}

/**
 * 分支命中评估：无条件（默认）分支视为命中；
 * 有条件分支按节点 relation 综合判断——1-且(AND) 需全部规则满足，2-或(OR) 任一规则满足即可
 */
const evaluateBranch = (branch, node, formData) => {
  const rules = branch?.rules || []
  if (!rules.length) return true
  const relation = node?.relation // 1-且 / 2-或
  return relation === 2
    ? rules.some((r) => evaluateRule(r, formData))
    : rules.every((r) => evaluateRule(r, formData))
}

/**
 * 命中分支选择：遍历所有非默认分支，收集按 rules + formData 评估命中的分支（可多个，或关系下全部命中分支生效）；
 * 无非默认分支命中（或无可评估数据）时回退默认分支（isDefault: true）兜底；无默认分支时取第一个非默认分支
 */
const pickHitBranches = (node, formData) => {
  const branches = node?.branches || []
  const normalBranches = branches.filter((b) => !b.isDefault)
  const hitBranches = []
  if (formData && Object.keys(formData).length) {
    for (const b of normalBranches) {
      if (evaluateBranch(b, node, formData)) hitBranches.push(b)
    }
  }
  if (hitBranches.length) return hitBranches
  const defaultBranch = branches.find((b) => b.isDefault)
  if (defaultBranch) return [defaultBranch]
  return normalBranches.length ? [normalBranches[0]] : []
}

/** 解析 approval_flow_json：兼容 JSON 字符串与数组，空值/解析失败返回 null */
const parseApprovalFlow = (raw) => {
  if (!raw) return null
  try {
    const data = typeof raw === 'string' ? JSON.parse(raw) : raw
    return Array.isArray(data) ? data : null
  } catch {
    return null
  }
}

/** 渲染成员/部门/角色文本（兼容字符串数组与 { type, label } 对象数组），无成员返回空串 */
const getMembersText = (members) => {
  const list = Array.isArray(members) ? members : []
  return list
    .map((m) => (typeof m === 'string' ? m : m.label || m.name || m.title || ''))
    .filter(Boolean)
    .join('、')
}

/**
 * 构建节点摘要文本（仿钉钉审批单样式：第二行灰色提示，如「2人审批」「抄送10人」「请选择审批人」）。
 * 人数一律按「成员引用展开后的实际人数」统计：一个审核人员组 / 角色 / 部门可能对应多人，
 * 若直接数 members 条数，10 个用户的角色会被显示成「1人审批」。
 */
const buildNodeSummary = (node, directory) => {
  if (node.type === 1) {
    // 1-发起人
    const t = getMembersText(node.members)
    return t ? `可发起人：${t}` : '未配置可发起人'
  }
  if (node.type === 2) {
    // 2-审批人：实际审批人数 + 审批人为空处理
    const peopleCount = resolveNodePeople(node, directory).length
    if (node.approverType === 3) {
      // 3-发起人自选：未选择提示「请选择审批人」；仅 1 人显示「1人审批」，多人（多选）显示「N人 + 审批方式」（如「2人依次审批」）
      if (!peopleCount) return '请选择审批人'
      if (peopleCount === 1) return '1人审批'
      return `${peopleCount}人${STRATEGY_MAP[node.strategy] || '审批'}`
    }
    const parts = [
      peopleCount
        ? `${peopleCount}人审批`
        : node.approverType === 4
          ? '请选择审核人员组'
          : '请选择审批人',
    ]
    // 审批人为空处理：3-转交流程管理员 / 4-指定人员（附兜底成员）
    if (node.emptyHandler === 3) parts.push('找不到主管，将自动转交给管理员')
    else if (node.emptyHandler === 4) {
      const t = getMembersText(node.emptyMembers)
      if (t) parts.push(`找不到主管，将自动转交给${t}`)
    }
    return parts.join('，')
  }
  if (node.type === 3) {
    // 3-抄送人：抄送人数（同样按展开后实际人数）
    const peopleCount = resolveNodePeople(node, directory).length
    if (peopleCount) return `抄送${peopleCount}人`
    return node.approverType === 4 ? '请选择审核人员组' : '请选择抄送人'
  }
  if (node.type === 4) {
    // 4-条件分支：条件关系 + 分支数量
    const branchCount = node.branches?.length || 0
    return `条件关系：${RELATION_MAP[node.relation] || node.relation || '—'} · 共 ${branchCount} 个分支`
  }
  return ''
}

/**
 * 单个成员引用的展示名：人员引用取本人姓名，部门 / 角色 / 审核人员组由调用方
 * 展开为多个人后再逐个渲染，这里只用于「发起人自选」这类成员本身就是人的节点。
 */
const memberDisplayName = (member, directory) => {
  const people = resolveMemberPeople(member, directory)
  if (people[0]?.name) return people[0].name
  // 降级：目录与 label 都拿不到姓名时，从 key（如 user_5）中提取用户 ID 显示
  const uidMatch = String(member?.key || '').match(/^user_(\d+)$/)
  return uidMatch ? `用户${uidMatch[1]}` : ''
}

/**
 * 人员 Tag：审批流程成员一律用 Tag 平铺展示（不再使用头像 chip，也不折叠成「等N人」）。
 * name 由调用方展开成员引用后传入，因此审核人员组 / 角色 / 部门会展开成多个 Tag。
 * onRemove 存在时（发起人自选节点已选成员）Tag 显示关闭按钮，点击即移除该成员。
 */
const MemberTag = ({ name, onRemove }) => (
  <Tag size='medium'
    closable={Boolean(onRemove)}
    onClose={
      onRemove
        ? (e) => {
            e.stopPropagation()
            onRemove()
          }
        : undefined
    }
  >
    {name || '未知'}
  </Tag>
)

/**
 * 节点成员区：把成员引用展开为具体的人后逐个 Tag 平铺（与「指定人员」多人时的效果一致）。
 * 全部展示不折叠 —— 折叠成「等N人」就看不到到底是谁在等审批。
 * 展开结果与后端创建审批任务的口径一致。
 */
const NodePeopleArea = ({ node, directory }) => {
  const people = resolveNodePeople(node, directory)
  if (!people.length) return null
  return (
    <>
      {people.map((person) => (
        <MemberTag
          key={person.id != null ? `u${person.id}` : `n${person.name}`}
          name={person.name}
        />
      ))}
    </>
  )
}

/**
 * 审批节点行内容（不含时间轴竖线与节点 dot，由外层 Timeline.Item 承载）：
 * 上方标题/摘要两行，下方成员 Tag 平铺区。
 * 「发起人自选」（approverType=3）节点显示「选择审批人 / 选择抄送人」按钮，点击唤起 PersonSelectorModal。
 */
const ApprovalNodeView = ({ node, onSelectNode, onRemoveMember, directory }) => {
  const isSelfSelect = node.approverType === 3
  const selectedMembers = node.members || []
  return (
    <div className="flex flex-col">
      <div className="text-base font-medium">
        {node.label || APPROVAL_NODE_META[node.type]?.label}
      </div>
      <div className="mt-0.5 text-xs text-gray-400">{buildNodeSummary(node, directory)}</div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1">
        {isSelfSelect ? (
          // 3-发起人自选：已选成员用可关闭 Tag 展示，未选择时用按钮唤起选择器
          <>
            {selectedMembers.map((m, i) => (
              <MemberTag
                key={m.key || `${m.type}-${m.label}-${i}`}
                name={memberDisplayName(m, directory)}
                // 发起人自选运行期已选成员支持删除：移除后经回调更新成员覆盖
                onRemove={() => {
                  onRemoveMember?.(
                    node,
                    selectedMembers.filter((x) => x !== m),
                  )
                }}
              />
            ))}
            <Badge count={9} dot>
              <Button icon={<IconPlus />} size="small" type='outline' onClick={() => onSelectNode?.(node)} />
            </Badge>
          </>
        ) : (
          // 非发起人自选（1-指定人员 / 2-指定角色 / 4-审核人员组）：成员引用展开为具体的人后 Tag 平铺
          <NodePeopleArea node={node} directory={directory} />
        )}
      </div>
    </div>
  )
}

/**
 * 审批流程展示组件（左侧 Arco Timeline 时间轴，节点成员一律 Tag 平铺，供申请 / 编辑抽屉渲染）。
 * 隐藏发起人节点与「流程结束」标识；条件分支（type=4）视觉穿透：按 formData 评估命中分支后
 * 扁平化展开其 children 节点链，直接衔接前后节点。传入 formData 时条件分支按规则动态评估。
 * 「发起人自选」节点点击「选择审批人 / 选择抄送人」按钮唤起 PersonSelectorModal（选择结果经 onMembersChange 回调）。
 * @param {object} props
 * @param {string|Array} props.raw 流程配置的 approval_flow_json（JSON 字符串或节点数组）
 * @param {object} [props.formData] 实际填报的表单数据（主表字段 + 子表数组），用于条件分支命中评估
 * @param {Function} [props.onMembersChange] 发起人自选节点成员变化回调 (nodeId, members) => void
 */
export default function DynamicFlowView({ raw, formData, onMembersChange, onReadyStateChange }) {
  const nodes = useMemo(() => parseApprovalFlow(raw), [raw])
  // 发起人自选节点运行期成员覆盖：nodeId -> members（选择后展示用）
  const [memberOverrides, setMemberOverrides] = useState({})
  // 合并成员覆盖进节点树（含条件分支 children 递归），供渲染统一按 node.members 展示
  const mergedNodes = useMemo(() => {
    if (!nodes) return nodes
    const merge = (list) =>
      (list || []).map((n) => {
        const m = { ...n }
        if (memberOverrides[n.id]) m.members = memberOverrides[n.id]
        if (n.type === 4 && Array.isArray(n.branches)) {
          m.branches = n.branches.map((b) => ({ ...b, children: merge(b.children) }))
        }
        return m
      })
    return merge(nodes)
  }, [nodes, memberOverrides])
  // 隐藏发起人（type=1）：发起人节点仅用于流程起始说明，不在流转展示中呈现
  const visibleNodes = (mergedNodes || []).filter((node) => node.type !== 1)
  // 条件分支视觉穿透：扁平化展开命中分支的 children，得到 Timeline 上的线性节点链
  const flattenedNodes = useMemo(() => {
    const flat = []
    const walk = (list) => {
      ;(list || []).forEach((n) => {
        if (n.type === 4) {
          // 4-条件分支：不渲染节点本身，直接穿透展开命中分支的 children
          const hitBranches = pickHitBranches(n, formData)
          walk(hitBranches.flatMap((b) => b.children || []))
        } else {
          flat.push(n)
        }
      })
    }
    walk(visibleNodes)
    return flat
  }, [visibleNodes, formData])
  // 发起人自选节点必须选人（审批人 approverType=3，或抄送节点配置了自选）：
  // 命中路径上的自选节点未选任何成员时，提交应被前端拦截（后端同样校验）
  const missingSelfSelectNodes = useMemo(() => {
    return (flattenedNodes || []).filter((n) => {
      const isSelfSelect = n.approverType === 3 || (n.type === 3 && n.selfSelect > 0)
      if (!isSelfSelect) return false
      return !(memberOverrides[n.id] || n.members || []).length
    })
  }, [flattenedNodes, memberOverrides])
  useEffect(() => {
    onReadyStateChange?.(missingSelfSelectNodes.length === 0)
  }, [missingSelfSelectNodes, onReadyStateChange])
  // 人员成员目录（部门 / 角色 / 审核人员组 → 具体的人）：
  // 仅当流程里真的存在这几类引用时才加载，避免只配了人员节点的流程白拉三份数据；
  // 加载完成前成员区回退显示 label，不会出现空白。
  const [memberDirectory, setMemberDirectory] = useState(null)
  const needsMemberDirectory = useMemo(() => hasExpandableMember(visibleNodes), [visibleNodes])
  useEffect(() => {
    if (!needsMemberDirectory) return
    let cancelled = false
    loadMemberDirectory()
      .then((directory) => {
        if (!cancelled) setMemberDirectory(directory)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [needsMemberDirectory])

  // 当前唤起选择器的节点
  const [selectorNode, setSelectorNode] = useState(null)
  // 对象选择器数据源（组织架构树 / 角色列表 / 派生映射），首次唤起选择器时懒加载
  const [selectorData, setSelectorData] = useState({
    orgTree: [],
    roleList: [],
    orgItemMap: {},
    roleItemMap: {},
    userDeptMap: {},
    loading: false,
  })
  // 父级已注入选择器数据源（如审批详情 Drawer 统一加载）：直接复用，不再独立请求
  const externalData = useSelectorData()
  const hasExternal = Boolean(
    externalData && (externalData.loading || (externalData.orgTree && externalData.orgTree.length)),
  )

  // 懒加载选择器数据源：父级已提供数据时跳过（避免重复请求）
  useEffect(() => {
    if (!selectorNode || hasExternal) return
    let cancelled = false
    setSelectorData((d) => ({ ...d, loading: true }))
    Promise.all([
      deptApi.getDeptUsersTree({ status: 1 }),
      fetchAll(roleApi.listRoles, { status: 1 }),
    ])
      .then(([deptRes, roleRes]) => {
        if (cancelled) return
        const orgTree = transformDeptTree(deptRes.data?.list || deptRes.data || [])
        const roleList = transformRoleList(roleRes.data?.list || roleRes.data || [])
        setSelectorData({
          orgTree,
          roleList,
          orgItemMap: buildOrgItemMap(orgTree),
          roleItemMap: buildRoleItemMap(roleList),
          userDeptMap: buildUserDeptMap(orgTree),
          loading: false,
        })
      })
      .catch(() => {
        if (!cancelled) setSelectorData((d) => ({ ...d, loading: false }))
      })
    return () => {
      cancelled = true
    }
  }, [selectorNode, hasExternal])

  // 发起人自选成员删除：更新节点成员覆盖并回调父组件
  const handleRemoveMember = useCallback(
    (node, updatedMembers) => {
      setMemberOverrides((prev) => ({ ...prev, [node.id]: updatedMembers }))
      onMembersChange?.(node.id, updatedMembers)
    },
    [onMembersChange],
  )

  // 选择器确认：更新节点成员覆盖并回调父组件
  const handleMembersChange = useCallback(
    (items) => {
      if (!selectorNode) return
      setMemberOverrides((prev) => ({ ...prev, [selectorNode.id]: items }))
      setSelectorNode(null)
      onMembersChange?.(selectorNode.id, items)
    },
    [selectorNode, onMembersChange],
  )

  if (!flattenedNodes.length) return null

  return (
    <>
      <Divider orientation="left">
        <span className="text-sm font-medium text-gray-700">审批流程</span>
      </Divider>
      <div className="p-1.5">
        <Timeline>
          {flattenedNodes.map((n, i) => {
            const meta = APPROVAL_NODE_META[n.type] || {
              label: `未知节点(${n.type})`,
              bg: 'bg-gray-400',
              icon: IconBranch,
            }
            const Icon = meta.icon
            return (
              <Timeline.Item
                className={`min-h-10! ${flattenedNodes.length - 1 !== i ? 'pb-5' : ''}`}
                key={n.id || n.label}
                dot={
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full text-white ${meta.bg}`}
                  >
                    <Icon style={{ fontSize: 13 }} />
                  </span>
                }
              >
                <ApprovalNodeView
                  node={n}
                  onSelectNode={setSelectorNode}
                  onRemoveMember={handleRemoveMember}
                  directory={memberDirectory}
                />
              </Timeline.Item>
            )
          })}
        </Timeline>
      </div>
      {/* 发起人自选成员选择弹层：父级已注入数据时直接复用 Context，不再包 Provider */}
      {selectorNode &&
        (hasExternal ? (
          <PersonSelectorModal
            title={`选择${selectorNode.type === 2 ? '审批人' : '抄送人'}`}
            value={selectorNode.members || []}
            modes={[1, 2]} // 1-组织架构 / 2-角色
            selectMode={selectorNode.selfSelect || 2} // 发起人自选：1-单选 / 2-多选（默认多选）
            onChange={handleMembersChange}
            onCancel={() => setSelectorNode(null)}
          />
        ) : (
          <SelectorDataContext.Provider value={selectorData}>
            <PersonSelectorModal
              title={`选择${selectorNode.type === 2 ? '审批人' : '抄送人'}`}
              value={selectorNode.members || []}
              modes={[1, 2]} // 1-组织架构 / 2-角色
              selectMode={selectorNode.selfSelect || 2} // 发起人自选：1-单选 / 2-多选（默认多选）
              onChange={handleMembersChange}
              onCancel={() => setSelectorNode(null)}
            />
          </SelectorDataContext.Provider>
        ))}
    </>
  )
}
