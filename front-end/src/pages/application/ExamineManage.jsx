import { Button, Card, Message, Popconfirm, Popover, Space, Tag } from '@arco-design/web-react'
import {
  IconBranch,
  IconClose,
  IconPlus,
  IconSend,
  IconStamp,
  IconUser,
} from '@arco-design/web-react/icon'
import { Fragment, useCallback, useEffect, useState } from 'react'
import { useLocation, useParams } from 'react-router-dom'
import { useTabs } from '../../store/tab-context'

const MODULE_LABEL = '审批配置'

// 节点类型元信息（label / 颜色 / 图标）
const NODE_TYPE_META = {
  initiator: {
    label: '发起人',
    bg: 'bg-emerald-500',
    icon: IconUser,
  },
  approver: {
    label: '审批人',
    bg: 'bg-amber-500',
    icon: IconStamp,
  },
  cc: {
    label: '抄送人',
    bg: 'bg-blue-500',
    icon: IconSend,
  },
  condition: {
    label: '条件分支',
    bg: 'bg-purple-500',
    icon: IconBranch,
  },
}

// 审批人策略（卡片摘要展示用）
const STRATEGY_MAP = {
  self_multi: '发起人自选（多选）',
  self_single: '发起人自选（单选）',
  assign: '指定成员',
}

const genId = (prefix) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

const createBranch = (label, isDefault = false) => ({
  id: genId('b'),
  label,
  isDefault,
  rules: [],
})

// 按类型创建节点（发起人/抄送人带成员；审批人带策略；条件分支默认生成「默认 + 条件1」两个分支）
const createNode = (type) => {
  const base = { id: genId('n'), type, label: NODE_TYPE_META[type].label }
  if (type === 'initiator' || type === 'cc') return { ...base, members: [] }
  if (type === 'approver') return { ...base, strategy: 'self_multi', members: [] }
  if (type === 'condition')
    return { ...base, branches: [createBranch('默认', true), createBranch('条件1')] }
  return base
}

// ==================== 流程画布子组件 ====================

// 节点摘要（纯信息展示）：成员/ 审批策略 / 条件分支卡
function renderNodeSummary(node) {
  if (node.type === 'condition') {
    return (
      <div className="flex flex-wrap gap-2">
        {node.branches?.map((b) => (
          <div key={b.id} className="rounded border border-gray-200 bg-gray-50 px-2 py-1 text-xs">
            <div className="font-medium text-gray-700">
              条件: {b.isDefault ? '默认' : b.label || '未命名'}
            </div>
            <div className="text-gray-400">
              {b.isDefault ? '不满足其他条件，进入此分支' : `已设置(${b.rules?.length || 0})个条件`}
            </div>
          </div>
        ))}
      </div>
    )
  }
  if (node.type === 'approver') {
    return (
      <div className="flex flex-wrap items-center gap-1">
        {node.members?.length ? (
          node.members.map((m) => <Tag key={m}>{m}</Tag>)
        ) : (
          <span className="cursor-pointer text-xs text-gray-400">未设置成员</span>
        )}
      </div>
    )
  }
  return (
    <div className="flex flex-wrap gap-1">
      {node.members?.length ? (
        node.members.map((m) => <Tag key={m}>{m}</Tag>)
      ) : (
        <span className="cursor-pointer text-xs text-gray-400">未设置成员</span>
      )}
    </div>
  )
}

/** 1. 节点卡片区域：渲染单个流程节点卡片（类型色标 + 图标 + 摘要 + 删除） */
function FlowNodeCard({ node, onRemove }) {
  const meta = NODE_TYPE_META[node.type]
  const Icon = meta.icon
  return (
    <div className="w-52 rounded border border-(--color-neutral-3) bg-white shadow">
      <div
        className={`flex items-center justify-between border-b border-(--color-neutral-3) px-2 py-1 text-sm text-white ${meta.bg}`}
      >
        <div className="flex items-center gap-2 text-sm font-medium">
          <Icon />
          {node.label}
        </div>
        {/* 发起人节点唯一且不可删除，隐藏删除入口 */}
        {node.type !== 'initiator' && (
          <Popconfirm
            position="right"
            focusLock
            title="确认删除该节点？"
            onOk={() => onRemove(node.id)}
          >
            <IconClose
              className="cursor-pointer text-white!"
              onClick={(e) => e.stopPropagation()}
            />
          </Popconfirm>
        )}
      </div>
      <div className="px-3 py-2">{renderNodeSummary(node)}</div>
    </div>
  )
}

/** 2. 连接线与操作按钮区域：节点间竖虚线连接 + 「+」插入按钮（hover/点击弹出类型菜单） */
function NodeConnector({ menu }) {
  return (
    <div className="flex flex-col items-center">
      <div className="h-4 w-px border-l border-gray-300" />
      <Popover
        title={<div className="mb-2 text-sm font-bold">添加流程节点</div>}
        content={menu}
        position="bl"
      >
        <Button size="mini" shape="circle" type="primary" icon={<IconPlus />} />
      </Popover>
      <div className="h-4 w-px border-l border-gray-300" />
    </div>
  )
}

export default function ExamineManage() {
  const location = useLocation()
  const { id } = useParams() // 预留：后端接口就绪后用于请求当前应用的审批流配置
  const { addTab } = useTabs()

  // 默认流程：始终包含一个「发起人」起始节点
  const [nodes, setNodes] = useState(() => [createNode('initiator')])

  // 挂载：确保页签存在（接口请求暂未接入，先以纯前端流程设计为主）
  useEffect(() => {
    addTab({ path: location.pathname, title: MODULE_LABEL })
  }, [location.pathname, addTab])

  // 在指定位置插入新节点（节点之间 / 末尾）
  const insertNodeAt = useCallback((index, type) => {
    setNodes((prev) => [...prev.slice(0, index), createNode(type), ...prev.slice(index)])
  }, [])

  const handleRemoveNode = useCallback((nodeId) => {
    setNodes((prev) => prev.filter((n) => n.id !== nodeId))
    Message.success('节点已删除')
  }, [])

  // 节点间「+」添加菜单（hover / 点击弹出，选择类型后在对应位置插入；发起人节点唯一，不提供添加入口）
  const buildAddMenu = (index) => (
    <Space>
      {Object.entries(NODE_TYPE_META)
        .filter(([type]) => type !== 'initiator')
        .map(([type, meta]) => (
          <Button
            size="small"
            key={type}
            onClick={() => insertNodeAt(index, type)}
            icon={<meta.icon />}
          >
            {meta.label}
          </Button>
        ))}
    </Space>
  )

  return (
    <Card title="审批流程配置">
      {/* 流程画布：底部固定「流程结束」标识 */}
      <div className="flex w-fit min-w-full flex-col items-center">
        <div className="flex-1">
          <div className="flex flex-col items-center">
            {nodes.map((node, i) => (
              <Fragment key={node.id}>
                {i > 0 && <NodeConnector menu={buildAddMenu(i)} />}
                <FlowNodeCard node={node} onRemove={handleRemoveNode} />
              </Fragment>
            ))}
            {/* 末尾：连接线 + 添加按钮（指向流程结束） */}
            <NodeConnector menu={buildAddMenu(nodes.length)} />
          </div>
        </div>
        <div className="text-gray-400">流程结束</div>
      </div>
    </Card>
  )
}
