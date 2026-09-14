import { Avatar, Divider } from '@arco-design/web-react'
import { IconBranch, IconSend, IconStamp, IconUser } from '@arco-design/web-react/icon'
import { useMemo } from 'react'
import { OPERATOR_OPTIONS } from 'src/pages/application/constants'

/**
 * ==================== 审批流程只读展示（独立组件） ====================
 * 从 DynamicForm.jsx 抽离并迁移至 dynamic 目录：审批流配置（approval_flow_json）的
 * 只读可视化还原，供审批模块各 Drawer（详情 / 编辑 / 申请）在抽屉内独立渲染使用。
 * 节点类型数字枚举与 ExamineManage.jsx 保持一致。
 */

// 审批节点类型元信息（与 ExamineManage.jsx 数字枚举保持一致；bg/icon 供自定义节点图标使用）
const APPROVAL_NODE_META = {
  1: { label: '发起人', color: 'green', bg: 'bg-emerald-500', icon: IconUser }, // 1-发起人
  2: { label: '审批人', color: 'orange', bg: 'bg-amber-500', icon: IconStamp }, // 2-审批人
  3: { label: '抄送人', color: 'blue', bg: 'bg-blue-500', icon: IconSend }, // 3-抄送人
  4: { label: '条件分支', color: 'purple', bg: 'bg-purple-500', icon: IconBranch }, // 4-条件分支
}
// 发起人自选类型：1-单选 / 2-多选
const SELF_SELECT_MAP = { 1: '单选', 2: '多选' }
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
 * - 子表字段（rule.table_key 对应 formData 中为数组）取该表首行数据
 * - 主表字段（无 table_key 或 table_key 对应数据非数组）直接取 formData[field]
 */
const resolveFieldValue = (rule, formData) => {
  if (!formData) return undefined
  const tk = rule.table_key
  if (tk) {
    const tableData = formData[tk]
    // 子表字段：table_key 对应数据为数组（如 cgsq_detail: [...]），按子表逻辑取值
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

/** 构建节点摘要文本（仿钉钉审批单样式：第二行灰色提示，如「1人审批」「抄送5人」） */const buildNodeSummary = (node) => {
  if (node.type === 1) {
    // 1-发起人
    const t = getMembersText(node.members)
    return t ? `可发起人：${t}` : '未配置可发起人'
  }
  if (node.type === 2) {
    // 2-审批人：成员数量 + 审批人为空处理；未配置成员时提示「请选择审批人」
    if (node.approverType === 3) {
      // 3-发起人自选：附自选类型（1-单选 / 2-多选）
      return `发起人自选（${SELF_SELECT_MAP[node.selfSelect] || '—'}）`
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
    // 3-抄送人：抄送数量；未配置成员时提示「请选择抄送人」
    if (node.approverType === 3) {
      // 3-发起人自选：附自选类型（1-单选 / 2-多选）
      return `发起人自选（${SELF_SELECT_MAP[node.selfSelect] || '—'}）`
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
 * - 1-人员：圆形头像（姓名首字）+ 姓名
 * - 2-部门 / 3-角色：灰底文本标签
 */
const MemberChip = ({ member }) => {
  if (member.type !== 1) {
    // 2-部门 / 3-角色
    return (
      <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">
        {member.label || member.name || member.title || ''}
      </span>
    )
  }
  const name = member.label || member.name || member.title || ''
  return (
    <div className="flex items-center gap-1">
      <Avatar size={22} style={{ backgroundColor: 'rgb(var(--primary-6))' }}>
        {name.slice(0, 1) || '?'}
      </Avatar>
      <span className="text-xs text-gray-600">{name}</span>
    </div>
  )
}

/**
 * 审批节点行（仿钉钉审批单：左侧节点图标圆 + 标题/摘要两行，右侧成员头像区）。
 * 条件分支（type=4）在节点行下方展开分支条件与嵌套子节点链；
 * 当传入 formData 时按规则评估各分支命中情况：命中分支正常展示，未命中分支置灰弱化。
 */
const ApprovalNodeView = ({ node, isLast, formData }) => {
  const meta =
    APPROVAL_NODE_META[node.type] ||
    { label: `未知节点(${node.type})`, color: 'gray', bg: 'bg-gray-400', icon: IconBranch }
  const Icon = meta.icon
  // 4-条件分支：视觉穿透——不渲染条件节点容器（标题/摘要/分支卡片），
  // 仅直接渲染命中分支（pickHitBranch 评估）下的 children 节点链，与前后流程节点直接衔接
  if (node.type === 4) {
    // 收集所有命中分支（或关系下可能多个），平铺其 children 节点链直接衔接
    const hitBranches = pickHitBranches(node, formData)
    const children = hitBranches.flatMap((b) => b.children || [])
    if (!children.length) return null
    return (
      <>
        {children.map((c, ci) => (
          <ApprovalNodeView
            key={c.id || c.label}
            node={c}
            isLast={ci === children.length - 1 ? isLast : false}
            formData={formData}
          />
        ))}
      </>
    )
  }
  return (
    <div className="relative py-2 pl-10">
      {!isLast && <div className="absolute bottom-0 left-4 top-3 w-px bg-gray-200" />}
      <div
        className={`absolute left-0 top-2 flex h-8 w-8 items-center justify-center rounded-full text-white ${meta.bg}`}
      >
        <Icon style={{ fontSize: 15 }} />
      </div>
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="text-sm font-medium">{node.label || meta.label}</div>
          <div className="mt-0.5 text-xs text-gray-400">{buildNodeSummary(node)}</div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-x-3 gap-y-1">
          {/* 发起人自选（approverType=3）无预置成员，不渲染成员区 */}
          {node.approverType === 3
            ? null
            : (node.members || []).map((m, i) => (
                <MemberChip key={m.key || `${m.type}-${m.label}-${i}`} member={m} />
              ))}
        </div>
      </div>
    </div>
  )
}

/**
 * 审批流程展示组件（仿钉钉审批单样式：左侧步骤节点 + 右侧成员，纯只读）。
 * 隐藏发起人节点与「流程结束」标识，仅展示审批 / 抄送 / 条件分支等流转节点。
 * 传入 formData（实际填报业务数据）时，条件分支按规则动态评估命中情况并差异化渲染。
 * @param {object} props
 * @param {string|Array} props.raw 应用配置的 approval_flow_json（JSON 字符串或节点数组）
 * @param {object} [props.formData] 实际填报的表单数据（主表字段 + 子表数组），用于条件分支命中评估
 */
export default function DynamicFlowView({ raw, formData }) {
  const nodes = useMemo(() => parseApprovalFlow(raw), [raw])
  // 隐藏发起人（type=1）：发起人节点仅用于流程起始说明，不在流转展示中呈现
  const visibleNodes = (nodes || []).filter((node) => node.type !== 1)
  if (!visibleNodes.length) return null
  return (
    <>
      <Divider orientation="left">
        <span className="text-sm font-medium text-gray-700">审批流程</span>
      </Divider>
      <div className="rounded-lg border border-gray-100 bg-gray-50/60 p-3">
        {visibleNodes.map((node, i) => (
          <ApprovalNodeView
            key={node.id || `node_${i}`}
            node={node}
            isLast={i === visibleNodes.length - 1}
            formData={formData}
          />
        ))}
      </div>
    </>
  )
}
