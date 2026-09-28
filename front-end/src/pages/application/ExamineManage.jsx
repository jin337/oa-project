import { Button, Card, Spin } from '@arco-design/web-react'
import { useEffect, useMemo, useState } from 'react'
import { useLocation, useParams } from 'react-router-dom'
import * as applicationApi from 'src/api/application'
import * as deptApi from 'src/api/dept'
import { listExamineGroups } from 'src/api/examineGroup'
import * as roleApi from 'src/api/role'
import { fetchAll } from 'src/api/fetchAll'
import { ADDABLE_NODE_TYPES, MODULE_LABEL, NODE_TYPE_META } from 'src/pages/application/constants'
import { ApproverEditDrawer } from 'src/pages/application/examine/ApproverEditDrawer'
import { CcEditDrawer } from 'src/pages/application/examine/CcEditDrawer'
import { ConditionEditDrawer } from 'src/pages/application/examine/ConditionEditDrawer'
import { FlowNode } from 'src/pages/application/examine/FlowCanvas'
import {
  buildDeptDescMap,
  buildOrgItemMap,
  buildRoleItemMap,
  buildUserDeptMap,
  normalizeMembers,
  transformDeptTree,
  transformRoleList,
} from 'src/pages/application/examine/flowModel'
import { PersonSelectorModal } from 'src/pages/application/examine/PersonSelectorModal'
import { SelectorDataContext } from 'src/pages/application/examine/selector-context'
import { useApprovalFlow } from 'src/pages/application/examine/useApprovalFlow'
import { useTabs } from 'src/store/tab-context'

/**
 * 审批流程配置管理页（/examine/:id？）：流程画布设计器。
 * 职责：数据加载（表单元素 / 组织架构 / 角色 / 审批流回显）与编排，
 * 节点树的增删改状态统一交由 useApprovalFlow 管理，画布/弹层均为独立子组件。
 */
export default function ExamineManage() {
  const location = useLocation()
  const { id } = useParams() // 应用 id：请求表单元素 / 审批流配置
  const { addTab } = useTabs()

  // 审批流状态（节点树 + 编辑态 + 保存/加载态 + 全部节点操作）
  const {
    nodes,
    editing,
    saving,
    flowLoading,
    setNodes,
    setFlowLoading,
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
    saveFlow,
  } = useApprovalFlow()

  // 挂载：确保页签存在
  useEffect(() => {
    addTab({ path: location.pathname, title: MODULE_LABEL })
  }, [location.pathname, addTab])

  // 应用表单元素列表（条件表达式字段来源 / 审批人表单字段权限），挂载即请求一次，供各弹层共享
  const [formFields, setFormFields] = useState([])
  const [fieldsLoading, setFieldsLoading] = useState(false)
  // 应用主表名（table_name）：供条件编辑抽屉区分主表 / 子表字段分组
  const [mainTable, setMainTable] = useState('')

  useEffect(() => {
    if (!id) return
    let cancelled = false
    setFieldsLoading(true)
    fetchAll((p) => applicationApi.listApplicationElements(id, p))
      .then((res) => {
        if (!cancelled) setFormFields(res.data.list || [])
      })
      .catch(() => {
        // 错误已在请求层提示
      })
      .finally(() => {
        if (!cancelled) setFieldsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [id])

  // 对象选择器数据源：组织架构树（部门+员工）/ 角色分页列表 / 审核人员组列表，挂载即请求一次
  const [orgTree, setOrgTree] = useState([])
  const [roleList, setRoleList] = useState([])
  const [examineGroups, setExamineGroups] = useState([])
  const [selectorLoading, setSelectorLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    setSelectorLoading(true)
    Promise.all([deptApi.getDeptUsersTree(), fetchAll(roleApi.listRoles), fetchAll(listExamineGroups)])
      .then(([deptRes, roleRes, groupRes]) => {
        if (cancelled) return
        setOrgTree(transformDeptTree(deptRes.data?.list || deptRes.data || []))
        setRoleList(transformRoleList(roleRes.data?.list || roleRes.data || []))
        const groupList = groupRes.data?.list || groupRes.data || []
        setExamineGroups(Array.isArray(groupList) ? groupList : [])
      })
      .catch(() => {
        // 错误已在请求层提示
      })
      .finally(() => {
        if (!cancelled) setSelectorLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // 审批流数据回显：挂载 / id 变化时获取应用配置，解析 approval_flow_json 还原画布；
  // 空、不存在或解析失败时降级保持默认「发起人」节点
  useEffect(() => {
    if (!id) return
    let cancelled = false
    setFlowLoading(true)
    applicationApi
      .getApplication(id)
      .then((res) => {
        if (cancelled) return
        // 记录应用主表名（供条件字段分组区分主表 / 子表）
        setMainTable(res.data?.table_name || '')
        const raw = res.data?.approval_flow_json
        let parsed = null
        if (Array.isArray(raw)) parsed = raw
        else if (typeof raw === 'string' && raw) {
          try {
            parsed = JSON.parse(raw)
          } catch {
            parsed = null
          }
        }
        // 有效节点数组才还原；空 / 无效保持默认
        if (Array.isArray(parsed) && parsed.length) setNodes(parsed)
      })
      .catch(() => {
        // 错误已在请求层提示，画布保持默认发起人节点
      })
      .finally(() => {
        if (!cancelled) setFlowLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [id, setFlowLoading, setNodes])

  // 选择器派生映射（随动态数据更新）
  const orgItemMap = useMemo(() => buildOrgItemMap(orgTree), [orgTree])
  const roleItemMap = useMemo(() => buildRoleItemMap(roleList), [roleList])
  const userDeptMap = useMemo(() => buildUserDeptMap(orgTree), [orgTree])
  // 部门 → 后代节点映射（发起人卡片按部门折叠展示用）
  const deptDescMap = useMemo(() => buildDeptDescMap(orgTree), [orgTree])

  // 注入 Context：各弹层统一读取，避免多层 props 透传
  const selectorData = useMemo(
    () => ({
      orgTree,
      roleList,
      groupList: examineGroups.map((g) => ({ key: `group_${g.id}`, type: 4, label: g.name })),
      orgItemMap,
      roleItemMap,
      userDeptMap,
      loading: selectorLoading,
    }),
    [orgTree, roleList, examineGroups, orgItemMap, roleItemMap, userDeptMap, selectorLoading],
  )

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
      <Card
        title="审批流程配置"
        extra={
          <Button type="primary" loading={saving} onClick={() => saveFlow(id, nodes)}>
            保存
          </Button>
        }
      >
        {/* 流程画布：加载期间 Spin 遮罩，底部固定「流程结束」标识 */}
        <Spin loading={flowLoading} className="w-full">
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
            <div className="text-gray-400">流程结束</div>
          </div>
        </Spin>
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
        {editing?.kind === 'node' && editing.node.type === 2 && ( // 2-审批人
          <ApproverEditDrawer
            key={editing.node.id}
            node={editing.node}
            formFields={formFields}
            fieldsLoading={fieldsLoading}
            mainTable={mainTable}
            onCancel={closeEdit}
            onSave={saveNode}
          />
        )}
        {editing?.kind === 'node' && editing.node.type === 3 && ( // 3-抄送人
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
            fieldsLoading={fieldsLoading}
            mainTable={mainTable}
            onCancel={closeEdit}
            onSave={saveBranch}
          />
        )}
      </Card>
    </SelectorDataContext.Provider>
  )
}
