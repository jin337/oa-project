import { Avatar, Divider, Timeline } from '@arco-design/web-react'
import {
  IconBranch,
  IconClose,
  IconPlus,
  IconSend,
  IconStamp,
  IconUser,
} from '@arco-design/web-react/icon'
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import * as deptApi from 'src/api/dept'
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
import { SelectorDataContext } from 'src/pages/application/examine/selector-context'

/**
 * ==================== 审批流程只读展示（独立组件） ====================
 * 从 DynamicForm.jsx 抽离并迁移至 dynamic 目录：审批流配置（approval_flow_json）的
 * 可视化还原，供审批模块各 Drawer（详情 / 编辑 / 申请）在抽屉内独立渲染使用。
 * 节点类型数字枚举与 ExamineManage.jsx 保持一致。
 * 左侧使用 Arco Timeline（时间轴）组件呈现审批流走向（仿钉钉审批单），
 * 右侧成员头像区；「发起人自选」（approverType=3）节点支持点击「+」唤起 PersonSelectorModal 选择人员。
 */

// 审批节点类型元信息（与 ExamineManage.jsx 数字枚举保持一致；bg/icon 供 Timeline 节点 dot 使用）
const APPROVAL_NODE_META = {
  1: { label: '发起人', color: 'green', bg: 'bg-emerald-500', icon: IconUser }, // 1-发起人
  2: { label: '审批人', color: 'orange', bg: 'bg-amber-500', icon: IconStamp }, // 2-审批人
  3: { label: '抄送人', color: 'blue', bg: 'bg-blue-500', icon: IconSend }, // 3-抄送人
  4: { label: '条件分支', color: 'purple', bg: 'bg-purple-500', icon: IconBranch }, // 4-条件分支
}
// 发起人自选类型：1-单选 / 2-多选
const SELF_SELECT_MAP = { 1: '单选', 2: '多选' }
// 审批方式：1-依次审批 / 2-会签 / 3-或签（多选审批人摘要展示用，如「2人依次审批」）
const STRATEGY_MAP = { 1: '依次审批', 2: '会签', 3: '或签' }
// 审批方式连接符（渲染在右侧成员之间）：1-依次审批(>) / 2-会签(+) / 3-或签(/)
const STRATEGY_SYMBOL = { 1: '>', 2: '+', 3: '/' }
// 条件关系：1-且(AND) / 2-或(OR)
const RELATION_MAP = { 1: '且（AND）', 2: '或（OR）' }
// 逻辑运算符 value 枚举：与 constants.js 的 OPERATOR_OPTIONS 严格一致（1-大于 / 2-小于 / 3-等于 / 4-不等于 / 5-包含 / 6-不包含）
const [OP_GREATER, OP_LESS, OP_EQUAL, OP_NOT_EQUAL, OP_CONTAINS, OP_NOT_CONTAINS] =
  OPERATOR_OPTIONS.map((o) => o.value)
// 运算符显示文案映射：由 OPERATOR_OPTIONS 派生，避免硬编码重复定义
const OPERATOR_MAP = Object.fromEntries(OPERATOR_OPTIONS.map((o) => [o.value, o.label]))

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
 * - 子表字段（rule.table_key 对应 formData 中为数组）按子表逻辑取值
 * - 主表字段（无 table_key 或 table_key 对应数据非数组）直接取 formData[field]
 */
const resolveFieldValue = (rule, formData) => {
  if (!formData) return undefined
  const tk = rule.table_key
  if (tk) {
    const tableData = formData[tk]
    // 子表字段：table_key 对应数据为数组（如 cgsq_detail: [...]）
    if (Array.isArray(tableData) && tableData.length) {
      const values = tableData
        .map((row) => row[rule.field])
        .filter((v) => v !== undefined && v !== null && v !== '')
      if (values.length) {
        // 数值字段：子表多行按合计参与条件判断（如明细金额合计 > 阈值）
        const nums = values.map(Number)
        if (nums.every((n) => !Number.isNaN(n))) {
          return nums.reduce((a, b) => a + b, 0)
        }
        // 非数值字段（如状态/文本）：取首行值
        return values[0]
      }
    }
    // 主表字段：table_key 对应数据非数组（formData 平铺主表字段），直接按字段名取值
    return formData[rule.field]
  }
  return formData[rule.field]
}

/** 单条规则评估：operator 为数字枚举（1-大于 / 2-小于 / 3-等于 / 4-不等于 / 5-包含 / 6-不包含） */
const evaluateRule = (rule, formData) => {
  if (!rule) return false
  const actual = resolveFieldValue(rule, formData)
  const cond = rule.value
  switch (rule.operator) {
    case OP_GREATER: // 1-大于
      return Number(actual) > Number(cond)
    case OP_LESS: // 2-小于
      return Number(actual) < Number(cond)
    case OP_EQUAL: // 3-等于
      return compareEqual(actual, cond)
    case OP_NOT_EQUAL: // 4-不等于
      return !compareEqual(actual, cond)
    case OP_CONTAINS: // 5-包含
      return String(actual ?? '').includes(String(cond ?? ''))
    case OP_NOT_CONTAINS: // 6-不包含
      return !String(actual ?? '').includes(String(cond ?? ''))
    default:
      return false
  }
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

/** 构建节点摘要文本（仿钉钉审批单样式：第二行灰色提示，如「1人审批」「抄送5人」「请选择审批人」） */
const buildNodeSummary = (node) => {
  if (node.type === 1) {
    // 1-发起人
    const t = getMembersText(node.members)
    return t ? `可发起人：${t}` : '未配置可发起人'
  }
  if (node.type === 2) {
    // 2-审批人：成员数量 + 审批人为空处理
    if (node.approverType === 3) {
      // 3-发起人自选：未选择提示「请选择审批人」；仅 1 人显示「1人审批」，多人（多选）显示「N人 + 审批方式」（如「2人依次审批」）
      const n = (node.members || []).length
      if (!n) return '请选择审批人'
      if (n === 1) return '1人审批'
      return `${n}人${STRATEGY_MAP[node.strategy] || '审批'}`
    }
    const n = (node.members || []).length
    const parts = [n ? `${n}人审批` : '请选择审批人']
    // 审批人为空处理：3-转交流程管理员 / 4-指定人员（附兜底成员）
    if (node.emptyHandler === 3) parts.push('找不到主管，将自动转交给管理员')
    else if (node.emptyHandler === 4) {
      const t = getMembersText(node.emptyMembers)
      if (t) parts.push(`找不到主管，将自动转交给${t}`)
    }
    return parts.join('，')
  }
  if (node.type === 3) {
    // 3-抄送人：抄送数量
    if (node.approverType === 3) {
      // 3-发起人自选：未选择提示「请选择抄送人」；已选择显示「抄送N人」（如「抄送2人」）
      const n = (node.members || []).length
      return n ? `抄送${n}人` : '请选择抄送人'
    }
    const n = (node.members || []).length
    return n ? `抄送${n}人` : '请选择抄送人'
  }
  if (node.type === 4) {
    // 4-条件分支：条件关系 + 分支数量
    const branchCount = node.branches?.length || 0
    return `条件关系：${RELATION_MAP[node.relation] || node.relation || '—'} · 共 ${branchCount} 个分支`
  }
  return ''
}

/**
 * 成员展示 chip（仿参考图右侧成员区）：
 */
const MemberChip = ({ member, onRemove }) => {
  const name = member.label || member.name || member.title || ''
  return (
    <div className="flex w-11.75 flex-col items-center">
      <div className="relative">
        <Avatar shape="square" size={35} style={{ backgroundColor: 'rgb(var(--primary-6))' }}>
          {name.slice(0, 1) || '?'}
        </Avatar>
        {onRemove && (
          // 发起人自选运行期已选成员：右上角小 X 删除按钮，点击移除该成员
          <span
            className="absolute -top-1.5 -right-1.5 flex h-4 w-4 cursor-pointer items-center justify-center rounded-full bg-gray-200 text-gray-500 transition-colors hover:bg-red-500 hover:text-white"
            onClick={(e) => {
              e.stopPropagation()
              onRemove(member)
            }}
          >
            <IconClose style={{ fontSize: 10 }} />
          </span>
        )}
      </div>
      <span className="w-full truncate text-center text-xs text-gray-600">{name}</span>
    </div>
  )
}

/**
 * 审批节点行内容（不含时间轴竖线与节点 dot，由外层 Timeline.Item 承载）：
 * 左侧标题/摘要两行，右侧成员头像区；仿钉钉审批单样式。
 * 「发起人自选」（approverType=3）节点右侧提供「+」按钮，点击唤起 PersonSelectorModal 选择人员。
 */
const ApprovalNodeView = ({ node, onSelectNode, onRemoveMember }) => {
  return (
    <div className="flex h-13 justify-between gap-4">
      <div className="w-1/3">
        <div className="text-base font-medium">
          {node.label || APPROVAL_NODE_META[node.type]?.label}
        </div>
        <div className="mt-0.5 text-xs text-gray-400">{buildNodeSummary(node)}</div>
      </div>
      <div className="flex shrink-0 flex-wrap justify-end gap-y-1">
        {node.approverType === 3 ? (
          // 3-发起人自选：已选择渲染头像+姓名，未选择仅展示「+」按钮；均可点击唤起选择器
          <>
            {(node.members || []).map((m, i) => (
              <Fragment key={m.key || `${m.type}-${m.label}-${i}`}>
                <MemberChip
                  member={m}
                  // 发起人自选运行期已选成员支持删除：移除后经回调更新成员覆盖
                  onRemove={() => {
                    const updated = (node.members || []).filter((x) => x !== m)
                    onRemoveMember?.(node, updated)
                  }}
                />
                <span className="h-8.75 leading-8.75 text-gray-400">
                  {node.type === 2 ? STRATEGY_SYMBOL[node.strategy] || '>' : '+'}
                </span>
              </Fragment>
            ))}
            <Avatar shape="square" size={35} className="ml-1 cursor-pointer">
              <IconPlus onClick={() => onSelectNode?.(node)} />
            </Avatar>
          </>
        ) : (
          // 非发起人自选（1-指定人员 / 2-指定角色）：保持原有成员渲染
          (node.members || []).map((m, i) => (
            <MemberChip key={m.key || `${m.type}-${m.label}-${i}`} member={m} />
          ))
        )}
      </div>
    </div>
  )
}

/**
 * 审批流程展示组件（左侧 Arco Timeline 时间轴 + 右侧成员区，供申请 / 编辑 / 详情抽屉渲染）。
 * 隐藏发起人节点与「流程结束」标识；条件分支（type=4）视觉穿透：按 formData 评估命中分支后
 * 扁平化展开其 children 节点链，直接衔接前后节点。传入 formData 时条件分支按规则动态评估。
 * 「发起人自选」节点支持点击「+」唤起 PersonSelectorModal 选择人员（选择结果经 onMembersChange 回调）。
 * @param {object} props
 * @param {string|Array} props.raw 应用配置的 approval_flow_json（JSON 字符串或节点数组）
 * @param {object} [props.formData] 实际填报的表单数据（主表字段 + 子表数组），用于条件分支命中评估
 * @param {Function} [props.onMembersChange] 发起人自选节点成员变化回调 (nodeId, members) => void
 */
export default function DynamicFlowView({ raw, formData, onMembersChange }) {
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

  // 懒加载选择器数据源：与 ExamineManage 一致（depts/users + roles 分页列表），挂载到 Context 供 PersonSelectorModal 使用
  useEffect(() => {
    if (!selectorNode) return
    let cancelled = false
    setSelectorData((d) => ({ ...d, loading: true }))
    Promise.all([deptApi.getDeptUsersTree(), roleApi.listRoles({ page: 1, size: 999 })])
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
  }, [selectorNode])

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
      <div className="rounded-lg border border-gray-100 bg-gray-50/60 p-3">
        <Timeline>
          {flattenedNodes.map((n) => {
            const meta = APPROVAL_NODE_META[n.type] || {
              label: `未知节点(${n.type})`,
              bg: 'bg-gray-400',
              icon: IconBranch,
            }
            const Icon = meta.icon
            return (
              <Timeline.Item
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
                />
              </Timeline.Item>
            )
          })}
        </Timeline>
      </div>
      {/* 发起人自选成员选择弹层：复用 PersonSelectorModal（组织架构 + 角色，仅可勾选人员） */}
      {selectorNode && (
        <SelectorDataContext.Provider value={selectorData}>
          <PersonSelectorModal
            title={`选择${selectorNode.type === 2 ? '审批人' : '抄送人'}`}
            value={selectorNode.members || []}
            modes={[1, 2]} // 1-组织架构 / 2-角色
            checkTarget={1} // 1-人员
            selectMode={selectorNode.selfSelect || 2} // 发起人自选：1-单选 / 2-多选（默认多选）
            onChange={handleMembersChange}
            onCancel={() => setSelectorNode(null)}
          />
        </SelectorDataContext.Provider>
      )}
    </>
  )
}
