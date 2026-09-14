import { memo } from 'react'
import { Button, Popover } from '@arco-design/web-react'
import { IconBranch, IconClose, IconPlus } from '@arco-design/web-react/icon'
import { FlowNodeCard } from 'src/pages/application/examine/FlowNodeCard'

/**
 * ==================== 流程画布递归渲染单元 ====================
 * FlowNode 与 ConditionBlock 相互递归引用（条件分支内可嵌套条件节点），
 * 为消除模块循环依赖，将二者与分支卡 / 连接器放在同一文件内聚导出。
 */

/** 分支列顶部/底部横向连线类名：首列右半、末列左半、中间整条 */
export const branchLineClass = (i, total, top) =>
  `absolute ${top ? 'top-0' : 'bottom-0'} ${
    i === 0 ? 'right-0 left-1/2 w-1/2' : i === total - 1 ? 'right-1/2 left-0 w-1/2' : 'w-full'
  } h-0 border-t border-gray-300`

/**
 * 分支卡：以 FlowNodeCard 同款卡片样式渲染单个条件分支（条件X + 摘要 + 非默认可删除），点击卡片编辑条件。
 * 纯展示组件，memo 包裹。
 */
export const BranchCard = memo(function BranchCard({ branch, onRemove, onEdit }) {
  return (
    <div
      className="relative mt-8 w-55 cursor-pointer rounded border border-(--color-neutral-3) bg-white shadow"
      onClick={() => onEdit?.()}
    >
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
      <div className="px-3 py-2 text-xs text-gray-400">
        {branch.isDefault
          ? '不满足其他条件，进入此分支'
          : `已设置 (${branch.rules?.length || 0}) 个条件`}
      </div>
    </div>
  )
})

/**
 * 连接线与操作按钮：节点间竖虚线连接 + 「+」插入按钮（hover/点击弹出类型菜单）。
 * 纯展示组件，memo 包裹。
 */
export const NodeConnector = memo(function NodeConnector({ menu }) {
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
})

/**
 * 条件分支节点：纯布局容器（无卡片外观），负责承载各条件分支列。
 * 每个分支以 BranchCard 渲染，卡下接连接线 + 加号，再挂节点链（支持嵌套条件递归）。
 * 条件分支不能被直接删除：仅当删除某非默认分支后只剩「默认」分支时，级联删除整个条件节点。
 */
export const ConditionBlock = memo(function ConditionBlock({
  node,
  userDeptMap = {},
  deptDescMap = {},
  onEdit,
  onEditBranch,
  onAddBranch,
  onRemoveBranch,
  onRemoveNode,
  onRename,
  buildBranchAddMenu,
}) {
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
            <div className={branchLineClass(i, node.branches.length, true)} />
            <div className="absolute z-0 h-full w-0 border-l border-gray-300" />
            <BranchCard
              branch={b}
              onRemove={b.isDefault ? undefined : () => onRemoveBranch(node.id, b.id)}
              onEdit={() => onEditBranch?.(node, b)}
            />
            <NodeConnector menu={buildBranchAddMenu(node.id, b.id, 0)} />
            <div className={branchLineClass(i, node.branches.length, false)} />
            {b.children?.map((child, ci) => (
              <FlowNode
                key={child.id}
                node={child}
                addMenu={buildBranchAddMenu(node.id, b.id, ci + 1)}
                userDeptMap={userDeptMap}
                deptDescMap={deptDescMap}
                onRemove={(cid) => onRemoveNode(node.id, b.id, cid)}
                onEdit={onEdit}
                onEditBranch={onEditBranch}
                onAddBranch={onAddBranch}
                onRemoveBranch={onRemoveBranch}
                onRemoveNode={onRemoveNode}
                onRename={onRename}
                buildBranchAddMenu={buildBranchAddMenu}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
})

/**
 * 流程节点单元：内容卡片（FlowNodeCard / ConditionBlock）与下方连接器（NodeConnector）内聚。
 * 每个节点下方自带连接线 + 加号，主链与条件分支列统一复用，无需外部 Fragment 拼接。
 */
export const FlowNode = memo(function FlowNode({
  node,
  addMenu,
  userDeptMap = {},
  deptDescMap = {},
  onRemove,
  onEdit,
  onEditBranch,
  onAddBranch,
  onRemoveBranch,
  onRemoveNode,
  onRename,
  buildBranchAddMenu,
}) {
  return (
    <div className="flex flex-col items-center">
      {node.type === 4 ? ( // 4-条件分支：渲染 ConditionBlock 布局容器
        <ConditionBlock
          node={node}
          userDeptMap={userDeptMap}
          deptDescMap={deptDescMap}
          onEdit={onEdit}
          onEditBranch={onEditBranch}
          onAddBranch={onAddBranch}
          onRemoveBranch={onRemoveBranch}
          onRemoveNode={onRemoveNode}
          onRename={onRename}
          buildBranchAddMenu={buildBranchAddMenu}
        />
      ) : (
        <FlowNodeCard
          node={node}
          userDeptMap={userDeptMap}
          deptDescMap={deptDescMap}
          onRemove={onRemove}
          onEdit={onEdit}
          onRename={onRename}
        />
      )}
      <NodeConnector menu={addMenu} />
    </div>
  )
})
