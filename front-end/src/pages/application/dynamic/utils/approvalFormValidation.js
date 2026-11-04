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

  elements.forEach((el) => {
    if (el.field_key) fieldLabels[el.field_key] = el.label || el.field_key
    const actions = el.actions || {}
    Object.values(actions).forEach((list) => {
      if (!Array.isArray(list)) return
      list.forEach((action) => {
        if (action?.action_type !== 'set_value' || !Array.isArray(action.value_mapping) || !el.field_key) return
        action.value_mapping.forEach((mapping) => {
          if (mapping?.target) {
            targetToSource[mapping.target] = {
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
    const source = targetToSource[field]
    if (!source) return
    const targetLabel = fieldLabels[field] || field
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
