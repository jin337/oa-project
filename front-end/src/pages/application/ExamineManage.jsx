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

const genId = (prefix) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

const createBranch = (label, isDefault = false) => ({
  id: genId('b'),
  label,
  isDefault,
  rules: [],
  children: [], // 分支下的流程节点链
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

// 节点摘要（纯信息展示）：成员 / 审批策略（条件分支由 ConditionBlock 独立渲染）
function renderNodeSummary(node) {
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

/** 分支卡：以 FlowNodeCard 同款卡片样式渲染单个条件分支（条件: X + 摘要 + 非默认可删除） */
function BranchCard({ branch, onRemove }) {
  return (
    <div className="w-52 rounded border border-(--color-neutral-3) bg-white shadow">
      <div className="flex items-center justify-between border-b border-(--color-neutral-3) bg-purple-500 px-2 py-1 text-sm text-white">
        <div className="flex items-center gap-2 font-medium">
          条件: {branch.isDefault ? '默认' : branch.label || '未命名'}
        </div>
        {onRemove && (
          <IconClose
            className="cursor-pointer text-white!"
            onClick={(e) => {
              e.stopPropagation()
              onRemove()
            }}
          />
        )}
      </div>
      <div className="px-3 py-2 text-xs text-gray-400">
        {branch.isDefault
          ? '不满足其他条件，进入此分支'
          : `已设置 (${branch.rules?.length || 0}) 个条件`}
      </div>
    </div>
  )
}

/**
 * 条件分支节点：纯布局容器（无卡片外观），负责承载各条件分支列。
 * 每个分支以 BranchCard（FlowNodeCard 同款样式）渲染，卡下接连接线 + 加号，再挂节点链（支持嵌套条件递归）。
 * 条件分支不能被直接删除：仅当删除某非默认分支后只剩「默认」分支时，级联删除整个条件节点。
 */
function ConditionBlock({ node, onAddBranch, onRemoveBranch, onRemoveNode, buildBranchAddMenu }) {
  return (
    <div className="flex flex-col items-center">
      {/* 添加条件：灰色圆角胶囊 */}
      <div
        className="z-10 -mb-4 cursor-pointer rounded-full bg-neutral-200 px-4 leading-7 hover:bg-neutral-300"
        onClick={() => onAddBranch(node.id)}
      >
        添加条件
      </div>
      {/* 分支列区：每分支一列 = 分支卡 + 连接线/加号 + 节点链 + 末尾加号 */}
      <div className="relative flex bg-white">
        {node.branches?.map((b, i) => (
          <div key={b.id} className="relative flex flex-col items-center px-2">
            <div
              className={`absolute top-0 ${i === 0 ? 'right-0 left-1/2 w-1/2' : i === node.branches.length - 1 ? 'right-1/2 left-0 w-1/2' : 'w-full'} h-0 border-t border-gray-300`}
            />
            <div className="h-8 w-px border-l border-gray-300" />
            <BranchCard
              branch={b}
              onRemove={b.isDefault ? undefined : () => onRemoveBranch(node.id, b.id)}
            />
            <NodeConnector menu={buildBranchAddMenu(node.id, b.id, b.children?.length || 0)} />
            <div
              className={`absolute bottom-0 ${i === 0 ? 'right-0 left-1/2 w-1/2' : i === node.branches.length - 1 ? 'right-1/2 left-0 w-1/2' : 'w-full'} h-0 border-t border-gray-300`}
            />
            {b.children?.map((child, ci) => (
              <Fragment key={child.id}>
                {ci > 0 && <NodeConnector menu={buildBranchAddMenu(node.id, b.id, ci + 1)} />}
                {child.type === 'condition' ? (
                  <ConditionBlock
                    node={child}
                    onAddBranch={onAddBranch}
                    onRemoveBranch={onRemoveBranch}
                    onRemoveNode={onRemoveNode}
                    buildBranchAddMenu={buildBranchAddMenu}
                  />
                ) : (
                  <FlowNodeCard node={child} onRemove={(cid) => onRemoveNode(node.id, b.id, cid)} />
                )}
              </Fragment>
            ))}
            {/* 分支内末尾：添加节点（指向分支结束） */}
            <NodeConnector menu={buildBranchAddMenu(node.id, b.id, b.children?.length || 0)} />
          </div>
        ))}
      </div>
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

  const handleRemoveNode = useCallback((nodeId, branchId, childId) => {
    if (branchId && childId) {
      // 删除条件分支下的节点
      setNodes((prev) =>
        prev.map((n) =>
          n.id === nodeId
            ? {
                ...n,
                branches: n.branches.map((b) =>
                  b.id === branchId
                    ? { ...b, children: b.children.filter((c) => c.id !== childId) }
                    : b,
                ),
              }
            : n,
        ),
      )
    } else {
      // 删除主链节点
      setNodes((prev) => prev.filter((n) => n.id !== nodeId))
    }
    Message.success('节点已删除')
  }, [])

  // 条件节点：添加条件（分支）
  const addBranch = useCallback((nodeId) => {
    setNodes((prev) =>
      prev.map((n) =>
        n.id === nodeId
          ? { ...n, branches: [...n.branches, createBranch(`条件${n.branches.length}`)] }
          : n,
      ),
    )
  }, [])

  // 条件节点：删除条件（分支）。
  // 级联删除：条件分支不能被直接一键删除，当删除后仅剩「默认」分支时，整个条件节点一并移除
  const removeBranch = useCallback((nodeId, branchId) => {
    setNodes((prev) =>
      prev
        .map((n) => {
          if (n.id !== nodeId) return n
          const branches = n.branches.filter((b) => b.id !== branchId)
          if (branches.length === 1 && branches[0].isDefault) return null // 级联删除整个条件节点
          return { ...n, branches }
        })
        .filter(Boolean),
    )
  }, [])

  // 条件分支内：在指定位置插入节点
  const insertBranchNode = useCallback((nodeId, branchId, index, type) => {
    setNodes((prev) =>
      prev.map((n) =>
        n.id === nodeId
          ? {
              ...n,
              branches: n.branches.map((b) =>
                b.id === branchId
                  ? {
                      ...b,
                      children: [
                        ...b.children.slice(0, index),
                        createNode(type),
                        ...b.children.slice(index),
                      ],
                    }
                  : b,
              ),
            }
          : n,
      ),
    )
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

  // 条件分支内「+」添加菜单（发起人唯一不可加；支持嵌套条件分支）
  const buildBranchAddMenu = (nodeId, branchId, index) => (
    <Space>
      {Object.entries(NODE_TYPE_META)
        .filter(([type]) => type !== 'initiator')
        .map(([type, meta]) => (
          <Button
            size="small"
            key={type}
            onClick={() => insertBranchNode(nodeId, branchId, index, type)}
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
                {node.type === 'condition' ? (
                  <ConditionBlock
                    node={node}
                    onAddBranch={addBranch}
                    onRemoveBranch={removeBranch}
                    onRemoveNode={handleRemoveNode}
                    buildBranchAddMenu={buildBranchAddMenu}
                  />
                ) : (
                  <FlowNodeCard node={node} onRemove={handleRemoveNode} />
                )}
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
