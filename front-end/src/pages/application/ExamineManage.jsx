import { Button, Card, Message, Popconfirm, Popover, Space, Tag } from '@arco-design/web-react'
import {
  IconBranch,
  IconClose,
  IconPlus,
  IconSend,
  IconStamp,
  IconUser,
} from '@arco-design/web-react/icon'
import { useCallback, useEffect, useState } from 'react'
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
    <div className="relative w-55 rounded border border-(--color-neutral-3) bg-white shadow">
      <div
        className={`flex items-center justify-between border-b border-(--color-neutral-3) px-2 py-1 text-white ${meta.bg}`}
      >
        <div className="flex items-center gap-2 font-medium">
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
        title={<div className="mb-2 font-bold">添加流程节点</div>}
        content={menu}
        position="bl"
      >
        <Button size="mini" shape="circle" type="primary" icon={<IconPlus />} />
      </Popover>
      <div className="h-4 w-px border-l border-gray-300" />
    </div>
  )
}

/** 分支卡：以 FlowNodeCard 同款卡片样式渲染单个条件分支（条件X + 摘要 + 非默认可删除） */
function BranchCard({ branch, onRemove }) {
  return (
    <div className="relative mt-8 w-55 rounded border border-(--color-neutral-3) bg-white shadow">
      <div className="flex items-center justify-between border-b border-(--color-neutral-3) bg-purple-500 px-2 py-1 text-white">
        <div className="flex items-center gap-2 font-medium">
          <IconBranch />
          {branch.isDefault ? '默认条件' : branch.label || '未命名'}
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
      <div className="px-3 py-2 text-gray-400 text-xs">
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
            <div className="absolute z-0 h-full w-0 border-l border-gray-300" />
            <BranchCard
              branch={b}
              onRemove={b.isDefault ? undefined : () => onRemoveBranch(node.id, b.id)}
            />
            <NodeConnector menu={buildBranchAddMenu(node.id, b.id, 0)} />
            <div
              className={`absolute bottom-0 ${i === 0 ? 'right-0 left-1/2 w-1/2' : i === node.branches.length - 1 ? 'right-1/2 left-0 w-1/2' : 'w-full'} h-0 border-t border-gray-300`}
            />
            {b.children?.map((child, ci) => (
              <FlowNode
                key={child.id}
                node={child}
                addMenu={buildBranchAddMenu(node.id, b.id, ci + 1)}
                onRemove={(cid) => onRemoveNode(node.id, b.id, cid)}
                onAddBranch={onAddBranch}
                onRemoveBranch={onRemoveBranch}
                onRemoveNode={onRemoveNode}
                buildBranchAddMenu={buildBranchAddMenu}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * 流程节点单元：内容卡片（FlowNodeCard / ConditionBlock）与下方连接器（NodeConnector）内聚。
 * 每个节点下方自带连接线 + 加号，主链与条件分支列统一复用，无需外部 Fragment 拼接。
 */
function FlowNode({
  node,
  addMenu,
  onRemove,
  onAddBranch,
  onRemoveBranch,
  onRemoveNode,
  buildBranchAddMenu,
}) {
  return (
    <div className="flex flex-col items-center">
      {node.type === 'condition' ? (
        <ConditionBlock
          node={node}
          onAddBranch={onAddBranch}
          onRemoveBranch={onRemoveBranch}
          onRemoveNode={onRemoveNode}
          buildBranchAddMenu={buildBranchAddMenu}
        />
      ) : (
        <FlowNodeCard node={node} onRemove={onRemove} />
      )}
      <NodeConnector menu={addMenu} />
    </div>
  )
}

/**
 * 递归遍历节点树：在任意层级（含条件分支内嵌套的条件节点）查找 nodeId，
 * 命中则用 updater 更新该节点；条件节点的分支 children 会继续递归下探。
 */
function updateNodeInTree(list, nodeId, updater) {
  return list.map((node) => {
    if (node.id === nodeId) return updater(node)
    if (node.type === 'condition') {
      return {
        ...node,
        branches: node.branches.map((b) => ({
          ...b,
          children: updateNodeInTree(b.children, nodeId, updater),
        })),
      }
    }
    return node
  })
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
      // 删除条件分支下的节点（任意嵌套层级）
      setNodes((prev) =>
        updateNodeInTree(prev, nodeId, (n) => ({
          ...n,
          branches: n.branches.map((b) =>
            b.id === branchId ? { ...b, children: b.children.filter((c) => c.id !== childId) } : b,
          ),
        })),
      )
    } else {
      // 删除主链节点
      setNodes((prev) => prev.filter((n) => n.id !== nodeId))
    }
    Message.success('节点已删除')
  }, [])

  // 条件节点：添加条件（分支）（任意嵌套层级）
  const addBranch = useCallback((nodeId) => {
    setNodes((prev) =>
      updateNodeInTree(prev, nodeId, (n) => ({
        ...n,
        branches: [...n.branches, createBranch(`条件${n.branches.length}`)],
      })),
    )
  }, [])

  // 条件节点：删除条件（分支）。
  // 级联删除：条件分支不能被直接一键删除，当删除后仅剩「默认」分支时，整个条件节点一并移除（任意嵌套层级）
  const removeBranch = useCallback((nodeId, branchId) => {
    setNodes((prev) => {
      const visit = (list) => {
        const result = []
        list.forEach((node) => {
          if (node.id === nodeId) {
            const branches = node.branches.filter((b) => b.id !== branchId)
            if (branches.length === 1 && branches[0].isDefault) return // 级联删除整个条件节点
            result.push({ ...node, branches })
            return
          }
          if (node.type === 'condition') {
            result.push({
              ...node,
              branches: node.branches.map((b) => ({ ...b, children: visit(b.children) })),
            })
            return
          }
          result.push(node)
        })
        return result
      }
      return visit(prev)
    })
  }, [])

  // 条件分支内：在指定位置插入节点（任意嵌套层级）
  const insertBranchNode = useCallback((nodeId, branchId, index, type) => {
    setNodes((prev) =>
      updateNodeInTree(prev, nodeId, (n) => ({
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
      })),
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
              <FlowNode
                key={node.id}
                node={node}
                addMenu={buildAddMenu(i + 1)}
                onRemove={handleRemoveNode}
                onAddBranch={addBranch}
                onRemoveBranch={removeBranch}
                onRemoveNode={handleRemoveNode}
                buildBranchAddMenu={buildBranchAddMenu}
              />
            ))}
          </div>
        </div>
        <div className="text-gray-400">流程结束</div>
      </div>
    </Card>
  )
}
