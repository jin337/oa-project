import { Avatar, Divider } from '@arco-design/web-react'
import { IconBranch, IconSend, IconStamp, IconUser } from '@arco-design/web-react/icon'
import { useMemo } from 'react'

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
// 逻辑运算符：1-大于 / 2-小于 / 3-等于 / 4-不等于 / 5-包含 / 6-不包含
const OPERATOR_MAP = { 1: '大于', 2: '小于', 3: '等于', 4: '不等于', 5: '包含', 6: '不包含' }

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

/** 构建节点摘要文本（仿钉钉审批单样式：第二行灰色提示，如「1人审批」「抄送5人」） */
const buildNodeSummary = (node) => {
  if (node.type === 1) {
    // 1-发起人
    const t = getMembersText(node.members)
    return t ? `可发起人：${t}` : '未配置可发起人'
  }
  if (node.type === 2) {
    // 2-审批人：成员数量 + 审批人为空处理
    if (node.approverType === 3) {
      // 3-发起人自选：附自选类型（1-单选 / 2-多选）
      return `发起人自选（${SELF_SELECT_MAP[node.selfSelect] || '—'}）`
    }
    const n = (node.members || []).length
    const parts = [n ? `${n}人审批` : '未配置审批人']
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
      // 3-发起人自选：附自选类型（1-单选 / 2-多选）
      return `发起人自选（${SELF_SELECT_MAP[node.selfSelect] || '—'}）`
    }
    const n = (node.members || []).length
    return n ? `抄送${n}人` : '未配置抄送人'
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
 * 条件分支（type=4）在节点行下方展开分支条件与嵌套子节点链。
 */
const ApprovalNodeView = ({ node, isLast }) => {
  const meta =
    APPROVAL_NODE_META[node.type] ||
    { label: `未知节点(${node.type})`, color: 'gray', bg: 'bg-gray-400', icon: IconBranch }
  const Icon = meta.icon

  // 4-条件分支：展开各分支（条件表达式 + 分支内节点链递归）
  if (node.type === 4) {
    return (
      <div className="relative py-2 pl-10">
        <div className="absolute bottom-0 left-4 top-3 w-px bg-gray-200" />
        <div
          className={`absolute left-0 top-2 flex h-8 w-8 items-center justify-center rounded-full text-white ${meta.bg}`}
        >
          <Icon style={{ fontSize: 15 }} />
        </div>
        <div className="text-sm font-medium">{node.label || meta.label}</div>
        <div className="mt-0.5 text-xs text-gray-400">{buildNodeSummary(node)}</div>
        <div className="mt-2 space-y-2 rounded-lg border border-purple-100 bg-purple-50/40 p-2">
          {(node.branches || []).map((b) => (
            <div key={b.id || b.label} className="rounded border border-white bg-white/60 p-2">
              <div className="mb-1 text-xs font-medium text-purple-600">
                {b.isDefault ? '默认分支' : b.label || '未命名分支'}
              </div>
              {(b.rules || []).length ? (
                <div className="mb-2 space-y-0.5">
                  {b.rules.map((r, i) => (
                    <div key={i} className="text-xs text-gray-600">
                      {r.field} {OPERATOR_MAP[r.operator] || r.operator} {r.value}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mb-2 text-xs text-gray-400">无条件（默认进入）</div>
              )}
              {(b.children || []).length > 0 && (
                <div className="mt-2 space-y-1 border-t border-purple-100 pt-2">
                  {b.children.map((c, ci) => (
                    <ApprovalNodeView
                      key={c.id || c.label}
                      node={c}
                      isLast={ci === b.children.length - 1}
                    />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
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
 * @param {object} props
 * @param {string|Array} props.raw 应用配置的 approval_flow_json（JSON 字符串或节点数组）
 */
export default function DynamicFlowView({ raw }) {
  const nodes = useMemo(() => parseApprovalFlow(raw), [raw])
  if (!nodes?.length) return null
  return (
    <>
      <Divider orientation="left">
        <span className="text-sm font-medium text-gray-700">审批流程</span>
      </Divider>
      <div className="rounded-lg border border-gray-100 bg-gray-50/60 p-3">
        {nodes.map((node, i) => (
          <ApprovalNodeView
            key={node.id || `node_${i}`}
            node={node}
            isLast={i === nodes.length - 1}
          />
        ))}
        <div className="py-2 pl-10 text-xs text-gray-400">流程结束</div>
      </div>
    </>
  )
}
