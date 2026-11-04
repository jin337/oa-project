import { parseLayoutJson } from './formUtils'

/**
 * 审批抽屉表单校验失败后的统一处理：
 * 1. 把由 set_value 联动生成、但本身不可见的必填字段错误，归因到可见触发字段；
 * 2. 滚动到第一个需要处理的字段，避免用户在长抽屉中手动查找错误位置。
 *
 * @param {object} errors Arco Form.validate() reject 出的错误对象（e.errors 或 e 本身）
 * @param {object} form Arco Form 实例
 * @param {object} app 当前流程配置，需包含 form_layout_json
 */
export function handleApprovalFormValidationError(errors, form, app) {
  if (!errors || typeof errors !== 'object' || !form) return

  const layout = parseLayoutJson(app?.form_layout_json)
  const elements = layout?.elements || []
  const targetToSource = {}
  const fieldLabels = {}

  // 子表集合：table 元素的 table_key（与运行时 DynamicForm 判定口径一致）
  const subTables = new Set()
  elements.forEach((el) => {
    if (el?.element_type === 'table' && (el.table_key || el.id)) subTables.add(el.table_key || el.id)
  })

  // 映射目标定位键：带 table_name 且指向子表 → "表名.字段"（错误字段形如 表名[i].字段）；
  // 无 table_name（旧数据）或指向主表 → 纯字段名（原语义）
  const targetKey = (mapping) => {
    if (!mapping?.target) return null
    const tn = mapping.table_name
    if (tn && subTables.has(tn)) return `${tn}.${mapping.target}`
    return String(mapping.target)
  }

  elements.forEach((el) => {
    if (el.field_key) fieldLabels[el.field_key] = el.label || el.field_key
    // 子表列标签：错误字段为 表名[i].列 时用于提示文案
    if (el.element_type === 'table') {
      const tk = el.table_key || el.id
      ;(el.columns || []).forEach((c) => {
        const ck = c.dataIndex || c.field_key
        if (ck) fieldLabels[`${tk}.${ck}`] = c.label || c.title || ck
      })
    }
    const actions = el.actions || {}
    Object.values(actions).forEach((list) => {
      if (!Array.isArray(list)) return
      list.forEach((action) => {
        if (action?.action_type !== 'set_value' || !Array.isArray(action.value_mapping) || !el.field_key) return
        action.value_mapping.forEach((mapping) => {
          const key = targetKey(mapping)
          if (key) {
            targetToSource[key] = {
              sourceField: el.field_key,
              sourceLabel: el.label || el.field_key,
            }
          }
        })
      })
    })
  })

  const setObj = {}
  Object.keys(errors).forEach((field) => {
    // 错误字段归一：子表嵌套字段 table_key[3].col → table_key.col，再查归因映射
    const normalized = field.replace(/\[\d+\]/g, '')
    const source = targetToSource[field] || targetToSource[normalized]
    if (!source) return
    const targetLabel = fieldLabels[field] || fieldLabels[normalized] || normalized
    const message = `请先选择「${source.sourceLabel}」：必填项「${targetLabel}」由「${source.sourceLabel}」联动生成`
    const previousMessage = setObj[source.sourceField]?.error?.message
    setObj[source.sourceField] = {
      error: { message: previousMessage ? `${previousMessage}；${message}` : message },
    }
  })

  if (Object.keys(setObj).length) {
    form.setFields(setObj)
  }

  const firstField = Object.keys(setObj)[0] || Object.keys(errors)[0]
  if (!firstField) return
  requestAnimationFrame(() => {
    form.scrollToField?.(firstField, { behavior: 'smooth', block: 'center' })
  })
}
