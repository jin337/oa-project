import { useMemo, useState } from 'react'
import { Button, Drawer, Input, Radio, Select } from '@arco-design/web-react'
import { IconClose, IconPlus } from '@arco-design/web-react/icon'
import { OPERATOR_OPTIONS, RELATION_OPTIONS } from 'src/pages/application/constants'

/**
 * 条件分支设置抽屉：配置条件关系与具体条件表达式（字段来源于应用表单元素列表）。
 * 字段按所属表（table_key：主表 / 子表）分组展示，条件规则中记录 table_key 以区分字段来源表。
 * @param {{
 *   node: Object,
 *   branch: Object,
 *   formFields: Object[],        // 应用表单元素列表（含 field_key / label / table_key）
 *   fieldsLoading: boolean,
 *   mainTable: string,           // 应用主表名（table_name），用于分组标题区分主表/子表
 *   onCancel: () => void,
 *   onSave: (node: Object, branch: Object, payload: Object) => void,
 * }} props
 */
export function ConditionEditDrawer({
  node,
  branch,
  formFields = [],
  fieldsLoading = false,
  mainTable = '',
  onCancel,
  onSave,
}) {
  // 条件关系：1-且(AND) / 2-或(OR)
  const [relation, setRelation] = useState(node.relation || 1)
  // 默认条件行：formFields 有数据时取第一个字段的 field_key / table_key，否则为空
  const defaultField = formFields[0]?.field_key || ''
  const defaultTable = formFields[0]?.table_key || ''
  // 条件规则列表：operator 为数字枚举（1-大于 / 2-小于 / 3-等于 / 4-不等于 / 5-包含 / 6-不包含）
  // 每条规则含 table_key：记录该字段所属表（主表 / 子表），编辑回显时兼容旧数据缺失 table_key 的情况
  const [rules, setRules] = useState(() => {
    if (branch.rules?.length) {
      return branch.rules.map((r) => ({
        ...r,
        table_key:
          r.table_key || formFields.find((f) => f.field_key === r.field)?.table_key || '',
      }))
    }
    return [{ field: defaultField, table_key: defaultTable, operator: 3, value: '' }] // 3-等于
  })

  const updateRule = (index, key, v) =>
    setRules(rules.map((r, i) => (i === index ? { ...r, [key]: v } : r)))

  // 字段选择：同步更新 field 与对应 table_key（选中字段后自动带入其所属表）
  const updateRuleField = (index, fieldKey) => {
    const f = formFields.find((x) => x.field_key === fieldKey)
    setRules(
      rules.map((r, i) =>
        i === index ? { ...r, field: fieldKey, table_key: f?.table_key || '' } : r,
      ),
    )
  }

  // 按 table_key 分组字段选项，供下拉框分组展示（区分主表 / 子表）
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

  return (
    <Drawer
      width={600}
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
            {RELATION_OPTIONS.map((o) => (
              <Radio key={o.value} value={o.value}>
                {o.label}
              </Radio>
            ))}
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
                    style={{ width: 160 }}
                    value={r.field}
                    placeholder="选择字段"
                    onChange={(v) => updateRuleField(i, v)}
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
                  setRules([
                    ...rules,
                    { field: defaultField, table_key: defaultTable, operator: 3, value: '' }, // 3-等于
                  ])
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
