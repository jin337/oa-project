import { Button, Checkbox, Modal, Radio, Tag, Tree } from '@arco-design/web-react'
import { IconPlus } from '@arco-design/web-react/icon'
import { useMemo, useState } from 'react'
import { MODE_LABELS } from 'src/pages/application/design/constants'
import { useSelectorData } from 'src/pages/application/examine/selector-context'

/**
 * 通用对象选择器弹层（左右布局 Modal），参照钉钉审批的成员选择语义：
 * - modes: 数据源维度数组（数字枚举：1-组织架构 / 2-角色 / 4-审核人员组），如 [1, 2]；单项时自动隐藏 Tab 切换栏
 * - selectMode: 选择模式（数字枚举：1-单选 / 2-多选），默认 2-多选；单选时 selected 最多保留一项
 * - 组织架构维度（仅人员）：保留部门+人员父子层级，勾选部门联动选中其下所有人员，
 *   已选面板仅展示具体人员（「部门：姓名」）
 * - 角色维度：勾选「角色」节点本身（type=3），选角色 = 其下所有成员作为审批/抄送对象，
 *   角色下属用户节点不可勾选（人员由角色带出，不在选择器内展开）
 * - 审核人员组维度：勾选「审核人员组」本身（type=4），数据来自 Context 的 groupList（{ key, type, label } 条目数组）
 * 确认后通过 onChange 统一回传 { key, type, label } 结构的条目数组，type 为数字枚举（1-人员 / 2-部门 / 3-角色 / 4-审核人员组）
 */
export function PersonSelectorModal({
  title = '选择人员',
  value = [],
  onChange,
  onCancel,
  modes = [1, 2], // 默认全部数据源维度：1-组织架构 / 2-角色
  selectMode = 2, // 选择模式：1-单选 / 2-多选（默认多选）
  extra = null, // 额外内容插槽（渲染在弹层内容顶部，如加签类型选择）
}) {
  const {
    orgTree = [],
    roleList = [],
    groupList = [],
    orgItemMap = {},
    roleItemMap = {},
    userDeptMap = {},
    loading = false,
  } = useSelectorData()
  const hasOrg = modes.includes(1) // 1-组织架构
  const isSingleMode = modes.length === 1
  const [tab, setTab] = useState(modes[0])
  // 弹层内临时选择（统一带 key）；单选模式（selectMode===1）下仅保留最后一项，确保 selected 最多一个元素
  const [selected, setSelected] = useState(() => {
    const init = value.map((item) => ({ ...item, key: item.key || `${item.type}-${item.label}` }))
    return selectMode === 1 ? init.slice(-1) : init
  })

  // 组织架构树选中 keys（部门/人员）
  const orgCheckedKeys = selected.filter((s) => orgItemMap[s.key]).map((s) => s.key)


  // 组织架构树数据：保留部门+人员父子层级，全节点可勾选（父子联动，勾选部门=批量选中其下所有人员）
  const orgTreeData = useMemo(() => {
    const apply = (nodes) =>
      nodes.map((n) => ({
        ...n,
        children: n.children ? apply(n.children) : undefined,
      }))
    return apply(orgTree)
  }, [orgTree])


  // 已选去重：同一 key（同一用户/部门/角色，如 user_5）可能同时被组织树与角色树选中，
  // 此处按 key 只保留一条；人员条目优先保留带 roleLabel 的（角色维度展示「角色：姓名」），
  // 否则保留组织维度（展示「部门：姓名」），与右侧 renderTagLabel 的优先级保持一致
  const dedupe = (items) => {
    const map = new Map()
    items.forEach((it) => {
      if (!map.has(it.key)) {
        map.set(it.key, it)
      } else if (it.roleLabel && !map.get(it.key).roleLabel) {
        map.set(it.key, it)
      }
    })
    return Array.from(map.values())
  }

  // 组织树勾选：Tree 父子联动（checkStrictly=false），勾选部门会同时勾选其下所有人员，
  // 此处仅保留人员节点（部门节点过滤掉，右侧已选只展示具体人员）
  const handleTreeCheck = (keys) => {
    const checked = Array.isArray(keys) ? keys : keys?.checked || []
    let orgItems = checked.map((k) => orgItemMap[k]).filter(Boolean)
    // 仅保留人员节点（组织架构维度对象始终是具体人员）
    orgItems = orgItems.filter((s) => s.type === 1)
    // 单选模式（selectMode===1）：只保留最后勾选的一项，自动清除之前已选项
    if (selectMode === 1 && orgItems.length > 1) orgItems = orgItems.slice(-1)
    const roleItems = selected.filter((s) => roleItemMap[s.key])
    // 单选模式：组织树新选后，角色维度已有条目一并清除（selected 最多一个元素）
    const rest = selectMode === 1 ? [] : roleItems
    setSelected(dedupe([...orgItems, ...rest]))
  }

  // 角色维度勾选切换（钉钉模式：勾选「角色」本身，type=3；取消勾选则移除该角色）。
  // 保留组织架构维度的已选项（人员），仅增删角色条目
  const handleRoleToggle = (role, checked) => {
    if (selectMode === 1) {
      // 单选模式：勾选新角色即替换旧选项（selected 最多一个元素）；取消勾选则清空
      if (!checked) {
        setSelected(selected.filter((s) => s.key !== role.key))
        return
      }
      setSelected([roleItemMap[role.key]])
      return
    }
    const others = selected.filter((s) => !roleItemMap[s.key]) // 保留非角色条目（组织架构维度）
    const roleItems = selected.filter((s) => roleItemMap[s.key] && s.key !== role.key)
    if (checked) roleItems.push(roleItemMap[role.key])
    setSelected(dedupe([...others, ...roleItems]))
  }

  // 审核人员组维度勾选切换（勾选「审核人员组」本身，type=4；取消勾选则移除该组）。
  // 保留其他维度的已选项，仅增删审核组条目；单选/多选语义与角色维度一致
  const handleGroupToggle = (group, checked) => {
    if (selectMode === 1) {
      // 单选模式：勾选新组即替换旧选项（selected 最多一个元素）；取消勾选则清空
      if (!checked) {
        setSelected(selected.filter((s) => s.key !== group.key))
        return
      }
      setSelected([group])
      return
    }
    const others = selected.filter((s) => !groupList.some((g) => g.key === s.key)) // 保留非审核组条目
    const groupItems = selected.filter(
      (s) => groupList.some((g) => g.key === s.key) && s.key !== group.key,
    )
    if (checked) groupItems.push(group)
    setSelected(dedupe([...others, ...groupItems]))
  }

  // 删除已选项：checkStrictly 下父子独立，直接移除该项即可
  const remove = (index) => setSelected(selected.filter((_, i) => i !== index))

  // 右侧标签展示：1-人员 优先「所属角色：姓名」（角色维度选中），否则「所属部门：姓名」（组织维度选中）；
  // 2-部门 / 3-角色 直接显示名称
  const renderTagLabel = (item) => {
    if (item.type === 1) {
      // 1-人员
      if (item.roleLabel) return `${item.roleLabel}：${item.label}`
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
      style={{ width: 680 }}
      autoFocus={false}
    >
      {extra}
      <div className="flex gap-4">
        {/* 左侧：数据源 */}
        <div className="w-1/2 rounded border border-gray-200">
          {!isSingleMode && (
            <div className="flex justify-center border-b border-gray-100 py-2">
              <Radio.Group
                type="button"
                size="small"
                value={tab}
                onChange={(e) => {
                  setTab(e)
                  setSelected([])
                }}
              >
                {modes.map((m) => (
                  <Radio key={m} value={m}>
                    {MODE_LABELS[m]}
                  </Radio>
                ))}
              </Radio.Group>
            </div>
          )}
          <div className="h-80 overflow-auto p-3">
            {loading ? (
              <div className="py-8 text-center text-xs text-gray-400">数据加载中...</div>
            ) : tab === 1 && hasOrg ? ( // 1-组织架构
              orgTree.length ? (
                <Tree
                  key="org-tree"
                  checkable
                  checkedKeys={orgCheckedKeys}
                  onCheck={handleTreeCheck}
                  treeData={orgTreeData}
                />
              ) : (
                <div className="py-8 text-center text-xs text-gray-400">暂无组织架构数据</div>
              )
            ) : tab === 4 ? ( // 4-审核人员组：直接渲染审核组列表（勾选「组」本身，与角色维度一致）
              groupList.length ? (
                <div className="space-y-1">
                  {groupList.map((g) =>
                    selectMode === 1 ? (
                      <div key={g.key} className="flex items-center gap-2">
                        <Radio
                          checked={selected.some((s) => s.key === g.key)}
                          onChange={(checked) => handleGroupToggle(g, checked)}
                        >
                          {g.label}
                        </Radio>
                      </div>
                    ) : (
                      <div key={g.key} className="flex items-center gap-2">
                        <Checkbox
                          checked={selected.some((s) => s.key === g.key)}
                          onChange={(checked) => handleGroupToggle(g, checked)}
                        >
                          {g.label}
                        </Checkbox>
                      </div>
                    ),
                  )}
                </div>
              ) : (
                <div className="py-8 text-center text-xs text-gray-400">暂无审核人员组数据</div>
              )
            ) : roleList.length ? (
              // 2-角色：直接渲染角色列表（钉钉模式：勾选「角色」本身，无需角色下属用户树）。
              // 单选模式（selectMode===1）下用 Radio（点击已选项不触发取消，取消通过右侧 Tag 删除），
              // 多选模式用 Checkbox
              <div className="space-y-1">
                {roleList.map((r) =>
                  selectMode === 1 ? (
                    <div key={r.key} className="flex items-center gap-2">
                      <Radio
                        checked={selected.some((s) => s.key === r.key)}
                        onChange={(checked) => handleRoleToggle(r, checked)}
                      >
                        {r.title}
                      </Radio>
                    </div>
                  ) : (
                    <div key={r.key} className="flex items-center gap-2">
                      <Checkbox
                        checked={selected.some((s) => s.key === r.key)}
                        onChange={(checked) => handleRoleToggle(r, checked)}
                      >
                        {r.title}
                      </Checkbox>
                    </div>
                  ),
                )}
              </div>
            ) : (
              <div className="py-8 text-center text-xs text-gray-400">暂无角色数据</div>
            )}
          </div>
        </div>
        {/* 右侧：已选择 */}
        <div className="w-1/2 rounded border border-gray-200 p-3">
          <div className="mb-2 text-sm font-medium">已选择（{selected.length}）</div>
          <div className="flex flex-wrap gap-2 overflow-auto max-h-80">
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
 * 人员/部门/角色/审核人员组选择器公共组件：展示已选条目 + 「选择」按钮，唤起 PersonSelectorModal
 * - modes: 数据源维度数组（数字枚举：1-组织架构 / 2-角色 / 4-审核人员组），如 [1, 2]（默认）、[4]
 */
export function PersonPicker({
  value = [],
  onChange,
  placeholder,
  modes = [1, 2], // 默认全部数据源维度：1-组织架构 / 2-角色
  selectMode = 2, // 选择模式：1-单选 / 2-多选（默认多选）
}) {
  // 仅需 userDeptMap 用于已选 Tag 展示「部门：姓名」；组织树/角色/审核组数据由弹窗（PersonSelectorModal）消费
  const { userDeptMap = {} } = useSelectorData()
  const [visible, setVisible] = useState(false)
  const remove = (index) => onChange(value.filter((_, i) => i !== index))

  return (
    <>
      <Button type="primary" size="small" icon={<IconPlus />} onClick={() => setVisible(true)}>
        {placeholder || '选择人员'}
      </Button>
      {visible && (
        <PersonSelectorModal
          title={placeholder || '选择人员'}
          modes={modes}
          selectMode={selectMode}
          value={value}
          onChange={(items) => {
            onChange(items)
            setVisible(false)
          }}
          onCancel={() => setVisible(false)}
        />
      )}
            <div className="mt-2 flex flex-wrap items-center gap-2">
        {value.length ? (
          value.map((item, i) => (
            <Tag
              key={`${item.type}-${item.key || item.label}-${i}`}
              closable
              onClose={() => remove(i)}
            >
              {item.type === 1 // 1-人员：优先附所属角色（角色维度），否则附所属部门（组织维度）
                ? item.roleLabel
                  ? `${item.roleLabel}：${item.label}`
                  : userDeptMap[item.key]
                    ? `${userDeptMap[item.key]}：${item.label}`
                    : item.label
                : item.label}
            </Tag>
          ))
        ) : (
          <span className="text-xs text-gray-400">未选择</span>
        )}
      </div>
    </>
  )
}
