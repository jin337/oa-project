import { Button } from '@arco-design/web-react'
import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from 'react'
import { PersonSelectorModal } from 'src/components/PersonSelectorModal'
import { ADDABLE_NODE_TYPES, NODE_TYPE_META } from 'src/pages/application/design/constants'
import { ApproverEditDrawer } from 'src/pages/application/examine/ApproverEditDrawer'
import { CcEditDrawer } from 'src/pages/application/examine/CcEditDrawer'
import { ConditionEditDrawer } from 'src/pages/application/examine/ConditionEditDrawer'
import { EndEventEditDrawer } from 'src/pages/application/examine/EndEventEditDrawer'
import { FlowNode } from 'src/pages/application/examine/FlowCanvas'
import {
  buildDeptDescMap,
  buildOrgItemMap,
  buildRoleItemMap,
  buildUserDeptMap,
  normalizeMembers,
} from 'src/pages/application/examine/flowModel'
import { SelectorDataContext } from 'src/pages/application/examine/selector-context'
import { useApprovalFlow } from 'src/pages/application/examine/useApprovalFlow'

/**
 * 审批流配置组件（嵌入 DesignManage）：
 * 数据由父级统一请求（app / formFields / 组织架构 / 角色 / 审核人员组），
 * 这里只负责画布编排与节点树状态。
 */
const ExamineManage = forwardRef(function ExamineManage(
  { app = null, formFields = [], orgTree = [], roleList = [], examineGroups = [] },
  ref,
) {
  // 审批流状态（节点树 + 编辑态 + 全部节点操作）
  const {
    nodes,
    editing,
    setNodes,
    insertNodeAt,
    removeNode,
    renameNode,
    addBranch,
    removeBranch,
    insertBranchNode,
    openEdit,
    closeEdit,
    saveNode,
    saveBranch,
  } = useApprovalFlow()

  // 流程主表名（table_name）：供条件编辑抽屉区分主表 / 子表字段分组
  const mainTable = app?.table_name || ''

  // 流程结束事件脚本（存为节点数组末尾的特殊节点 { type:'end', event:'...' }，画布不渲染）
  const [endEventScript, setEndEventScript] = useState('')
  const [endDrawerOpen, setEndDrawerOpen] = useState(false)

  // 审批流数据回显：app 变化时解析 approval_flow_json 还原画布
  useEffect(() => {
    if (!app) return
    const raw = app.approval_flow_json
    let parsed = null
    if (Array.isArray(raw)) parsed = raw
    else if (typeof raw === 'string' && raw) {
      try {
        parsed = JSON.parse(raw)
      } catch {
        parsed = null
      }
    }
    if (Array.isArray(parsed) && parsed.length) {
      // 抽出流程结束事件特殊节点，其余作为画布节点
      let endNode = null
      const canvasNodes = []
      for (const n of parsed) {
        if (n && n.type === 'end') {
          endNode = n
        } else {
          canvasNodes.push(n)
        }
      }
      setEndEventScript(endNode?.event || '')
      setNodes(canvasNodes)
    }
  }, [app, setNodes])

  // 选择器派生映射
  const orgItemMap = useMemo(() => buildOrgItemMap(orgTree), [orgTree])
  const roleItemMap = useMemo(() => buildRoleItemMap(roleList), [roleList])
  const userDeptMap = useMemo(() => buildUserDeptMap(orgTree), [orgTree])
  const deptDescMap = useMemo(() => buildDeptDescMap(orgTree), [orgTree])

  // 注入 Context：各弹层统一读取
  const selectorData = useMemo(
    () => ({
      orgTree,
      roleList,
      groupList: examineGroups.map((g) => ({ key: `group_${g.id}`, type: 4, label: g.name })),
      orgItemMap,
      roleItemMap,
      userDeptMap,
    }),
    [orgTree, roleList, examineGroups, orgItemMap, roleItemMap, userDeptMap],
  )

  // 对外暴露：返回当前审批流节点（供外层合并保存）；流程结束事件作为特殊节点追加在末尾
  useImperativeHandle(ref, () => ({
    getNodes: () => {
      const list = Array.isArray(nodes) ? [...nodes] : []
      if (endEventScript && endEventScript.trim()) {
        list.push({ type: 'end', event: endEventScript })
      }
      return list
    },
  }), [nodes, endEventScript])

  // 节点点击编辑：1-发起人 跳过中间弹窗直接唤起人员选择器（确认即保存 members），其余进入节点编辑
  const handleNodeEdit = (node) => {
    if (node.type === 1) {
      openEdit({ kind: 'initiator', node })
      return
    }
    openEdit({ kind: 'node', node })
  }

  const handleBranchEdit = (node, branch) => openEdit({ kind: 'branch', node, branch })

  // 节点间「+」添加菜单工厂：onPick(type) 决定插入位置与层级（发起人节点唯一，不提供添加入口）
  const buildAddMenu = (onPick) => (
    <div className="flex flex-wrap gap-1">
      {ADDABLE_NODE_TYPES.map((type) => {
        const meta = NODE_TYPE_META[type]
        const Icon = meta.icon
        return (
          <Button size="small" key={type} onClick={() => onPick(type)} icon={<Icon />}>
            {meta.label}
          </Button>
        )
      })}
    </div>
  )

  // 条件分支内「+」添加菜单（复用 buildAddMenu 工厂；发起人唯一不可加；支持嵌套条件分支）
  const buildBranchAddMenu = (nodeId, branchId, index) =>
    buildAddMenu((type) => insertBranchNode(nodeId, branchId, index, type))

  return (
    <SelectorDataContext.Provider value={selectorData}>
      {/* 流程画布 */}
      <div className="flex w-fit min-w-full flex-col items-center">
        <div className="flex flex-col items-center">
          {nodes.map((node, i) => (
            <FlowNode
              key={node.id}
              node={node}
              addMenu={buildAddMenu((type) => insertNodeAt(i + 1, type))}
              userDeptMap={userDeptMap}
              deptDescMap={deptDescMap}
              onRemove={removeNode}
              onEdit={handleNodeEdit}
              onEditBranch={handleBranchEdit}
              onAddBranch={addBranch}
              onRemoveBranch={removeBranch}
              onRemoveNode={removeNode}
              onRename={renameNode}
              buildBranchAddMenu={buildBranchAddMenu}
            />
          ))}
        </div>
        <Button size='small' onClick={() => setEndDrawerOpen(true)}>流程结束</Button>
      </div>
      {/* 节点/条件编辑弹层：发起人直接唤起人员选择器，审批人/抄送人/条件分支用 Drawer */}
      {editing?.kind === 'initiator' && (
        <PersonSelectorModal
          title="选择可发起人"
          modes={[1, 2]} // 1-组织架构 / 2-角色
          selectMode={2} // 可发起人员支持多人，保持多选
          value={normalizeMembers(editing.node.members)}
          onChange={(items) => saveNode({ ...editing.node, members: items })}
          onCancel={closeEdit}
        />
      )}
      {editing?.kind === 'node' &&
        editing.node.type === 2 && ( // 2-审批人
          <ApproverEditDrawer
            key={editing.node.id}
            node={editing.node}
            formFields={formFields}
            fieldsLoading={false}
            mainTable={mainTable}
            onCancel={closeEdit}
            onSave={saveNode}
          />
        )}
      {editing?.kind === 'node' &&
        editing.node.type === 3 && ( // 3-抄送人
          <CcEditDrawer
            key={editing.node.id}
            node={editing.node}
            onCancel={closeEdit}
            onSave={saveNode}
          />
        )}
      {editing?.kind === 'branch' && (
        <ConditionEditDrawer
          key={editing.branch.id}
          node={editing.node}
          branch={editing.branch}
          formFields={formFields}
          fieldsLoading={false}
          mainTable={mainTable}
          onCancel={closeEdit}
          onSave={saveBranch}
        />
      )}

      {/* 流程结束事件抽屉 */}
      {endDrawerOpen && (
        <EndEventEditDrawer
          event={endEventScript}
          onCancel={() => setEndDrawerOpen(false)}
          onSave={(e) => {
            setEndEventScript(e)
            setEndDrawerOpen(false)
          }}
        />
      )}
    </SelectorDataContext.Provider>
  )
})

export default ExamineManage
