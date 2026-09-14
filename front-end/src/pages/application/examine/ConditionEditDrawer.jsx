import { useState } from 'react'
import { Button, Drawer, Input, Radio, Select } from '@arco-design/web-react'
import { IconClose, IconPlus } from '@arco-design/web-react/icon'
import { OPERATOR_OPTIONS, RELATION_OPTIONS } from 'src/pages/application/examine/constants'

/**
 * 条件分支设置抽屉：配置条件关系与具体条件表达式（字段来源于应用表单元素列表）。
 * @param {{
 *   node: Object,
 *   branch: Object,
 *   formFields: Object[],
 *   fieldsLoading: boolean,
 *   onCancel: () => void,
 *   onSave: (node: Object, branch: Object, payload: Object) => void,
 * }} props
 */
export function ConditionEditDrawer({
  node,
  branch,
  formFields = [],
  fieldsLoading = false,
  onCancel,
  onSave,
}) {
  // 条件关系：1-且(AND) / 2-或(OR)
  const [relation, setRelation] = useState(node.relation || 1)
  // 默认条件行：formFields 有数据时取第一个字段的 field_key，否则为空字符串
  const defaultField = formFields[0]?.field_key || ''
  // 条件规则列表：operator 为数字枚举（1-大于 / 2-小于 / 3-等于 / 4-不等于 / 5-包含 / 6-不包含）
  const [rules, setRules] = useState(
    branch.rules?.length ? branch.rules : [{ field: defaultField, operator: 3, value: '' }],
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
                  setRules([...rules, { field: defaultField, operator: 3, value: '' }]) // 3-等于
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
