import { useCallback, useReducer } from 'react'
import { Message } from '@arco-design/web-react'
import * as applicationApi from 'src/api/application'
import { createBranch, createNode, updateNodeInTree } from 'src/pages/application/examine/flowModel'

/**
 * ==================== 审批流状态管理（useReducer） ====================
 * 集中管理节点树的增 / 删 / 改、条件分支级联操作、编辑弹层显隐与保存提交，
 * 替代主组件中分散的多个 useState + useCallback，保证状态流转单一、可审计。
 */

/**
 * @typedef {Object} ApprovalFlowState
 * @property {Object[]} nodes 节点树（主链 + 嵌套条件分支）
 * @property {{ kind: 'initiator'|'node'|'branch', node: Object, branch?: Object }|null} editing 当前编辑弹层
 * @property {boolean} saving 保存中（按钮 loading）
 * @property {boolean} flowLoading 流程数据回显加载中
 */

/** 默认流程：始终包含一个「发起人」起始节点 */
const createInitialState = () => ({
  nodes: [createNode(1)], // 1-发起人
  editing: null,
  saving: false,
  flowLoading: false,
})

/**
 * 节点树 reducer：所有节点操作均为不可变更新，条件分支通过 updateNodeInTree 递归下探。
 * @param {ApprovalFlowState} state
 * @param {{ type: string, [key: string]: any }} action
 * @returns {ApprovalFlowState}
 */
function approvalFlowReducer(state, action) {
  switch (action.type) {
    case 'SET_NODES': // 回显 / 初始化节点树
      return { ...state, nodes: action.nodes }
    case 'SET_FLOW_LOADING':
      return { ...state, flowLoading: action.loading }
    case 'SET_SAVING':
      return { ...state, saving: action.saving }

    // ---- 节点增删改 ----
    case 'INSERT_AT': {
      // 主链指定位置插入节点（节点之间 / 末尾）
      const { index, nodeType } = action
      return {
        ...state,
        nodes: [
          ...state.nodes.slice(0, index),
          createNode(nodeType),
          ...state.nodes.slice(index),
        ],
      }
    }
    case 'REMOVE_NODE': {
      // 删除节点：branchId + childId 时删除条件分支下节点（任意嵌套层级），否则删除主链节点
      const { nodeId, branchId, childId } = action
      if (branchId && childId) {
        return {
          ...state,
          nodes: updateNodeInTree(state.nodes, nodeId, (n) => ({
            ...n,
            branches: n.branches.map((b) =>
              b.id === branchId ? { ...b, children: b.children.filter((c) => c.id !== childId) } : b,
            ),
          })),
        }
      }
      return { ...state, nodes: state.nodes.filter((n) => n.id !== nodeId) }
    }
    case 'SAVE_NODE': {
      // 递归定位任意层级节点并整体替换
      const { node } = action
      return { ...state, nodes: updateNodeInTree(state.nodes, node.id, () => node), editing: null }
    }
    case 'RENAME_NODE': {
      // 就地重命名节点标题（审批人 / 抄送人卡片），支持任意层级
      const { nodeId, label } = action
      return { ...state, nodes: updateNodeInTree(state.nodes, nodeId, (n) => ({ ...n, label })) }
    }

    // ---- 条件分支操作 ----
    case 'ADD_BRANCH': {
      // 条件节点添加条件（分支）（任意嵌套层级）
      const { nodeId } = action
      return {
        ...state,
        nodes: updateNodeInTree(state.nodes, nodeId, (n) => ({
          ...n,
          branches: [...n.branches, createBranch(`条件${n.branches.length}`)],
        })),
      }
    }
    case 'REMOVE_BRANCH': {
      // 删除条件（分支）。级联删除：当删除后仅剩「默认」分支时，整个条件节点一并移除（任意嵌套层级）
      const { nodeId, branchId } = action
      const visit = (list) => {
        const result = []
        list.forEach((node) => {
          if (node.id === nodeId) {
            const branches = node.branches.filter((b) => b.id !== branchId)
            if (branches.length === 1 && branches[0].isDefault) return // 级联删除整个条件节点
            result.push({ ...node, branches })
            return
          }
          if (node.type === 4) {
            // 4-条件分支：递归处理其分支 children
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
      return { ...state, nodes: visit(state.nodes) }
    }
    case 'INSERT_BRANCH_NODE': {
      // 条件分支内指定位置插入节点（任意嵌套层级）
      const { nodeId, branchId, index, nodeType } = action
      return {
        ...state,
        nodes: updateNodeInTree(state.nodes, nodeId, (n) => ({
          ...n,
          branches: n.branches.map((b) =>
            b.id === branchId
              ? {
                  ...b,
                  children: [
                    ...b.children.slice(0, index),
                    createNode(nodeType),
                    ...b.children.slice(index),
                  ],
                }
              : b,
          ),
        })),
      }
    }
    case 'SAVE_BRANCH': {
      // 保存条件分支编辑：更新条件节点关系 + 指定分支的条件表达式
      const { node, branch, payload } = action
      return {
        ...state,
        nodes: updateNodeInTree(state.nodes, node.id, (n) => ({
          ...n,
          relation: payload.relation,
          branches: n.branches.map((b) => (b.id === branch.id ? { ...b, rules: payload.rules } : b)),
        })),
        editing: null,
      }
    }

    // ---- 编辑弹层 ----
    case 'OPEN_EDIT':
      return { ...state, editing: action.editing }
    case 'CLOSE_EDIT':
      return { ...state, editing: null }

    default:
      return state
  }
}

/**
 * 审批流状态管理 Hook：向画布提供节点树、编辑态、加载态及全部节点操作回调。
 * @returns {{
 *   nodes: Object[],
 *   editing: ApprovalFlowState['editing'],
 *   saving: boolean,
 *   flowLoading: boolean,
 *   setNodes: (nodes: Object[]) => void,
 *   setFlowLoading: (loading: boolean) => void,
 *   insertNodeAt: (index: number, type: number) => void,
 *   removeNode: (nodeId: string, branchId?: string, childId?: string) => void,
 *   renameNode: (nodeId: string, label: string) => void,
 *   addBranch: (nodeId: string) => void,
 *   removeBranch: (nodeId: string, branchId: string) => void,
 *   insertBranchNode: (nodeId: string, branchId: string, index: number, type: number) => void,
 *   openEdit: (editing: ApprovalFlowState['editing']) => void,
 *   closeEdit: () => void,
 *   saveNode: (node: Object) => void,
 *   saveBranch: (node: Object, branch: Object, payload: Object) => void,
 *   saveFlow: (id: string|number, nodes: Object[]) => Promise<void>,
 * }}
 */
export function useApprovalFlow() {
  const [state, dispatch] = useReducer(approvalFlowReducer, undefined, createInitialState)

  // ---- 回显 / 加载态 ----
  const setNodes = useCallback((nodes) => dispatch({ type: 'SET_NODES', nodes }), [])
  const setFlowLoading = useCallback(
    (loading) => dispatch({ type: 'SET_FLOW_LOADING', loading }),
    [],
  )

  // ---- 节点增删改 ----
  const insertNodeAt = useCallback(
    // 注意：action 中节点类型使用 nodeType 键，避免与 action.type（reducer 分支标识）同名覆盖
    (index, type) => dispatch({ type: 'INSERT_AT', index, nodeType: type }),
    [],
  )
  const removeNode = useCallback((nodeId, branchId, childId) => {
    dispatch({ type: 'REMOVE_NODE', nodeId, branchId, childId })
  }, [])
  const renameNode = useCallback((nodeId, label) => dispatch({ type: 'RENAME_NODE', nodeId, label }), [])
  const saveNode = useCallback((node) => {
    dispatch({ type: 'SAVE_NODE', node })
  }, [])

  // ---- 条件分支操作 ----
  const addBranch = useCallback((nodeId) => dispatch({ type: 'ADD_BRANCH', nodeId }), [])
  const removeBranch = useCallback(
    (nodeId, branchId) => dispatch({ type: 'REMOVE_BRANCH', nodeId, branchId }),
    [],
  )
  const insertBranchNode = useCallback(
    // 同样：节点类型使用 nodeType 键，避免覆盖 action.type 分支标识
    (nodeId, branchId, index, type) =>
      dispatch({ type: 'INSERT_BRANCH_NODE', nodeId, branchId, index, nodeType: type }),
    [],
  )
  const saveBranch = useCallback((node, branch, payload) => {
    dispatch({ type: 'SAVE_BRANCH', node, branch, payload })
  }, [])

  // ---- 编辑弹层 ----
  const openEdit = useCallback((editing) => dispatch({ type: 'OPEN_EDIT', editing }), [])
  const closeEdit = useCallback(() => dispatch({ type: 'CLOSE_EDIT' }), [])

  // ---- 保存审批流（写回应用 approval_flow_json 字段） ----
  const saveFlow = useCallback(async (id, nodes) => {
    if (!id) return
    dispatch({ type: 'SET_SAVING', saving: true })
    try {
      await applicationApi.updateApplication(id, { approval_flow_json: nodes })
      Message.success('保存成功')
    } catch {
      // 错误已在请求层统一提示
    } finally {
      dispatch({ type: 'SET_SAVING', saving: false })
    }
  }, [])

  return {
    nodes: state.nodes,
    editing: state.editing,
    saving: state.saving,
    flowLoading: state.flowLoading,
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
  }
}
