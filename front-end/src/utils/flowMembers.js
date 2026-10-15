/**
 * 审批流成员引用解析（展示用）
 *
 * approval_flow_json 的 members[].key 是「组织维度引用」（user_x / dept_x / role_x / group_x），
 * label 是组名 / 角色名 / 人名。展示层若直接渲染 label，审批节点就只会显示
 * 「1个审核组审批」「财务审核组」「普通员工」这类组织口径，看不到实际审批人，
 * 也无法反映真实的审批人数（一个审核人员组或角色可能对应多人）。
 *
 * 本模块把成员引用展开为「具体的人」，展开口径与后端创建审批任务时完全一致
 * （back-end/internal/service/approval_member.go 的 resolveMembersUserIDs）：
 *   user  → 本人
 *   dept  → 该部门下的用户（oa_sys_user_dept，不含子部门）
 *   role  → 该角色下的用户（oa_sys_user_role）
 *   group → 审核人员组配置的 approver_ids
 * 多成员、多引用之间按出现顺序去重。
 *
 * 数据源复用既有接口（三者都已带姓名，无需新增后端接口）：
 *   GET /depts/users   部门树（含部门下用户）
 *   GET /roles/users   角色-用户树
 *   GET /examine-groups 审核人员组（approvers 已由后端翻译为 {id, name, username}）
 */

import * as deptApi from 'src/api/dept'
import * as roleApi from 'src/api/role'
import * as examineGroupApi from 'src/api/examineGroup'
import { fetchAll } from 'src/api/fetchAll'

/** 成员类型（与后端 flowMember.Type 一致） */
export const MEMBER_TYPE = {
  USER: 1, // 人员
  DEPT: 2, // 部门
  ROLE: 3, // 角色
  GROUP: 4, // 审核人员组
}

/** 平铺展示的人数上限：超过则折叠为「等N人」，避免部门/角色展开后撑爆节点高度 */
export const MAX_FLAT_PEOPLE = 5

/** key 前缀 → 成员类型 */
const KEY_PREFIX_TYPE = {
  user: MEMBER_TYPE.USER,
  dept: MEMBER_TYPE.DEPT,
  role: MEMBER_TYPE.ROLE,
  group: MEMBER_TYPE.GROUP,
}

/** 模块级缓存：成员目录只加载一次，申请页 / 详情页多处复用同一份数据 */
let directoryPromise = null

/** 解析成员 key："group_5" → { kind: 'group', id: '5' }；格式不符返回 null */
function parseMemberKey(key) {
  const matched = String(key || '').match(/^([a-z]+)_(\d+)$/)
  if (!matched) return null
  const [, kind, id] = matched
  if (!KEY_PREFIX_TYPE[kind]) return null
  return { kind, id }
}

/** 部门树递归收集：部门 id → 部门下直属用户（与后端 sys_user_dept 口径一致，不含子部门） */
function collectDeptPeople(nodes, deptMap, userMap) {
  ;(nodes || []).forEach((node) => {
    if (!node || node.type !== 'dept') return
    const people = (node.children || [])
      .filter((child) => child?.type === 'user')
      .map((child) => ({ id: child.id, name: child.name || child.username || '' }))
    deptMap.set(String(node.id), people)
    people.forEach((p) => userMap.set(String(p.id), p.name))
    // 子部门继续下探
    collectDeptPeople(node.children, deptMap, userMap)
  })
}

/**
 * 懒加载成员目录（模块级缓存）。三个接口任一失败都降级为空映射，
 * 调用方据此回退到 label 展示，不会阻塞流程渲染。
 * @returns {Promise<{deptMap: Map, roleMap: Map, groupMap: Map, userMap: Map}>}
 */
export function loadMemberDirectory() {
  if (directoryPromise) return directoryPromise

  directoryPromise = Promise.all([
    deptApi.getDeptUsersTree({ status: 1 }).catch(() => null),
    roleApi.getRoleUsers().catch(() => null),
    fetchAll(examineGroupApi.listExamineGroups, { status: 1 }).catch(() => null),
  ]).then(([deptRes, roleRes, groupRes]) => {
    const deptMap = new Map()
    const roleMap = new Map()
    const groupMap = new Map()
    const userMap = new Map()

    collectDeptPeople(deptRes?.data, deptMap, userMap)

    ;(roleRes?.data || []).forEach((role) => {
      if (!role) return
      const people = (role.children || [])
        .filter((child) => child?.type === 'user')
        .map((child) => ({ id: child.id, name: child.name || child.username || '' }))
      roleMap.set(String(role.id), people)
      people.forEach((p) => userMap.set(String(p.id), p.name))
    })

    ;(groupRes?.data?.list || groupRes?.data || []).forEach((group) => {
      if (!group) return
      const people = (group.approvers || []).map((a) => ({
        id: a.id,
        name: a.name || a.username || '',
      }))
      groupMap.set(String(group.id), people)
      people.forEach((p) => userMap.set(String(p.id), p.name))
    })

    return { deptMap, roleMap, groupMap, userMap }
  })

  return directoryPromise
}

/**
 * 单个成员引用展开为人员列表。
 * 目录未就绪、引用无法解析或目标为空时回退到 member.label，
 * 保证加载期间与异常场景下仍能显示原口径，不会出现空白。
 */
export function resolveMemberPeople(member, directory) {
  const fallback = member?.label ? [{ id: null, name: member.label }] : []
  const parsed = parseMemberKey(member?.key)
  if (!parsed) return fallback

  const { kind, id } = parsed
  if (kind === 'user') {
    // 人员引用：使用者传入的姓名映射 > 目录 > 配置时写入的 label
    const name = directory?.userMap?.get(id) || member.label || `用户${id}`
    return [{ id, name }]
  }

  if (!directory) return fallback // 目录尚未加载完成，先沿用原展示
  const map =
    kind === 'dept' ? directory.deptMap : kind === 'role' ? directory.roleMap : directory.groupMap
  const people = map?.get(id)
  return people?.length ? people : fallback
}

/**
 * 节点成员整体展开为人员列表（按出现顺序去重）。
 * 传入 nameMap（userId → 姓名）时优先采用，用于实例详情里已解析的真实姓名。
 */
export function resolveNodePeople(node, directory, nameMap) {
  const out = []
  const seen = new Set()
  ;(node?.members || []).forEach((member) => {
    resolveMemberPeople(member, directory).forEach((person) => {
      const name = (person.id != null && nameMap?.[person.id]) || person.name
      if (!name) return
      // 同一人可能同时被部门与角色带出，按用户 id 去重；无 id 时（回退 label）按姓名去重
      const dedupKey = person.id != null ? `u${person.id}` : `n${name}`
      if (seen.has(dedupKey)) return
      seen.add(dedupKey)
      out.push({ id: person.id, name })
    })
  })
  return out
}

/** 是否含需要展开的成员引用（部门 / 角色 / 审核人员组），用于判断要不要加载成员目录 */
export function hasExpandableMember(nodes) {
  const check = (list) =>
    (list || []).some((node) => {
      if (!node) return false
      const hit = (node.members || []).some((m) => {
        const parsed = parseMemberKey(m?.key)
        return parsed && parsed.kind !== 'user'
      })
      if (hit) return true
      if (node.type === 4) {
        return (node.branches || []).some((b) => check(b?.children))
      }
      return false
    })
  return check(nodes)
}

/**
 * 超限折叠：前 MAX_FLAT_PEOPLE 个平铺，其余折叠为「等 N 人」（N 为总人数）。
 * @returns {{head: object[], restCount: number, total: number}}
 */
export function splitFlatPeople(people) {
  const list = people || []
  if (list.length <= MAX_FLAT_PEOPLE) {
    return { head: list, restCount: 0, total: list.length }
  }
  return {
    head: list.slice(0, MAX_FLAT_PEOPLE),
    restCount: list.length - MAX_FLAT_PEOPLE,
    total: list.length,
  }
}
