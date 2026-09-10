import {
  Button,
  Card,
  Checkbox,
  Drawer,
  Input,
  Message,
  Modal,
  Popconfirm,
  Popover,
  Radio,
  Select,
  Space,
  Tag,
  Tree
} from '@arco-design/web-react'
import {
  IconBranch,
  IconClose,
  IconPlus,
  IconSend,
  IconStamp,
  IconUser,
} from '@arco-design/web-react/icon'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useParams } from 'react-router-dom'
import * as applicationApi from '../../api/application'
import * as deptApi from '../../api/dept'
import * as roleApi from '../../api/role'
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
  if (type === 'initiator') return { ...base, members: [] }
  if (type === 'cc') return { ...base, members: [], ccTiming: 'after_pass' }
  if (type === 'approver')
    return {
      ...base,
      approverType: 'user', // user 指定人员 / role 指定角色 / self 发起人自选
      members: [],
      selfSelect: 'single', // single 单选 / multi 多选
      strategy: 'self_multi', // self_multi 依次审批 / self_single 会签 / or_sign 或签
      emptyHandler: 'auto_pass', // auto_pass / auto_reject / to_admin / assign
      emptyMembers: [],
      permissions: ['reject'], // reject 拒绝 / transfer 转交 / add_sign 加签
      fieldPerms: [], // 表单字段权限 [{ field, perm: read | hidden | edit }]
    }
  if (type === 'condition')
    return {
      ...base,
      relation: 'and',
      branches: [createBranch('默认', true), createBranch('条件1')],
    }
  return base
}

// 条件表达式：逻辑运算符
const OPERATOR_OPTIONS = [
  { value: '>', label: '大于' },
  { value: '<', label: '小于' },
  { value: '=', label: '等于' },
  { value: '!=', label: '不等于' },
  { value: 'contains', label: '包含' },
  { value: 'not_contains', label: '不包含' },
]

// 兼容旧数据：members 可能为字符串数组，统一转为 { type, label } 结构
const normalizeMembers = (members) =>
  (members || []).map((m) => (typeof m === 'string' ? { type: 'user', label: m } : m))

// ==================== 对象选择器数据（动态：组织架构 / 角色接口） ====================

// 接口部门树 → 选择器树格式：dept 节点带 isDept 标记，children 递归含子部门与员工
// 接口部门：{ id, name, children: [] }
const transformDeptTree = (data = []) =>
  data.map((d) => ({
    key: `dept_${d.id}`,
    title: d.name,
    isDept: true,
    children: [
      ...transformDeptTree(d.children || []),
    ],
  }))

// 树节点 → key 映射：{ key: { key, type: 'dept' | 'user', label } }
const buildOrgItemMap = (tree) => {
  const map = {}
  const walk = (nodes) => {
    nodes.forEach((n) => {
      map[n.key] = { key: n.key, type: n.isDept ? 'dept' : 'user', label: n.title }
      if (n.children?.length) walk(n.children)
    })
  }
  walk(tree)
  return map
}

// 人员 key → 所属部门标题（右侧展示「部门：姓名」用，人员归到最近祖先部门）
const buildUserDeptMap = (tree) => {
  const map = {}
  const walk = (nodes, deptTitle) => {
    nodes.forEach((n) => {
      if (n.isDept) walk(n.children || [], n.title)
      else map[n.key] = deptTitle
    })
  }
  walk(tree)
  return map
}

// 接口角色数组 → 选择器列表格式：{ id, name, code } → { key: 'role_{id}', title: name }
const transformRoleList = (data = []) =>
  data.map((r) => ({ key: `role_${r.id}`, title: r.name }))

// 角色列表 → key 映射
const buildRoleItemMap = (roles) =>
  Object.fromEntries(roles.map((r) => [r.key, { key: r.key, type: 'role', label: r.title }]))

// 选择器模式标签（可按需扩展更多维度）
const MODE_LABELS = { org: '按组织架构选择', role: '按角色选择' }

// ==================== 流程画布子组件 ====================

// 节点摘要（纯信息展示）：成员 / 审批策略（条件分支由 ConditionBlock 独立渲染）
function renderNodeSummary(node, userDeptMap = {}) {
  // members 为 { key, type, label } 对象数组，需取 label 渲染
  const renderMemberLabel = (m) =>
    m.type === 'user' && userDeptMap[m.key]
      ? `${userDeptMap[m.key]}：${m.label}`
      : m.label || m.key

  // 生成纯文本摘要（单行省略）
  const renderTextSummary = () => {
    if (!node.members?.length) return null
    const labels = node.members.map(renderMemberLabel)
    if (labels.length <= 3) {
      return labels.join('、')
    }
    return `${labels.slice(0, 3).join('、')} 等 ${labels.length} 人`
  }

  // Tooltip 内容：完整展示所有成员
  const renderTooltipContent = () => (
    <div className="flex max-h-80 flex-wrap gap-1 overflow-auto p-1">
      {node.members.map((m, i) => (
        <Tag key={m.key || `${m.type}-${m.label}-${i}`}>{renderMemberLabel(m)}</Tag>
      ))}
    </div>
  )

  const summaryText = renderTextSummary()

  if (node.type === 'approver') {
    return (
      <div className="flex items-center">
        {summaryText ? (
          <Popover position="right" content={renderTooltipContent()}>
            <span className="block w-full truncate text-xs">{summaryText}</span>
          </Popover>
        ) : (
          <span className="cursor-pointer text-xs text-gray-400">未设置成员</span>
        )}
      </div>
    )
  }
  return (
    <div>
      {summaryText ? (
        <Popover position="right" content={renderTooltipContent()}>
          <span className="block w-full truncate text-xs">{summaryText}</span>
        </Popover>
      ) : (
        <span className="cursor-pointer text-xs text-gray-400">未设置成员</span>
      )}
    </div>
  )
}

/** 1. 节点卡片区域：渲染单个流程节点卡片（类型色标 + 图标 + 摘要 + 删除），点击卡片弹出编辑抽屉 */
function FlowNodeCard({ node, userDeptMap = {}, onRemove, onEdit }) {
  const meta = NODE_TYPE_META[node.type]
  const Icon = meta.icon
  return (
    <div
      className="relative w-55 cursor-pointer rounded border border-(--color-neutral-3) bg-white shadow"
      onClick={() => onEdit?.(node)}
    >
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
      <div className="px-3 py-2">{renderNodeSummary(node, userDeptMap)}</div>
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

/** 分支卡：以 FlowNodeCard 同款卡片样式渲染单个条件分支（条件X + 摘要 + 非默认可删除），点击卡片编辑条件 */
function BranchCard({ branch, onRemove, onEdit }) {
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
}

/**
 * 条件分支节点：纯布局容器（无卡片外观），负责承载各条件分支列。
 * 每个分支以 BranchCard（FlowNodeCard 同款样式）渲染，卡下接连接线 + 加号，再挂节点链（支持嵌套条件递归）。
 * 条件分支不能被直接删除：仅当删除某非默认分支后只剩「默认」分支时，级联删除整个条件节点。
 */
function ConditionBlock({
  node,
  userDeptMap = {},
  onEdit,
  onEditBranch,
  onAddBranch,
  onRemoveBranch,
  onRemoveNode,
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
            <div
              className={`absolute top-0 ${i === 0 ? 'right-0 left-1/2 w-1/2' : i === node.branches.length - 1 ? 'right-1/2 left-0 w-1/2' : 'w-full'} h-0 border-t border-gray-300`}
            />
            <div className="absolute z-0 h-full w-0 border-l border-gray-300" />
            <BranchCard
              branch={b}
              onRemove={b.isDefault ? undefined : () => onRemoveBranch(node.id, b.id)}
              onEdit={() => onEditBranch?.(node, b)}
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
                userDeptMap={userDeptMap}
                onRemove={(cid) => onRemoveNode(node.id, b.id, cid)}
                onEdit={onEdit}
                onEditBranch={onEditBranch}
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
 * 通用对象选择器弹层（左右布局 Modal）：
 * - modes: 数据源维度数组，如 ['org', 'role']；单项时自动隐藏 Tab 切换栏
 *     'org'  — 组织架构树（部门 + 人员）
 *     'role' — 角色列表
 * - checkTarget: org 树可勾选类型
 *     'user'（默认）— 仅人员可勾选
 *     'dept'        — 仅部门可勾选
 *     'both'        — 部门与人员均可勾选
 * 确认后通过 onChange 统一回传 { key, type, label } 结构的条目数组
 */
function PersonSelectorModal({
  title = '选择人员',
  value = [],
  onChange,
  onCancel,
  modes = ['org', 'role'],
  checkTarget = 'user',
  orgTree = [],
  roleList = [],
  orgItemMap = {},
  roleItemMap = {},
  userDeptMap = {},
  loading = false,
}) {
  const hasOrg = modes.includes('org')
  const isSingleMode = modes.length === 1
  const [tab, setTab] = useState(modes[0])
  // 弹层内临时选择（统一带 key）
  const [selected, setSelected] = useState(() =>
    value.map((item) => ({ ...item, key: item.key || `${item.type}-${item.label}` })),
  )

  // 组织架构树选中 keys（部门/人员）
  const orgCheckedKeys = selected.filter((s) => orgItemMap[s.key]).map((s) => s.key)
  // 角色选中 keys
  const roleCheckedKeys = selected.filter((s) => roleItemMap[s.key]).map((s) => s.key)

  // Tree 勾选（checkStrictly 父子独立，避免 disableCheckbox 下级联干扰）
  const handleTreeCheck = (keys) => {
    const checked = Array.isArray(keys) ? keys : keys?.checked || []
    let orgItems = checked.map((k) => orgItemMap[k]).filter(Boolean)
    // 按 checkTarget 过滤：dept 仅保留部门，user 仅保留人员，both 全部保留
    if (checkTarget !== 'both') {
      orgItems = orgItems.filter((s) => s.type === checkTarget)
    }
    const roleItems = selected.filter((s) => roleItemMap[s.key])
    setSelected([...orgItems, ...roleItems])
  }

  const handleRoleCheck = (keys) => {
    const roleItems = keys.map((k) => roleItemMap[k]).filter(Boolean)
    const orgItems = selected.filter((s) => orgItemMap[s.key])
    setSelected([...orgItems, ...roleItems])
  }

  // 删除已选项：checkStrictly 下父子独立，直接移除该项即可
  const remove = (index) => setSelected(selected.filter((_, i) => i !== index))

  // 右侧标签展示：人员「所属部门：姓名」/ 部门、角色直接显示名称
  const renderTagLabel = (item) => {
    if (item.type === 'user') {
      const dept = userDeptMap[item.key]
      return dept ? `${dept}：${item.label}` : item.label
    }
    return item.label
  }

  return (
    <Modal
      title={title}
      visible
      onCancel={onCancel}
      onOk={() => onChange(selected)}
      style={{ width: isSingleMode ? 480 : 680 }}
    >
      <div className="flex gap-4">
        {/* 左侧：数据源 */}
        <div className="w-1/2 rounded border border-gray-200">
          {!isSingleMode && (
            <div className="flex justify-center border-b border-gray-100 py-2">
              <Radio.Group type="button" size="small" value={tab} onChange={setTab}>
                {modes.map((m) => (
                  <Radio key={m} value={m}>
                    {MODE_LABELS[m]}
                  </Radio>
                ))}
              </Radio.Group>
            </div>
          )}
          <div className="max-h-80 overflow-auto p-3">
            {loading ? (
              <div className="py-8 text-center text-xs text-gray-400">数据加载中...</div>
            ) : tab === 'org' && hasOrg ? (
              orgTree.length ? (
                <Tree
                  checkable
                  checkStrictly
                  checkedKeys={orgCheckedKeys}
                  onCheck={handleTreeCheck}
                  treeData={orgTree}
                  disableCheckbox={(node) => {
                    if (checkTarget === 'both') return false
                    const hasChildren = !!node.children?.length
                    return checkTarget === 'dept' ? !hasChildren : hasChildren
                  }}
                />
              ) : (
                <div className="py-8 text-center text-xs text-gray-400">暂无组织架构数据</div>
              )
            ) : roleList.length ? (
              <Checkbox.Group
                direction="vertical"
                value={roleCheckedKeys}
                onChange={handleRoleCheck}
              >
                {roleList.map((r) => (
                  <Checkbox key={r.key} value={r.key}>
                    {r.title}
                  </Checkbox>
                ))}
              </Checkbox.Group>
            ) : (
              <div className="py-8 text-center text-xs text-gray-400">暂无角色数据</div>
            )}
          </div>
        </div>
        {/* 右侧：已选择 */}
        <div className="w-1/2 rounded border border-gray-200 p-3">
          <div className="mb-2 text-sm font-medium">已选择（{selected.length}）</div>
          <div className="flex flex-wrap gap-2">
            {selected.length ? (
              selected.map((item, i) => (
                <Tag
                  key={`${item.type}-${item.key || item.label}-${i}`}
                  closable
                  onClose={() => remove(i)}
                >
                  {renderTagLabel(item)}
                </Tag>
              ))
            ) : (
              <span className="text-xs text-gray-400">未选择任何人员 / 角色 / 部门</span>
            )}
          </div>
        </div>
      </div>
    </Modal>
  )
}

/**
 * 人员/部门/角色选择器公共组件：展示已选条目 + 「选择」按钮，唤起 PersonSelectorModal
 * - modes: 数据源维度，如 ['org', 'role']（默认）、['role']、['org']
 * - checkTarget: org 树勾选目标 'user'（默认）| 'dept' | 'both'
 */
function PersonPicker({
  value = [],
  onChange,
  placeholder,
  modes = ['org', 'role'],
  checkTarget = 'user',
  orgTree = [],
  roleList = [],
  orgItemMap = {},
  roleItemMap = {},
  userDeptMap = {},
  loading = false,
}) {
  const [visible, setVisible] = useState(false)
  const remove = (index) => onChange(value.filter((_, i) => i !== index))

  return (
    <>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {value.length ? (
          value.map((item, i) => (
            <Tag
              key={`${item.type}-${item.key || item.label}-${i}`}
              closable
              onClose={() => remove(i)}
            >
              {item.type === 'user' && userDeptMap[item.key]
                ? `${userDeptMap[item.key]}：${item.label}`
                : item.label}
            </Tag>
          ))
        ) : (
          <span className="text-xs text-gray-400">未选择</span>
        )}
      </div>
      <Button type="primary" size="small" icon={<IconPlus />} onClick={() => setVisible(true)}>
        {placeholder || '选择人员'}
      </Button>
      {visible && (
        <PersonSelectorModal
          title={placeholder || '选择人员'}
          modes={modes}
          checkTarget={checkTarget}
          value={value}
          orgTree={orgTree}
          roleList={roleList}
          orgItemMap={orgItemMap}
          roleItemMap={roleItemMap}
          userDeptMap={userDeptMap}
          loading={loading}
          onChange={(items) => {
            onChange(items)
            setVisible(false)
          }}
          onCancel={() => setVisible(false)}
        />
      )}
    </>
  )
}

/** 审批人节点：点击卡片唤起 Drawer，包含审批对象 / 审批方式 / 容错与权限 / 表单字段权限 四个配置模块 */
function ApproverEditDrawer({
  node,
  appId,
  formFields = [],
  fieldsLoading = false,
  orgTree = [],
  roleList = [],
  orgItemMap = {},
  roleItemMap = {},
  userDeptMap = {},
  selectorLoading = false,
  onCancel,
  onSave,
}) {
  const [approverType, setApproverType] = useState(node.approverType || 'user')
  const [members, setMembers] = useState(normalizeMembers(node.members))
  const [selfSelect, setSelfSelect] = useState(node.selfSelect || 'single')
  const [strategy, setStrategy] = useState(node.strategy || 'self_multi')
  const [emptyHandler, setEmptyHandler] = useState(node.emptyHandler || 'auto_pass')
  const [emptyMembers, setEmptyMembers] = useState(normalizeMembers(node.emptyMembers))
  const [permissions, setPermissions] = useState(node.permissions || ['reject'])
  const [fieldPerms, setFieldPerms] = useState(node.fieldPerms || [])
  // 应用表单元素列表（步骤四：表单字段权限的字段来源，由主组件请求后通过 props 传入）

  const updateFieldPerm = (index, key, v) =>
    setFieldPerms(fieldPerms.map((fp, i) => (i === index ? { ...fp, [key]: v } : fp)))

  // 审批对象联动：发起人自选 + 多选时展示步骤二；指定人员/角色实际选择数量 > 1（事实多选）时同样展示
  const showStrategy =
    (approverType !== 'self' && members.length > 1) ||
    (approverType === 'self' && selfSelect === 'multi')

  return (
    <Drawer
      width={560}
      title="审批人设置"
      visible
      onCancel={onCancel}
      footer={
        <div className="flex justify-end gap-2">
          <Button onClick={onCancel}>取消</Button>
          <Button
            type="primary"
            onClick={() =>
              onSave({
                ...node,
                approverType,
                members,
                selfSelect,
                strategy,
                emptyHandler,
                emptyMembers,
                permissions,
                fieldPerms,
              })
            }
          >
            保存
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        {/* 步骤一：审批对象 */}
        <div>
          <div className="mb-2 font-medium">审批对象</div>
          <Radio.Group
            value={approverType}
            onChange={(value) => {
              setApproverType(value)
              setMembers([])
            }}
          >
            <Radio value="user">指定人员</Radio>
            <Radio value="role">指定角色</Radio>
            <Radio value="self">发起人自选</Radio>
          </Radio.Group>
          {approverType !== 'self' ? (
            <div className="mt-3">
              <PersonPicker
                modes={approverType === 'role' ? ['role'] : ['org']}
                checkTarget="user"
                value={members}
                onChange={setMembers}
                placeholder="请选择"
                orgTree={orgTree}
                roleList={roleList}
                orgItemMap={orgItemMap}
                roleItemMap={roleItemMap}
                userDeptMap={userDeptMap}
                loading={selectorLoading}
              />
            </div>
          ) : (
            <div className="mt-3">
              <div className="mb-1 text-sm text-gray-500">选择类型</div>
              <Radio.Group type="button" value={selfSelect} onChange={setSelfSelect}>
                <Radio value="single">单选</Radio>
                <Radio value="multi">多选</Radio>
              </Radio.Group>
            </div>
          )}
        </div>
        {/* 步骤二：审批方式（仅发起人自选 + 多选时展示） */}
        {showStrategy && (
          <div>
            <div className="mb-2 font-medium">审批方式</div>
            <Radio.Group value={strategy} onChange={setStrategy} direction="vertical">
              <Radio value="self_multi">依次审批：按顺序审批，上一个审批通过后流转到下一个</Radio>
              <Radio value="self_single">会签：需要所有配置的审批人都同意，流程才能向下流转</Radio>
              <Radio value="or_sign">或签：其中任意一名审批人同意，流程即向下流转</Radio>
            </Radio.Group>
          </div>
        )}
        {/* 步骤三：容错与权限 */}
        <div>
          <div className="mb-2 font-medium">容错与权限</div>
          <div className="mb-1 text-sm text-gray-500">审批人为空的处理方式</div>
          <Radio.Group value={emptyHandler} onChange={setEmptyHandler} direction="vertical">
            <Radio value="auto_pass">自动通过</Radio>
            <Radio value="auto_reject">自动拒绝</Radio>
            <Radio value="to_admin">转交流程管理员</Radio>
            <Radio value="assign">指定人员</Radio>
          </Radio.Group>
          {emptyHandler === 'assign' && (
            <div className="mt-3">
              <PersonPicker
                modes={['org']}
                value={emptyMembers}
                onChange={setEmptyMembers}
                placeholder="选择指定人员"
                orgTree={orgTree}
                roleList={roleList}
                orgItemMap={orgItemMap}
                roleItemMap={roleItemMap}
                userDeptMap={userDeptMap}
                loading={selectorLoading}
              />
            </div>
          )}
          <div className="mt-4 mb-1 text-sm text-gray-500">审批人操作权限</div>
          <Checkbox.Group value={permissions} onChange={setPermissions}>
            <Checkbox value="reject">拒绝</Checkbox>
            <Checkbox value="transfer">转交</Checkbox>
            <Checkbox value="add_sign">加签</Checkbox>
          </Checkbox.Group>
        </div>
        {/* 步骤四：表单字段权限（字段来源于应用已配置的表单元素） */}
        <div>
          <div className="mb-2 font-medium">表单字段权限</div>
          {fieldsLoading ? (
            <div className="py-3 text-xs text-gray-400">字段加载中...</div>
          ) : !formFields.length ? (
            <div className="py-3 text-xs text-gray-400">
              暂无表单元素，请先在「表单元素管理」中配置
            </div>
          ) : (
            <>
              {fieldPerms.map((fp, i) => (
                <div key={i} className="mb-2 flex items-center gap-2">
                  <Select
                    style={{ flex: 1 }}
                    value={fp.field || undefined}
                    placeholder="选择表单字段"
                    onChange={(v) => updateFieldPerm(i, 'field', v)}
                  >
                    {formFields.map((f) => (
                      <Select.Option key={f.field_key} value={f.field_key}>
                        {f.label || f.field_key}
                      </Select.Option>
                    ))}
                  </Select>
                  <Select
                    style={{ width: 110 }}
                    value={fp.perm}
                    onChange={(v) => updateFieldPerm(i, 'perm', v)}
                  >
                    <Select.Option value="read">只读</Select.Option>
                    <Select.Option value="hidden">隐藏</Select.Option>
                    <Select.Option value="edit">可编辑</Select.Option>
                  </Select>
                  <Button
                    icon={<IconClose />}
                    onClick={() => setFieldPerms(fieldPerms.filter((_, x) => x !== i))}
                  />
                </div>
              ))}
              <Button
                size="small"
                icon={<IconPlus />}
                onClick={() => setFieldPerms([...fieldPerms, { field: '', perm: 'read' }])}
              >
                添加字段
              </Button>
            </>
          )}
        </div>
      </div>
    </Drawer>
  )
}

/** 抄送人节点：点击卡片唤起 Drawer，配置抄送对象与抄送时机 */
function CcEditDrawer({
  node,
  orgTree = [],
  roleList = [],
  orgItemMap = {},
  roleItemMap = {},
  userDeptMap = {},
  selectorLoading = false,
  onCancel,
  onSave,
}) {
  const [members, setMembers] = useState(normalizeMembers(node.members))
  const [ccTiming, setCcTiming] = useState(node.ccTiming || 'after_pass')
  return (
    <Drawer
      width={480}
      title="抄送人设置"
      visible
      onCancel={onCancel}
      footer={
        <div className="flex justify-end gap-2">
          <Button onClick={onCancel}>取消</Button>
          <Button type="primary" onClick={() => onSave({ ...node, members, ccTiming })}>
            保存
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        <div>
          <div className="mb-2 font-medium">抄送对象</div>
          <PersonPicker
            modes={['org']}
            value={members}
            onChange={setMembers}
            placeholder="请选择"
            orgTree={orgTree}
            roleList={roleList}
            orgItemMap={orgItemMap}
            roleItemMap={roleItemMap}
            userDeptMap={userDeptMap}
            loading={selectorLoading}
          />
        </div>
        <div>
          <div className="mb-2 font-medium">抄送时机</div>
          <Radio.Group direction="vertical" value={ccTiming} onChange={setCcTiming}>
            <Radio value="after_pass">审批通过后抄送</Radio>
            <Radio value="on_end">流程结束时统一抄送</Radio>
          </Radio.Group>
        </div>
      </div>
    </Drawer>
  )
}

/** 条件分支节点：点击分支卡唤起 Drawer，配置条件关系与具体条件表达式（字段来源于应用表单元素列表） */
function ConditionEditDrawer({
  node,
  branch,
  formFields = [],
  fieldsLoading = false,
  onCancel,
  onSave,
}) {
  const [relation, setRelation] = useState(node.relation || 'and')
  // 默认条件行：formFields 有数据时取第一个字段的 field_key，否则为空字符串
  const defaultField = formFields[0]?.field_key || ''
  const [rules, setRules] = useState(
    branch.rules?.length ? branch.rules : [{ field: defaultField, operator: '=', value: '' }],
  )

  const updateRule = (index, key, v) =>
    setRules(rules.map((r, i) => (i === index ? { ...r, [key]: v } : r)))

  return (
    <Drawer
      width={560}
      title={`编辑条件 - ${branch.isDefault ? '默认分支' : branch.label}`}
      visible
      onCancel={onCancel}
      footer={
        <div className="flex justify-end gap-2">
          <Button onClick={onCancel}>取消</Button>
          <Button type="primary" onClick={() => onSave(node, branch, { relation, rules })}>
            保存
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        <div>
          <div className="mb-2 font-medium">条件关系</div>
          <Radio.Group type="button" value={relation} onChange={setRelation}>
            <Radio value="and">且（AND）</Radio>
            <Radio value="or">或（OR）</Radio>
          </Radio.Group>
        </div>
        <div>
          <div className="mb-2 font-medium">具体条件表达式</div>
          {fieldsLoading ? (
            <div className="py-3 text-xs text-gray-400">字段加载中...</div>
          ) : !formFields.length ? (
            <div className="py-3 text-xs text-gray-400">
              暂无表单元素，请先在「表单元素管理」中配置
            </div>
          ) : (
            <>
              {rules.map((r, i) => (
                <div key={i} className="mb-2 flex items-center gap-2">
                  <Select
                    style={{ width: 140 }}
                    value={r.field}
                    placeholder="选择字段"
                    onChange={(v) => updateRule(i, 'field', v)}
                  >
                    {formFields.map((f) => (
                      <Select.Option key={f.field_key} value={f.field_key}>
                        {f.label || f.field_key}
                      </Select.Option>
                    ))}
                  </Select>
                  <Select
                    style={{ width: 110 }}
                    value={r.operator}
                    onChange={(v) => updateRule(i, 'operator', v)}
                  >
                    {OPERATOR_OPTIONS.map((o) => (
                      <Select.Option key={o.value} value={o.value}>
                        {o.label}
                      </Select.Option>
                    ))}
                  </Select>
                  <Input
                    style={{ flex: 1 }}
                    value={r.value}
                    placeholder="输入具体的数值或状态"
                    onChange={(v) => updateRule(i, 'value', v)}
                  />
                  <Button
                    icon={<IconClose />}
                    onClick={() => setRules(rules.filter((_, x) => x !== i))}
                  />
                </div>
              ))}
              <Button
                size="small"
                icon={<IconPlus />}
                onClick={() =>
                  setRules([...rules, { field: defaultField, operator: '=', value: '' }])
                }
              >
                添加条件
              </Button>
            </>
          )}
        </div>
      </div>
    </Drawer>
  )
}

/**
 * 流程节点单元：内容卡片（FlowNodeCard / ConditionBlock）与下方连接器（NodeConnector）内聚。
 * 每个节点下方自带连接线 + 加号，主链与条件分支列统一复用，无需外部 Fragment 拼接。
 */
function FlowNode({
  node,
  addMenu,
  userDeptMap = {},
  onRemove,
  onEdit,
  onEditBranch,
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
          userDeptMap={userDeptMap}
          onEdit={onEdit}
          onEditBranch={onEditBranch}
          onAddBranch={onAddBranch}
          onRemoveBranch={onRemoveBranch}
          onRemoveNode={onRemoveNode}
          buildBranchAddMenu={buildBranchAddMenu}
        />
      ) : (
        <FlowNodeCard node={node} userDeptMap={userDeptMap} onRemove={onRemove} onEdit={onEdit} />
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

  // 应用表单元素列表（条件表达式字段来源 / 审批人表单字段权限），挂载即请求一次，供各弹层共享
  const [formFields, setFormFields] = useState([])
  const [fieldsLoading, setFieldsLoading] = useState(false)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    setFieldsLoading(true)
    applicationApi
      .listFormElements(id, { page: 1, size: 999 })
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

  // 对象选择器数据源：组织架构树（部门+员工）/ 角色列表，挂载即请求一次
  const [orgTree, setOrgTree] = useState([])
  const [roleList, setRoleList] = useState([])
  const [selectorLoading, setSelectorLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    setSelectorLoading(true)
    Promise.all([deptApi.getDeptUsersTree(), roleApi.listRoles({ page: 1, size: 999 })])
      .then(([deptRes, roleRes]) => {
        if (cancelled) return
        setOrgTree(transformDeptTree(deptRes.data?.list || deptRes.data || []))
        setRoleList(transformRoleList(roleRes.data?.list || roleRes.data || []))
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

  // 选择器派生映射（随动态数据更新）
  const orgItemMap = useMemo(() => buildOrgItemMap(orgTree), [orgTree])
  const roleItemMap = useMemo(() => buildRoleItemMap(roleList), [roleList])
  const userDeptMap = useMemo(() => buildUserDeptMap(orgTree), [orgTree])

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

  // 节点/分支点击编辑：{ kind: 'node' | 'branch' | 'initiator', node, branch? } 控制弹层显隐与类型
  const [editing, setEditing] = useState(null)
  const handleNodeEdit = useCallback((node) => {
    // 发起人：跳过中间弹窗，直接唤起人员选择器（确认即保存 members）
    if (node.type === 'initiator') {
      setEditing({ kind: 'initiator', node })
      return
    }
    setEditing({ kind: 'node', node })
  }, [])
  const handleBranchEdit = useCallback(
    (node, branch) => setEditing({ kind: 'branch', node, branch }),
    [],
  )
  const handleCloseEdit = useCallback(() => setEditing(null), [])

  // 保存节点编辑：递归定位任意层级的节点并整体替换
  const handleNodeSave = useCallback((updated) => {
    setNodes((prev) => updateNodeInTree(prev, updated.id, () => updated))
    setEditing(null)
    Message.success('节点已保存')
  }, [])

  // 保存条件分支编辑：更新条件节点关系 + 指定分支的条件表达式
  const handleBranchSave = useCallback((node, branch, payload) => {
    setNodes((prev) =>
      updateNodeInTree(prev, node.id, (n) => ({
        ...n,
        relation: payload.relation,
        branches: n.branches.map((b) => (b.id === branch.id ? { ...b, rules: payload.rules } : b)),
      })),
    )
    setEditing(null)
    Message.success('条件已保存')
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
                userDeptMap={userDeptMap}
                onRemove={handleRemoveNode}
                onEdit={handleNodeEdit}
                onEditBranch={handleBranchEdit}
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
      {/* 节点/条件编辑弹层：发起人直接唤起人员选择器，审批人/抄送人/条件分支用 Drawer */}
      {editing?.kind === 'initiator' && (
        <PersonSelectorModal
          title="选择可发起人"
          modes={['org', 'role']}
          checkTarget="user"
          value={normalizeMembers(editing.node.members)}
          orgTree={orgTree}
          roleList={roleList}
          orgItemMap={orgItemMap}
          roleItemMap={roleItemMap}
          userDeptMap={userDeptMap}
          loading={selectorLoading}
          onChange={(items) => handleNodeSave({ ...editing.node, members: items })}
          onCancel={handleCloseEdit}
        />
      )}
      {editing?.kind === 'node' && editing.node.type === 'approver' && (
        <ApproverEditDrawer
          key={editing.node.id}
          node={editing.node}
          appId={id}
          formFields={formFields}
          fieldsLoading={fieldsLoading}
          orgTree={orgTree}
          roleList={roleList}
          orgItemMap={orgItemMap}
          roleItemMap={roleItemMap}
          userDeptMap={userDeptMap}
          selectorLoading={selectorLoading}
          onCancel={handleCloseEdit}
          onSave={handleNodeSave}
        />
      )}
      {editing?.kind === 'node' && editing.node.type === 'cc' && (
        <CcEditDrawer
          key={editing.node.id}
          node={editing.node}
          orgTree={orgTree}
          roleList={roleList}
          orgItemMap={orgItemMap}
          roleItemMap={roleItemMap}
          userDeptMap={userDeptMap}
          selectorLoading={selectorLoading}
          onCancel={handleCloseEdit}
          onSave={handleNodeSave}
        />
      )}
      {editing?.kind === 'branch' && (
        <ConditionEditDrawer
          key={editing.branch.id}
          node={editing.node}
          branch={editing.branch}
          formFields={formFields}
          fieldsLoading={fieldsLoading}
          onCancel={handleCloseEdit}
          onSave={handleBranchSave}
        />
      )}
    </Card>
  )
}
