import { Popconfirm, Popover, Tag } from '@arco-design/web-react'
import { IconBranch, IconClose } from '@arco-design/web-react/icon'
import { memo } from 'react'
import { NODE_TYPE_META } from './constants'

/**
 * 节点摘要（纯信息展示）：成员 / 审批策略（条件分支由 ConditionBlock 独立渲染）
 * members 为 { key, type, label } 对象数组，取 label 渲染；人员附带「所属部门：姓名」
 */
export function renderNodeSummary(node, userDeptMap = {}) {
  const renderMemberLabel = (m) =>
    // m.type 为数字枚举：1-人员（附所属部门）/ 2-部门 / 3-角色
    m.type === 1 && userDeptMap[m.key] ? `${userDeptMap[m.key]}：${m.label}` : m.label || m.key

  // 审批人 / 抄送人节点：对象为「发起人自选」（approverType=3）时无需配置成员，摘要直接展示类型
  if (node.approverType === 3 && (node.type === 2 || node.type === 3)) {
    return <span className="block w-full truncate text-xs">发起人自选</span>
  }

  if (!node.members?.length) {
    return <span className="cursor-pointer text-xs text-gray-400">未设置成员</span>
  }

  const labels = node.members.map(renderMemberLabel)
  const summaryText =
    labels.length <= 3
      ? labels.join('、')
      : `${labels.slice(0, 3).join('、')} 等 ${labels.length} 人`
  const tooltipContent = (
    <div className="flex max-h-80 flex-wrap gap-1 overflow-auto p-1">
      {node.members.map((m, i) => (
        <Tag key={m.key || `${m.type}-${m.label}-${i}`}>{renderMemberLabel(m)}</Tag>
      ))}
    </div>
  )
  return (
    <Popover position="right" content={tooltipContent}>
      <span className="block w-full truncate text-xs">{summaryText}</span>
    </Popover>
  )
}

/**
 * 节点卡片：渲染单个流程节点卡片（类型色标 + 图标 + 摘要 + 删除），点击卡片弹出编辑弹层。
 * 纯展示组件，memo 包裹避免画布局部更新引发全局重渲染。
 */
export const FlowNodeCard = memo(function FlowNodeCard({ node, userDeptMap = {}, onRemove, onEdit }) {
  // 兜底：未知或未归一化的旧类型不崩溃，按普通节点渲染
  const meta = NODE_TYPE_META[node.type] || { label: '未知节点', bg: 'bg-gray-500', icon: IconBranch }
  const Icon = meta.icon
  return (
    <div
      className="relative w-55 cursor-pointer rounded border border-(--color-neutral-3) bg-white shadow"
      onClick={() => onEdit?.(node)}
    >
      <div
        className={`flex items-center justify-between border-b border-(--color-neutral-3) px-2 py-1 text-white ${meta.bg}`}
      >
        <div className="flex items-center gap-2 font-medium">
          <Icon />
          {node.label}
        </div>
        {/* 1-发起人节点唯一且不可删除，隐藏删除入口 */}
        {node.type !== 1 && (
          <Popconfirm
            position="lb"
            focusLock
            title="确认删除该节点？"
            onOk={(e) => {
              e.stopPropagation()
              onRemove(node.id)
            }}
          >
            <IconClose
              className="cursor-pointer text-white!"
              onClick={(e) => e.stopPropagation()}
            />
          </Popconfirm>
        )}
      </div>
      <div className="px-3 py-2">{renderNodeSummary(node, userDeptMap)}</div>
    </div>
  )
})
