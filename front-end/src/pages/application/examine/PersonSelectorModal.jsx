import { Button, Checkbox, Modal, Radio, Tag, Tree } from '@arco-design/web-react'
import { IconPlus } from '@arco-design/web-react/icon'
import { useState } from 'react'
import { MODE_LABELS } from 'src/pages/application/constants'
import { useSelectorData } from 'src/pages/application/examine/selector-context'

/**
 * 通用对象选择器弹层（左右布局 Modal）：
 * - modes: 数据源维度数组（数字枚举：1-组织架构 / 2-角色），如 [1, 2]；单项时自动隐藏 Tab 切换栏
 * - checkTarget: org 树可勾选类型（数字枚举：1-人员 / 2-部门 / 3-人员与部门），默认 1-人员
 * 确认后通过 onChange 统一回传 { key, type, label } 结构的条目数组，type 为数字枚举（1-人员 / 2-部门 / 3-角色）
 */
export function PersonSelectorModal({
  title = '选择人员',
  value = [],
  onChange,
  onCancel,
  modes = [1, 2], // 默认全部数据源维度：1-组织架构 / 2-角色
  checkTarget = 1, // 默认 1-人员
}) {
  const {
    orgTree = [],
    roleList = [],
    orgItemMap = {},
    roleItemMap = {},
    userDeptMap = {},
    loading = false,
  } = useSelectorData()
  const hasOrg = modes.includes(1) // 1-组织架构
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
    // 按 checkTarget 过滤：1-人员 仅保留人员，2-部门 仅保留部门，3-人员与部门 全部保留
    if (checkTarget !== 3) {
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
    if (item.type === 1) {
      // 1-人员
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
                  checkable
                  checkStrictly={checkTarget !== 3}
                  checkedKeys={orgCheckedKeys}
                  onCheck={handleTreeCheck}
                  treeData={orgTree}
                  disableCheckbox={(node) => {
                    if (checkTarget === 3) return false // 3-人员与部门
                    const hasChildren = !!node.children?.length
                    return checkTarget === 2 ? !hasChildren : hasChildren // 2-部门
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
 * - modes: 数据源维度数组（数字枚举：1-组织架构 / 2-角色），如 [1, 2]（默认）、[2]、[1]
 * - checkTarget: org 树勾选目标（数字枚举：1-人员 / 2-部门 / 3-人员与部门），默认 1-人员
 */
export function PersonPicker({
  value = [],
  onChange,
  placeholder,
  modes = [1, 2], // 默认全部数据源维度：1-组织架构 / 2-角色
  checkTarget = 1, // 默认 1-人员
}) {
  const {
    orgTree = [],
    roleList = [],
    orgItemMap = {},
    roleItemMap = {},
    userDeptMap = {},
    loading = false,
  } = useSelectorData()
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
              {item.type === 1 && userDeptMap[item.key] // 1-人员：附所属部门
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
