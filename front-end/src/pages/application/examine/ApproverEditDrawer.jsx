import { useMemo, useState } from 'react'
import { Button, Checkbox, Drawer, Radio, Select } from '@arco-design/web-react'
import { IconClose, IconPlus } from '@arco-design/web-react/icon'
import {
  APPROVER_TYPE_OPTIONS,
  EMPTY_HANDLER_OPTIONS,
  FIELD_PERM_OPTIONS,
  PERMISSION_OPTIONS,
  SELF_SELECT_OPTIONS,
  STRATEGY_OPTIONS,
} from 'src/pages/application/constants'
import { normalizeMembers } from 'src/pages/application/examine/flowModel'
import { PersonPicker } from 'src/pages/application/examine/PersonSelectorModal'

/**
 * 审批人节点设置抽屉：审批对象 / 审批方式 / 容错与权限 / 表单字段权限 四个配置模块。
 * @param {{
 *   node: Object,
 *   formFields: Object[],
 *   fieldsLoading: boolean,
 *   onCancel: () => void,
 *   onSave: (node: Object) => void,
 * }} props
 */
export function ApproverEditDrawer({
  node,
  formFields = [],
  fieldsLoading = false,
  mainTable = '',
  onCancel,
  onSave,
}) {
  // 审批对象：1-指定人员 / 2-指定角色 / 3-发起人自选
  const [approverType, setApproverType] = useState(node.approverType || 1)
  const [members, setMembers] = useState(normalizeMembers(node.members))
  // 发起人自选类型：1-单选 / 2-多选
  const [selfSelect, setSelfSelect] = useState(node.selfSelect || 1)
  // 审批方式：1-依次审批 / 2-会签 / 3-或签
  const [strategy, setStrategy] = useState(node.strategy || 1)
  // 审批人为空处理：1-自动通过 / 2-自动拒绝 / 3-转交流程管理员 / 4-指定人员
  const [emptyHandler, setEmptyHandler] = useState(node.emptyHandler || 1)
  const [emptyMembers, setEmptyMembers] = useState(normalizeMembers(node.emptyMembers))
  // 审批人操作权限数组元素：1-拒绝 / 2-转交 / 3-加签
  const [permissions, setPermissions] = useState(node.permissions || [1])
  // 表单字段权限：选中字段时同步记录 table_key（主表 / 子表），回显兼容旧数据缺失 table_key
  const [fieldPerms, setFieldPerms] = useState(
    (node.fieldPerms || []).map((fp) => ({
      ...fp,
      table_key:
        fp.table_key || formFields.find((f) => f.field_key === fp.field)?.table_key || '',
    })),
  )

  const updateFieldPerm = (index, key, v) =>
    setFieldPerms(
      fieldPerms.map((fp, i) =>
        i === index
          ? {
              ...fp,
              [key]: v,
              // 选中字段时自动带入其所属表（主表 / 子表），供分组展示与后续精确匹配
              ...(key === 'field'
                ? { table_key: formFields.find((f) => f.field_key === v)?.table_key || '' }
                : {}),
            }
          : fp,
      ),
    )

  // 按 table_key 分组字段选项（主表 / 子表），与条件表达式「具体条件」呈现方式保持一致
  const fieldGroups = useMemo(() => {
    const groups = []
    const byTable = {}
    for (const f of formFields) {
      const tk = f.table_key || ''
      if (!byTable[tk]) {
        byTable[tk] = { tableKey: tk, fields: [] }
        groups.push(byTable[tk])
      }
      byTable[tk].fields.push(f)
    }
    return groups
  }, [formFields])

  // 分组标题：与主表名一致的为主表，其余为子表；无主表信息时直接显示表名
  const groupLabel = (tableKey) => {
    if (!tableKey) return '其他'
    return tableKey === mainTable ? `主表 - ${tableKey}` : `子表 - ${tableKey}`
  }

  // 展示步骤二「审批方式」的条件：
  // 3-发起人自选 + 2-多选；或 1-指定人员 / 2-指定角色 实际选择数量 > 1（事实多选）
  const showStrategy =
    (approverType !== 3 && members.length > 1) || (approverType === 3 && selfSelect === 2)

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
            {APPROVER_TYPE_OPTIONS.map((o) => (
              <Radio key={o.value} value={o.value}>
                {o.label}
              </Radio>
            ))}
          </Radio.Group>
          {approverType !== 3 ? ( // 3-发起人自选：自选时不展示成员选择器，改为选择类型
            <div className="mt-3">
              <PersonPicker
                modes={approverType === 2 ? [2] : [1]} // 2-指定角色：仅角色维度（2-角色 / 1-组织架构）
                checkTarget={1} // 1-人员
                value={members}
                onChange={setMembers}
                placeholder="请选择"
              />
            </div>
          ) : (
            <div className="mt-3">
              <div className="mb-1 text-sm text-gray-500">选择类型</div>
              <Radio.Group type="button" value={selfSelect} onChange={setSelfSelect}>
                {SELF_SELECT_OPTIONS.map((o) => (
                  <Radio key={o.value} value={o.value}>
                    {o.label}
                  </Radio>
                ))}
              </Radio.Group>
            </div>
          )}
        </div>
        {/* 步骤二：审批方式（仅发起人自选 + 多选 / 事实多选时展示） */}
        {showStrategy && (
          <div>
            <div className="mb-2 font-medium">审批方式</div>
            <Radio.Group value={strategy} onChange={setStrategy} direction="vertical">
              {STRATEGY_OPTIONS.map((o) => (
                <Radio key={o.value} value={o.value}>
                  {o.label}
                </Radio>
              ))}
            </Radio.Group>
          </div>
        )}
        {/* 步骤三：容错与权限 */}
        <div>
          <div className="mb-2 font-medium">容错与权限</div>
          <div className="mb-1 text-sm text-gray-500">审批人为空的处理方式</div>
          <Radio.Group value={emptyHandler} onChange={setEmptyHandler} direction="vertical">
            {EMPTY_HANDLER_OPTIONS.map((o) => (
              <Radio key={o.value} value={o.value}>
                {o.label}
              </Radio>
            ))}
          </Radio.Group>
          {emptyHandler === 4 && ( // 4-指定人员：展示指定人员选择器
            <div className="mt-3">
              <PersonPicker
                modes={[1]} // 1-组织架构
                value={emptyMembers}
                onChange={setEmptyMembers}
                placeholder="选择指定人员"
              />
            </div>
          )}
          <div className="mt-4 mb-1 text-sm text-gray-500">审批人操作权限</div>
          <Checkbox.Group value={permissions} onChange={setPermissions}>
            {PERMISSION_OPTIONS.map((o) => (
              <Checkbox key={o.value} value={o.value}>
                {o.label}
              </Checkbox>
            ))}
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
                    {fieldGroups.map((g) => (
                      <Select.OptGroup key={g.tableKey || 'other'} label={groupLabel(g.tableKey)}>
                        {g.fields.map((f) => (
                          <Select.Option key={f.field_key} value={f.field_key}>
                            {f.label || f.field_key}
                          </Select.Option>
                        ))}
                      </Select.OptGroup>
                    ))}
                  </Select>
                  <Select
                    style={{ width: 110 }}
                    value={fp.perm}
                    onChange={(v) => updateFieldPerm(i, 'perm', v)}
                  >
                    {FIELD_PERM_OPTIONS.map((o) => (
                      <Select.Option key={o.value} value={o.value}>
                        {o.label}
                      </Select.Option>
                    ))}
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
                onClick={() => setFieldPerms([...fieldPerms, { field: '', perm: 1 }])} // 新字段默认 1-隐藏
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
