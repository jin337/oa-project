import { NODE_TYPE_META } from 'src/pages/application/constants'

/**
 * ==================== 审批流数据模型 ====================
 * 节点树结构：主链节点数组（ApprovalNode[]），条件分支节点（type=4）内含 branches（ApprovalBranch[]），
 * 每个分支可继续挂 children 节点链（支持任意层级嵌套）。
 */

/**
 * @typedef {Object} ApprovalMember 审批成员条目
 * @property {1|2|3} type 成员类型（数字枚举：1-人员 / 2-部门 / 3-角色）
 * @property {string} key 唯一标识（如 user_1 / dept_2 / role_3）
 * @property {string} label 展示名称
 */

/**
 * @typedef {Object} ApprovalRule 条件规则
 * @property {string} field 表单字段标识（field_key）
 * @property {number} operator 逻辑运算符（1-大于 / 2-小于 / 3-等于 / 4-不等于 / 5-包含 / 6-不包含）
 * @property {string} value 条件值
 */

/**
 * @typedef {Object} ApprovalBranch 条件分支
 * @property {string} id 分支 id
 * @property {string} label 分支名称
 * @property {boolean} isDefault 是否默认分支（默认分支不可删除）
 * @property {ApprovalRule[]} rules 条件规则列表
 * @property {ApprovalNode[]} children 分支下的流程节点链
 */

/**
 * @typedef {Object} ApprovalFieldPerm 表单字段权限
 * @property {string} field 表单字段标识
 * @property {number} perm 权限（1-隐藏 / 2-可编辑）
 */

/**
 * @typedef {Object} ApprovalNode 审批节点
 * @property {string} id 节点 id
 * @property {1|2|3|4} type 节点类型（1-发起人 / 2-审批人 / 3-抄送人 / 4-条件分支）
 * @property {string} label 节点名称
 * @property {ApprovalMember[]} [members] 成员（发起人 / 审批人 / 抄送人）
 * @property {number} [approverType] 审批对象（1-指定人员 / 2-指定角色 / 3-发起人自选）
 * @property {number} [selfSelect] 发起人自选类型（1-单选 / 2-多选）
 * @property {number} [strategy] 审批方式（1-依次审批 / 2-会签 / 3-或签）
 * @property {number} [emptyHandler] 审批人为空处理（1-自动通过 / 2-自动拒绝 / 3-转交流程管理员 / 4-指定人员）
 * @property {ApprovalMember[]} [emptyMembers] 为空时指定的兜底人员
 * @property {number[]} [permissions] 审批人操作权限（1-拒绝 / 2-转交 / 3-加签）
 * @property {ApprovalFieldPerm[]} [fieldPerms] 表单字段权限
 * @property {number} [ccTiming] 抄送时机（1-审批通过后抄送 / 2-流程结束时统一抄送）
 * @property {number} [relation] 条件关系（1-且(AND) / 2-或(OR)）
 * @property {ApprovalBranch[]} [branches] 条件分支列表（仅 type=4）
 */

/** 生成唯一 id（前缀 + 时间戳 + 随机串） */
export const genId = (prefix) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

/**
 * 创建条件分支
 * @param {string} label 分支名称
 * @param {boolean} [isDefault] 是否默认分支
 * @returns {ApprovalBranch}
 */
export const createBranch = (label, isDefault = false) => ({
  id: genId('b'),
  label,
  isDefault,
  rules: [],
  children: [], // 分支下的流程节点链
})

/**
 * 按类型创建节点
 * @param {1|2|3|4} type 节点类型（1-发起人 / 2-审批人 / 3-抄送人 / 4-条件分支）
 * @returns {ApprovalNode}
 */
export const createNode = (type) => {
  const base = { id: genId('n'), type, label: NODE_TYPE_META[type].label }
  if (type === 1) return { ...base, members: [] } // 1-发起人
  if (type === 3) return { ...base, members: [], ccTiming: 2 } // 3-抄送人；ccTiming 2-流程结束时统一抄送
  if (type === 2)
    return {
      ...base,
      approverType: 1, // 审批对象：1-指定人员 / 2-指定角色 / 3-发起人自选
      members: [],
      selfSelect: 1, // 发起人自选类型：1-单选 / 2-多选
      strategy: 1, // 审批方式：1-依次审批 / 2-会签 / 3-或签
      emptyHandler: 1, // 审批人为空处理：1-自动通过 / 2-自动拒绝 / 3-转交流程管理员 / 4-指定人员
      emptyMembers: [],
      permissions: [1, 2, 3], // 审批人操作权限：1-拒绝 / 2-转交 / 3-加签
      fieldPerms: [], // 表单字段权限 [{ field, perm: 1-隐藏 | 2-可编辑 }]
    }
  if (type === 4)
    return {
      ...base,
      relation: 1, // 条件关系：1-且(AND) / 2-或(OR)
      branches: [createBranch('默认', true), createBranch('条件1')],
    }
  return base
}

/**
 * 兼容旧数据：members 可能为字符串数组，统一转为 { type, label } 结构
 * @param {Array<string|ApprovalMember>} members
 * @returns {ApprovalMember[]}
 */
export const normalizeMembers = (members) =>
  // 旧字符串数组成员兜底：默认按 1-人员 处理
  (members || []).map((m) => (typeof m === 'string' ? { type: 1, label: m } : m))

// ==================== 对象选择器数据转换（组织架构 / 角色接口） ====================

/**
 * 接口部门树 → 选择器树格式（children 中同时包含子部门与用户节点）
 * 接口节点：{ type: 'dept'|'user', id, name, children?, ... }（type 为接口字符串契约，仅此处判断用）
 */
export const transformDeptTree = (data = []) =>
  data.map((d) => ({
    key: `${d.type}_${d.id}`,
    title: d.name,
    isDept: d.type === 'dept',
    children: d.children?.length ? transformDeptTree(d.children) : undefined,
  }))

/**
 * 树节点 → key 映射：{ key: { key, type, label } }，type 为数字枚举（1-人员 / 2-部门）
 */
export const buildOrgItemMap = (tree) => {
  const map = {}
  const walk = (nodes) => {
    nodes.forEach((n) => {
      map[n.key] = { key: n.key, type: n.isDept ? 2 : 1, label: n.title } // 2-部门 / 1-人员
      if (n.children?.length) walk(n.children)
    })
  }
  walk(tree)
  return map
}

/**
 * 构建「部门 key → 后代节点 key 集合」映射（含子部门与人员 key，不含自身）
 * 用于发起人卡片折叠展示：勾选部门后，其下所有子级（子部门/人员）不再重复显示。
 * @param {Array} tree 选择器树（transformDeptTree 输出）
 * @returns {Object<string, Set<string>>}
 */
export const buildDeptDescMap = (tree) => {
  const map = {}
  // 收集某节点数组的全部后代 key（含节点自身）
  const collectKeys = (nodes) => {
    const keys = new Set()
    nodes.forEach((n) => {
      keys.add(n.key)
      if (n.children?.length) collectKeys(n.children).forEach((k) => keys.add(k))
    })
    return keys
  }
  const walk = (nodes) => {
    nodes.forEach((n) => {
      if (n.isDept && n.children?.length) {
        map[n.key] = collectKeys(n.children)
        walk(n.children)
      }
    })
  }
  walk(tree)
  return map
}

/**
 * 发起人卡片折叠展示：已勾选部门（type=2）后，该部门下所有子级成员（子部门 / 人员）不再展示，
 * 只保留未被更大部门覆盖的顶级部门 + 不属于任何已选部门的人员。
 * @param {ApprovalMember[]} members 原始成员数组
 * @param {Object<string, Set<string>>} deptDescMap 部门 key → 后代 key 集合
 * @returns {ApprovalMember[]} 折叠后的成员数组
 */
export const foldDeptMembers = (members = [], deptDescMap = {}) => {
  const deptKeys = members.filter((m) => m.type === 2).map((m) => m.key) // 2-部门
  if (!deptKeys.length) return members
  // 已被某已选部门覆盖（属于其后代）的 key 集合
  const covered = new Set()
  deptKeys.forEach((k) => deptDescMap[k]?.forEach((dk) => covered.add(dk)))
  // 多个已选部门存在层级包含关系时，仅保留最顶层部门
  const keepDepts = deptKeys.filter((k) => !covered.has(k))
  return members.filter((m) => {
    if (m.type === 2) return keepDepts.includes(m.key)
    return !covered.has(m.key)
  })
}

/**
 * 人员 key → 所属部门标题（右侧展示「部门：姓名」用，人员归到最近祖先部门）
 */
export const buildUserDeptMap = (tree) => {
  const map = {}
  const walk = (nodes, deptTitle) => {
    nodes.forEach((n) => {
      if (n.isDept) {
        walk(n.children || [], n.title)
      } else {
        map[n.key] = deptTitle
      }
    })
  }
  walk(tree)
  return map
}

/**
 * 角色分页列表（GET /roles）→ 选择器数据格式：扁平角色数组（钉钉模式：勾选「角色」本身，
 * 无需角色下属用户树，成员由角色带出）。角色节点 { key: 'role_{id}', title: name, isRole: true }
 */
export const transformRoleList = (data = []) =>
  data.map((r) => ({ key: `role_${r.id}`, title: r.name, isRole: true }))

/**
 * 角色列表 → key 映射：{ key: { key, type, label } }，type 为数字枚举（3-角色）
 */
export const buildRoleItemMap = (roleList) =>
  roleList.reduce((map, r) => {
    map[r.key] = { key: r.key, type: 3, label: r.title } // 3-角色
    return map
  }, {})

// ==================== 节点树递归工具 ====================

/**
 * 递归遍历节点树：在任意层级（含条件分支内嵌套的条件节点）查找 nodeId，
 * 命中则用 updater 更新该节点；条件节点的分支 children 会继续递归下探。
 * @param {ApprovalNode[]} list 节点数组
 * @param {string} nodeId 目标节点 id
 * @param {(node: ApprovalNode) => ApprovalNode} updater 更新函数
 * @returns {ApprovalNode[]} 新节点数组（不可变更新）
 */
export function updateNodeInTree(list, nodeId, updater) {
  return list.map((node) => {
    if (node.id === nodeId) return updater(node)
    if (node.type === 4) {
      // 4-条件分支：递归处理其分支 children
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
