import { Descriptions, Drawer, Empty, Tag } from '@arco-design/web-react'
import { ELEMENT_TYPE_OPTIONS } from 'src/config/app.js'

const ACTION_TRIGGERS = [
  { key: 'on_mount', label: '初始化触发' },
  { key: 'on_change', label: '值改变触发' },
  { key: 'on_blur', label: '失焦触发' },
]

const ACTION_TYPE_LABELS = {
  set_value: '直接赋值',
  fetch_and_fill: '请求并填充',
  js_event: 'JS事件',
  sum_table: '子表汇总',
}

const isEmptyValue = (value) =>
  value == null ||
  value === '' ||
  (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0) ||
  (Array.isArray(value) && value.length === 0)

const text = (value) => (isEmptyValue(value) ? '-' : String(value))

const boolText = (value) => (value ? '是' : '否')

const typeLabel = (value) =>
  ELEMENT_TYPE_OPTIONS.find((item) => item.value === value)?.label || value || '-'

const dataSourceTypeLabel = (value) => {
  if (value === 'json') return '静态数据'
  if (value === 'api') return '接口数据'
  return text(value)
}

const actionTypeLabel = (value) => ACTION_TYPE_LABELS[value] || text(value)

const jsonText = (value) => {
  if (isEmptyValue(value)) return '-'
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

const JsonValue = ({ value }) => (
  <pre className="m-0 max-h-56 max-w-full overflow-auto rounded bg-gray-50 p-2 text-xs leading-5 break-all whitespace-pre-wrap text-gray-700">
    {jsonText(value)}
  </pre>
)

const CodeValue = ({ value }) => (
  <pre className="m-0 max-h-56 max-w-full overflow-auto rounded bg-gray-50 p-2 text-xs leading-5 break-all whitespace-pre-wrap text-gray-700">
    {isEmptyValue(value) ? '-' : String(value)}
  </pre>
)

const detailLabelStyle = { width: 110, verticalAlign: 'top' }
const detailValueStyle = { minWidth: 0, verticalAlign: 'top' }

const DetailSection = ({ title, children }) => (
  <div>
    <div className="mb-2 text-sm font-medium text-gray-700">{title}</div>
    {children}
  </div>
)

const ElementDetailDrawer = ({ visible, element, onClose }) => {
  const title = element
    ? `${element.label || element.name || element.field_key || '字段'} - 字段详情`
    : '字段详情'

  const dataSource = element?.data_source
  const hasDataSource = dataSource && !isEmptyValue(dataSource)
  const hasActions =
    typeof element?.actions === 'object' &&
    ACTION_TRIGGERS.some(
      (trigger) =>
        Array.isArray(element.actions?.[trigger.key]) && element.actions[trigger.key].length > 0,
    )

  const baseItems = element
    ? [
        { label: '物理表', value: text(element.table_key) },
        { label: '对应字段', value: text(element.field_key) },
        { label: '名称', value: text(element.label || element.name) },
        {
          label: '元素类型',
          value: element.element_type ? (
            <Tag size="small" color="arcoblue">
              {typeLabel(element.element_type)}
            </Tag>
          ) : (
            '-'
          ),
        },
        { label: '默认值', value: text(element.default_value) },
        { label: '占位提示', value: text(element.placeholder) },
      ]
    : []

  const validationItems = element
    ? [
        { label: '是否必填', value: boolText(Boolean(element.required)) },
        { label: '列表项显示', value: boolText(Boolean(element.visibility?.list ?? true)) },
        { label: '搜索项显示', value: boolText(Boolean(element.visibility?.search ?? false)) },
        { label: '校验规则', value: text(element.validation_rule), span: 3 },
        { label: '错误提示', value: text(element.validation_message), span: 3 },
      ]
    : []

  const dynamicItems = element
    ? [
        { label: '动态显隐', value: text(element.dynamic_states?.visible_if) },
        { label: '动态禁用/只读', value: text(element.dynamic_states?.disabled_if) },
      ]
    : []

  const dataSourceItems = !hasDataSource
    ? [{ label: '数据类型', value: '-' }]
    : dataSource.type === 'json'
      ? [
          { label: '数据类型', value: dataSourceTypeLabel(dataSource.type) },
          { label: '数据', value: <JsonValue value={dataSource.options} />, span: 2 },
        ]
      : dataSource.type === 'api'
        ? [
            { label: '数据类型', value: dataSourceTypeLabel(dataSource.type) },
            { label: '是否引用', value: boolText(dataSource.api_ref === 1) },
            { label: '接口地址', value: text(dataSource.url) },
            { label: '请求方法', value: text(dataSource.method) },
            {
              label: '请求参数',
              value: <JsonValue value={dataSource.params} />,
              span: 2,
            },
            { label: '显示标签', value: text(dataSource.label) },
            { label: '对应值', value: text(dataSource.value_field) },
          ]
        : [{ label: '数据源配置', value: <JsonValue value={dataSource} />, span: 2 }]

  const actionItems = []
  if (hasActions) {
    ACTION_TRIGGERS.forEach((trigger) => {
      const actions = element.actions?.[trigger.key]
      if (!Array.isArray(actions) || !actions.length) return

      actionItems.push({
        label: '触发方式',
        value: (
          <Tag size="small" color="gray">
            {trigger.label}
          </Tag>
        ),
        span: 2,
      })

      actions.forEach((action) => {
        actionItems.push({
          label: '动作类型',
          value: actionTypeLabel(action.action_type),
          span: 2,
        })

        if (action.action_type === 'set_value') {
          actionItems.push({
            label: '赋值映射',
            value: <JsonValue value={action.value_mapping} />,
            span: 2,
          })
          return
        }

        if (action.action_type === 'fetch_and_fill') {
          actionItems.push(
            { label: '是否引用', value: boolText(action.api_ref === 1), span: 2 },
            { label: '接口地址', value: text(action.api_url) },
            { label: '请求方法', value: text(action.method) },
            { label: '请求参数', value: <JsonValue value={action.params} />, span: 2 },
            { label: '目标字段', value: <JsonValue value={action.target_mapping} />, span: 2 },
          )
          return
        }

        if (action.action_type === 'js_event') {
          actionItems.push({
            label: 'JS 脚本',
            value: <CodeValue value={action.script} />,
            span: 2,
          })
          return
        }

        if (action.action_type === 'sum_table') {
          actionItems.push({
            label: '目标字段',
            value: text(action.target_field),
            span: 2,
          })
          return
        }

        actionItems.push({
          label: '其他配置',
          value: <JsonValue value={action} />,
          span: 2,
        })
      })
    })
  }

  return (
    <Drawer
      title={title}
      visible={visible}
      width="60%"
      footer={null}
      onCancel={onClose}
      unmountOnExit
    >
      {!element ? (
        <Empty description="未找到字段配置" />
      ) : (
        <div className="flex flex-col gap-5 pb-4">
          <DetailSection title="基础信息">
            <Descriptions
              border
              size="small"
              column={2}
              labelStyle={detailLabelStyle}
              valueStyle={detailValueStyle}
              data={baseItems}
            />
          </DetailSection>

          <DetailSection title="校验与显示">
            <Descriptions
              border
              size="small"
              column={3}
              labelStyle={detailLabelStyle}
              valueStyle={detailValueStyle}
              data={validationItems}
            />
          </DetailSection>

          <DetailSection title="动态状态">
            <Descriptions
              border
              size="small"
              column={1}
              labelStyle={detailLabelStyle}
              valueStyle={detailValueStyle}
              data={dynamicItems}
            />
          </DetailSection>

          <DetailSection title="数据源">
            <Descriptions
              border
              size="small"
              column={2}
              labelStyle={detailLabelStyle}
              valueStyle={detailValueStyle}
              data={dataSourceItems}
            />
          </DetailSection>

          <DetailSection title="事件与动作">
            {hasActions ? (
              <Descriptions
                border
                size="small"
                column={2}
                labelStyle={detailLabelStyle}
                valueStyle={detailValueStyle}
                data={actionItems}
              />
            ) : (
              <div className="rounded border border-gray-200 px-3 py-3 text-xs text-gray-500">
                暂无事件与动作
              </div>
            )}
          </DetailSection>
        </div>
      )}
    </Drawer>
  )
}

export default ElementDetailDrawer
