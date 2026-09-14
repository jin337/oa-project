import { IconBranch, IconSend, IconStamp, IconUser } from '@arco-design/web-react/icon'

/** 模块标题（页签 / Card 标题） */
export const MODULE_LABEL = '审批配置'

/**
 * 节点类型元信息（key 为数字枚举：1-发起人 / 2-审批人 / 3-抄送人 / 4-条件分支）
 * @type {Record<1|2|3|4, { label: string, bg: string, icon: React.ComponentType }>}
 */
export const NODE_TYPE_META = {
  1: { label: '发起人', bg: 'bg-emerald-500', icon: IconUser }, // 1-发起人
  2: { label: '审批人', bg: 'bg-amber-500', icon: IconStamp }, // 2-审批人
  3: { label: '抄送人', bg: 'bg-blue-500', icon: IconSend }, // 3-抄送人
  4: { label: '条件分支', bg: 'bg-purple-500', icon: IconBranch }, // 4-条件分支
}

/** 可添加到流程中的节点类型（排除 1-发起人：发起人节点唯一） */
export const ADDABLE_NODE_TYPES = Object.keys(NODE_TYPE_META)
  .map(Number)
  .filter((type) => type !== 1)

/**
 * 条件表达式逻辑运算符（数字枚举 1-大于 / 2-小于 / 3-等于 / 4-不等于 / 5-包含 / 6-不包含）
 * @type {{ value: number, label: string }[]}
 */
export const OPERATOR_OPTIONS = [
  { value: 1, label: '大于' },
  { value: 2, label: '小于' },
  { value: 3, label: '等于' },
  { value: 4, label: '不等于' },
  { value: 5, label: '包含' },
  { value: 6, label: '不包含' },
]

/** 选择器数据源维度标签（key 为数字枚举：1-组织架构 / 2-角色） */
export const MODE_LABELS = { 1: '按组织架构选择', 2: '按角色选择' }

/** 成员/接口节点类型（'user'/'dept'）→ checkTarget 数字枚举（1-人员 / 2-部门）映射 */
export const MEMBER_TYPE_TO_TARGET = { user: 1, dept: 2 }

/** 审批对象（1-指定人员 / 2-指定角色 / 3-发起人自选） */
export const APPROVER_TYPE_OPTIONS = [
  { value: 1, label: '指定人员' },
  { value: 2, label: '指定角色' },
  { value: 3, label: '发起人自选' },
]

/** 发起人自选类型（1-单选 / 2-多选） */
export const SELF_SELECT_OPTIONS = [
  { value: 1, label: '单选' },
  { value: 2, label: '多选' },
]

/** 审批方式（1-依次审批 / 2-会签 / 3-或签） */
export const STRATEGY_OPTIONS = [
  { value: 1, label: '依次审批：按顺序审批，上一个审批通过后流转到下一个' },
  { value: 2, label: '会签：需要所有配置的审批人都同意，流程才能向下流转' },
  { value: 3, label: '或签：其中任意一名审批人同意，流程即向下流转' },
]

/** 审批人为空处理（1-自动通过 / 2-自动拒绝 / 3-转交流程管理员 / 4-指定人员） */
export const EMPTY_HANDLER_OPTIONS = [
  { value: 1, label: '自动通过' },
  { value: 2, label: '自动拒绝' },
  { value: 3, label: '转交流程管理员' },
  { value: 4, label: '指定人员' },
]

/** 审批人操作权限（数组元素：1-拒绝 / 2-转交 / 3-加签） */
export const PERMISSION_OPTIONS = [
  { value: 1, label: '拒绝' },
  { value: 2, label: '转交' },
  { value: 3, label: '加签' },
]

/** 表单字段权限（1-只读 / 2-隐藏 / 3-可编辑） */
export const FIELD_PERM_OPTIONS = [
  { value: 1, label: '只读' },
  { value: 2, label: '隐藏' },
  { value: 3, label: '可编辑' },
]

/** 抄送时机（1-审批通过后抄送 / 2-流程结束时统一抄送） */
export const CC_TIMING_OPTIONS = [
  { value: 1, label: '审批通过后抄送' },
  { value: 2, label: '流程结束时统一抄送' },
]

/** 条件关系（1-且(AND) / 2-或(OR)） */
export const RELATION_OPTIONS = [
  { value: 1, label: '且（AND）' },
  { value: 2, label: '或（OR）' },
]
