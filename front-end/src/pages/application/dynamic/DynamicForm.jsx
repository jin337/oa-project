import {
  Button,
  Checkbox,
  DatePicker,
  Divider,
  Empty,
  Form,
  Grid,
  Input,
  InputNumber,
  Radio,
  Select,
  Switch,
  Table,
  Tag,
  TimePicker,
  Upload,
} from '@arco-design/web-react'
import {
  IconDelete,
  IconDragArrow,
  IconPlus,
} from '@arco-design/web-react/icon'
import { memo, useMemo } from 'react'
import { ELEMENT_TYPE_OPTIONS } from 'src/config/app.js'

const FormItem = Form.Item
const FormList = Form.List
const Row = Grid.Row
const Col = Grid.Col

// ==================== 常量与全局配置 ====================

// 元素宽度占比（24 栅格，短标签适配按钮式 Radio）
const WIDTH_OPTIONS = [
  { label: '100%', value: 24, tip: '整行' },
  { label: '50%', value: 12, tip: '1/2' },
  { label: '33%', value: 8, tip: '1/3' },
  { label: '25%', value: 6, tip: '1/4' },
]

// 画布模式（move-*）下依赖选项组件的统一预览占位选项（不解析真实 data_source）
const PREVIEW_OPTIONS = [
  { label: '选项一', value: 'option1' },
  { label: '选项二', value: 'option2' },
]

// 根据类型获取中文标签
const getTypeLabel = (type) => ELEMENT_TYPE_OPTIONS.find((c) => c.value === type)?.label || type

// 全局表单配置默认值（垂直/水平布局、标签宽度、标签对齐）
export const DEFAULT_FORM_CONFIG = {
  layout: 'horizontal', // vertical | horizontal
  labelWidth: 100,
  labelAlign: 'right', // left | right
}

// 无字段标签的组件类型（画布 FormItem / 动态表单中隐藏 label 并走特殊布局，如分割线/表格）
export const NO_LABEL_TYPES = ['divider', 'table']

// ==================== 工具函数与解析逻辑 ====================

// 解析后端布局 JSON（form_layout_json / detail_layout_json 均为 { formConfig, elements } 结构）
export const parseLayoutJson = (raw) => {
  if (!raw) return null
  try {
    return {
      formConfig: { ...DEFAULT_FORM_CONFIG, ...(raw.formConfig || {}) },
      elements: Array.isArray(raw.elements) ? raw.elements : [],
    }
  } catch (e) {
    return null
  }
}

/** 从元素 data_source 中提取静态选项（json 类型），供 select/radio/checkbox 等使用 */
export const getStaticOptions = (el) => {
  const ds = el?.data_source
  if (ds?.type === 'json' && Array.isArray(ds.options)) {
    return ds.options.filter((o) => o && (o.label || o.value))
  }
  return []
}

/**
 * 常规表单元素的通用属性面板（元素类型 / 字段名称 / 宽度占比）
 * 由常规控件的 renderSettings 或 renderElementSettings 分发调用。
 */
export const renderCommonSettings = ({ selectedElement, updateSelectedElement }) => (
  <>
    <div>
      <div className="mb-2 text-sm text-gray-600">元素类型</div>
      <Tag color="arcoblue" size="medium">
        {getTypeLabel(selectedElement.element_type)}
      </Tag>
    </div>
    <div>
      <div className="mb-2 text-sm text-gray-600">字段名称</div>
      <Input
        value={selectedElement.label}
        onChange={(v) => updateSelectedElement({ label: v })}
        placeholder="请输入字段名称"
      />
    </div>
    <div>
      <div className="mb-2 text-sm text-gray-600">宽度占比</div>
      <Radio.Group
        type="button"
        value={selectedElement.width}
        onChange={(v) => updateSelectedElement({ width: v })}
      >
        {WIDTH_OPTIONS.map((opt) => (
          <Radio key={opt.value} value={opt.value}>
            {opt.tip}
          </Radio>
        ))}
      </Radio.Group>
    </div>
  </>
)

// ==================== 表格列配置工具 ====================

/** 生成表格列（新增列自动继承当前关联子表） */
export const genColumn = (cols, tableKey) => ({
  id: `col_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
  table_key: tableKey || '',
  title: `列${(cols || []).length + 1}`,
  dataIndex: null,
})

/** 新增列：通过 updateSelectedElementColumns 在选中表格元素上追加一列 */
export const addColumn = (updateSelectedElementColumns, tableKey) =>
  updateSelectedElementColumns((cols) => [...cols, genColumn(cols, tableKey)])

/** 删除列 */
export const removeColumn = (updateSelectedElementColumns, colId) =>
  updateSelectedElementColumns((cols) => cols.filter((c) => c.id !== colId))

/** 更新列（局部 patch） */
export const updateColumn = (updateSelectedElementColumns, colId, patch) =>
  updateSelectedElementColumns((cols) => cols.map((c) => (c.id === colId ? { ...c, ...patch } : c)))

/** 判断是否为基础组件（不显示通用字段名称/宽度等配置） */
export const isBaseElement = (element_type) => Boolean(BASE_ELEMENT_CONFIGS[element_type])

/** 判断是否为无字段标签元素（画布中不显示 label；upload 等字段型基础组件不受影响） */
export const isNoLabelElement = (element_type) => NO_LABEL_TYPES.includes(element_type)

/** 获取基础组件配置（含 renderPreview / renderSettings） */
export const getBaseElementConfig = (element_type) => BASE_ELEMENT_CONFIGS[element_type] || null


// ==================== 渲染配置中心 ====================

/**
 * 表格组件（table）字段：基于 Arco Form.List 的多行数据录入表格。
 * - Form.List field 绑定 el.table_key，行数据以 table_key[index].colKey 嵌套路径注册到 Form store
 * - 校验规则挂在 Form.List 上（整体至少一行 + 必填列非空），错误通过 useFormState 读取并显示在表格底部
 * - form / move-form：可编辑模式，显示"新增"按钮与行内"删除"按钮，行内控件可交互
 * - detail：详情只读模式，行内单元格渲染为纯文本（ReadonlyValue，空值 '-'）
 * - move-detail：画布只读预览，隐藏操作列与新增按钮，行内控件保持禁用态预览
 */
const TableElementField = ({ el, pageType }) => {
  // 可编辑：实际填写（form）与画布表单页（move-form）
  const isEditable = pageType === 'form' || pageType === 'move-form'
  // 详情只读：仅真实详情页（detail）渲染纯文本；画布 move-detail 保持禁用控件预览
  const isReadonlyText = pageType === 'detail'
  // Form.List 字段名：优先关联子表名（table_key），其次元素 id 兜底
  const listField = el.table_key || el.id || 'table'
  const { form } = Form.useFormContext()
  // 订阅该字段的表单状态（含校验错误），错误变化时自动重渲染
  const formState = Form.useFormState(listField, form)
  // 提取错误文本：Arco 返回的错误项为 b-validate 错误对象（含 message/type/value 等键），
  // 需安全提取 message 字符串；同时兼容纯字符串结构的错误项，避免直接渲染对象触发 React 报错
  const errorMessage = (formState?.errors || [])
    .flat()
    .filter(Boolean)
    .map((e) => (typeof e === 'string' ? e : e?.message))
    .find(Boolean)

  // 表格校验规则：整体必填（至少一行有效数据）+ 必填列非空
  // validateTrigger 设为 'submit'：字段级 onChange/onBlur 校验被过滤，仅在全局 form.validate()（如提交）时触发，
  // 避免用户填写过程中错误提示实时弹出；校验产生的错误在下次 validate 前持续保留展示
  const needValidate = el.required || (el.columns || []).some((c) => c.required)
  const rules = [
    {
      validateTrigger: 'submit',
      validator: (val, callback) => {
        const rows = Array.isArray(val) ? val : []
        if (el.required && rows.length === 0) {
          callback(`${el.label || '表格'}至少需要添加一行数据`)
          return
        }
        const requiredCols = (el.columns || []).filter((c) => c.required)
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i]
          for (const col of requiredCols) {
            const colKey = col.dataIndex || col.field_key
            if (colKey == null) continue
            const cell = row?.[colKey]
            if (cell === undefined || cell === null || cell === '') {
              callback(`第 ${i + 1} 行的 ${col.title || '字段'} 不能为空`)
              return
            }
          }
        }
        callback()
      },
    },
  ]

  return (
    // initialValue：可编辑模式下默认初始化一行空记录（{}），挂载/重置（resetFields）后表格至少有一行可填写
    <FormList
      field={listField}
      rules={needValidate ? rules : undefined}
      noStyle
      initialValue={isEditable ? [{}] : undefined}
    >
      {(fields, { add, remove }) => {
        const columns = (el.columns || []).map((col, i) => {
          const colKey = col.dataIndex || col.field_key || `col_${i + 1}`
          const isDetail = pageType === 'detail'
          return {
            title:
              (
                <>
                  {col.required && !isDetail ? (
                    <span className="mr-1 text-[rgb(var(--danger-6))]">&#x2A;</span>
                  ) : (
                    ''
                  )}
                  {col.title}
                </>
              ) || `列${i + 1}`,
            dataIndex: colKey,
            // 按列配置的 element_type 从 renderPreviewConfig 映射渲染表单控件；
            // 行内控件由 FormItem 绑定嵌套字段路径（table_key[index].colKey）自动注入 value/onChange/disabled；
            // 注意：field 必须为单层字符串路径（Arco Form.List 的 getItemKey 会对 field 调用字符串 replace，
            // 传入数组 [field, colKey] 会触发 "fieldKey.replace is not a function" 错误）
            render: (cellValue, record, index) => {
              const renderFn = renderPreviewConfig[col.element_type]
              if (!renderFn) return <span>{cellValue ?? ''}</span>
              const field = fields[index]?.field
              if (!field) {
                // 行未注册到 Form store（如画布空态）：可编辑渲染可交互控件，详情渲染纯文本
                return isEditable ? (
                  renderFn(col, 'form')
                ) : isReadonlyText ? (
                  <ReadonlyValue value={cellValue} elementType={col.element_type} />
                ) : (
                  renderFn(col, undefined)
                )
              }
              return (
                <FormItem field={`${field}.${colKey}`} noStyle>
                  {isEditable ? (
                    renderFn(col, 'form')
                  ) : isReadonlyText ? (
                    <ReadonlyValue elementType={col.element_type} />
                  ) : (
                    renderFn(col, undefined)
                  )}
                </FormItem>
              )
            },
          }
        })
        // 操作列：删除当前行（Form.List remove）
        const action = {
          key: 'action',
          title: '操作',
          width: 60,
          render: (_, __, index) => (
            <Button size="mini" status="danger" onClick={() => remove(index)}>
              删除
            </Button>
          ),
        }
        // 固定的"序号"列：独立于用户配置列与操作列，渲染当前行行号（index + 1）
        const indexColumn = {
          key: 'index',
          title: '序号',
          width: 62,
          align: 'center',
          render: (_, __, index) => index + 1,
        }
        // 可编辑时追加操作列；只读时不追加
        const finalColumns = [indexColumn, ...(isEditable ? [...columns, action] : columns)]

        return columns.length ? (
          <>
            <Table
              key={el.table_key}
              size="small"
              rowKey={(record) => record.key}
              border
              pagination={false}
              columns={finalColumns}
              data={fields}
            />
            {isEditable && (
              <div className="mt-2 flex justify-between">
                {/* 表格错误提示：显示 Form.List 校验错误（整体必填 / 必填列非空） */}
                <div className="arco-form-message">{errorMessage || ''}</div>
                <Button size="mini" type="primary" icon={<IconPlus />} onClick={() => add({})}>
                  新增
                </Button>
              </div>
            )}
          </>
        ) : (
          <div className="rounded border border-dashed border-gray-200 px-2 py-3 text-center text-xs text-gray-400">
            表格（未配置列）
          </div>
        )
      }}
    </FormList>
  )
}

/**
 * 布局设计器 —— 基础组件配置中心
 *
 * 集中维护基础组件（不依赖后端表单元素、始终显示在左侧"基础"分组）的：
 *   - meta：元数据（拖拽标识、类型、标签、默认宽度、默认属性）
 *   - renderPreview(el, pageType)：画布预览渲染（所有表单控件渲染的统一入口）
 *   - renderSettings(ctx)：右侧属性面板渲染（ctx 由 LayoutManage 注入组件状态与回调）
 *
 * 新增基础组件只需在此对象中追加一项，左侧组件库、画布预览、属性面板自动生效。
 */
export const BASE_ELEMENT_CONFIGS = {
  divider: {
    meta: {
      key: 'base_divider',
      element_type: 'divider',
      label: '分割线',
      width: 24,
      defaultProps: { orientation: 'center', text: '分割线' },
    },
    renderPreview: (el) =>
      el.text ? <Divider orientation={el.orientation || 'center'}>{el.text}</Divider> : <Divider />,
    renderSettings: ({ selectedElement, updateSelectedElement }) => (
      <>
        <div>
          <div className="mb-2 text-sm text-gray-600">元素类型</div>
          <Tag color="arcoblue" size="medium">
            分割线
          </Tag>
        </div>
        <div>
          <div className="mb-2 text-sm text-gray-600">分割线文字</div>
          <Input
            value={selectedElement.text || ''}
            onChange={(v) => updateSelectedElement({ text: v })}
            placeholder="可选，留空为纯分割线"
          />
        </div>
        <div>
          <div className="mb-2 text-sm text-gray-600">文字位置</div>
          <Radio.Group
            type="button"
            value={selectedElement.orientation || 'center'}
            onChange={(v) => updateSelectedElement({ orientation: v })}
            options={[
              { label: '左', value: 'left' },
              { label: '中', value: 'center' },
              { label: '右', value: 'right' },
            ]}
          />
        </div>
      </>
    ),
  },

  table: {
    meta: {
      key: 'base_table',
      element_type: 'table',
      label: '表格',
      width: 24,
      defaultProps: { columns: [], table_key: '', editable: true },
    },
    renderPreview: (el, pageType) => <TableElementField el={el} pageType={pageType} />,
    renderSettings: ({
      selectedElement,
      appTables,
      tableFieldsMap,
      fieldLoadingKeys,
      handleTableKeyChange,
      handleColumnFieldChange,
      updateSelectedElement,
      updateSelectedElementColumns,
    }) => (
      <>
        <div>
          <div className="mb-2 text-sm text-gray-600">元素类型</div>
          <Tag color="arcoblue" size="medium">
            表格
          </Tag>
        </div>
        <div className="text-sm text-gray-600">关联子表</div>
        <Select
          size="small"
          placeholder="选择关联子表"
          value={selectedElement.table_key || undefined}
          onChange={handleTableKeyChange}
          options={appTables.subTables.map((tb) => ({ label: tb, value: tb }))}
        />
        <div className="text-sm text-gray-600">列配置</div>
        {(selectedElement.columns || []).map((col, idx) => (
          <div key={col.id || `col_${idx}`} className="flex items-center justify-between gap-1">
            <div className="whitespace-nowrap text-gray-500">列 {idx + 1}</div>
            <Select
              size="small"
              placeholder={selectedElement.table_key ? '选择字段' : '请先选择关联子表'}
              value={col.dataIndex || undefined}
              disabled={!selectedElement.table_key}
              loading={Boolean(fieldLoadingKeys[selectedElement.table_key])}
              options={(tableFieldsMap[selectedElement.table_key] || []).map((f) => ({
                label: f.label || f.name || f.field_key,
                value: f.field_key || f.name || String(f.id),
              }))}
              onChange={(v) => handleColumnFieldChange(col.id, selectedElement.table_key, v)}
            />
            <Button
              size="small"
              status="danger"
              icon={<IconDelete />}
              onClick={() => removeColumn(updateSelectedElementColumns, col.id)}
            />
          </div>
        ))}
        <Button
          size="mini"
          icon={<IconPlus />}
          disabled={!selectedElement.table_key}
          onClick={() => addColumn(updateSelectedElementColumns, selectedElement.table_key)}
        >
          添加列
        </Button>
      </>
    ),
  },
}

/**
 * 从配置派生左侧组件库"基础"分组的 items（保持原有数据结构，供拖拽使用）
 */
export const BASE_LAYOUT_ELEMENTS = Object.values(BASE_ELEMENT_CONFIGS).map(({ meta }) => ({
  key: meta.key,
  element_type: meta.element_type,
  label: meta.label,
  field_key: '',
  table_key: '',
  width: meta.width,
  required: false,
  ...(meta.defaultProps || {}),
}))

/**
 * 组件统一渲染配置中心：每个 element_type 一个配置对象，
 * 统一通过 renderPreview(el, pageType) 承担所有表单控件的渲染：
 *   - pageType 为 'form' 时控件可交互（不添加 disabled）
 *   - pageType 为 'detail' / 'move-form' / 'move-detail' 时控件禁用
 *   - 画布模式（move-*）下依赖选项的组件（select/radio/checkbox）不解析 data_source，
 *     统一硬编码"选项一 / 选项二"作为预览占位符
 */
export const ELEMENT_RENDER_CONFIG = {
  // 基础组件：直接复用 BASE_ELEMENT_CONFIGS 中对应类型的配置，保持单一数据源
  ...BASE_ELEMENT_CONFIGS,
  input: {
    renderPreview: (el) => <Input placeholder={el.placeholder || undefined} />,
  },
  textarea: {
    renderPreview: (el) => (
      <Input.TextArea autoSize={{ minRows: 2 }} placeholder={el.placeholder || undefined} />
    ),
  },
  number: {
    renderPreview: (el) => (
      <InputNumber style={{ width: '100%' }} placeholder={el.placeholder || undefined} />
    ),
  },
  select: {
    renderPreview: (el, pageType) => {
      // 画布模式（move-*）：统一硬编码预览选项，不解析 data_source
      if (pageType?.startsWith('move-')) {
        return (
          <Select
            style={{ width: '100%' }}
            placeholder={el.placeholder || '请选择'}
            options={PREVIEW_OPTIONS}
          />
        )
      }
      const options = getStaticOptions(el)
      return (
        <Select
          style={{ width: '100%' }}
          options={options.length ? options : undefined}
          placeholder={el.placeholder || '请选择'}
        />
      )
    },
  },
  radio: {
    renderPreview: (el, pageType) => {
      // 画布模式（move-*）：统一硬编码预览选项，不解析 data_source
      if (pageType?.startsWith('move-')) {
        return <Radio.Group style={{ width: '100%' }} options={PREVIEW_OPTIONS} />
      }
      const options = getStaticOptions(el)
      return (
        <Radio.Group style={{ width: '100%' }} options={options.length ? options : undefined} />
      )
    },
  },
  checkbox: {
    renderPreview: (el, pageType) => {
      // 画布模式（move-*）：统一硬编码预览选项，不解析 data_source
      if (pageType?.startsWith('move-')) {
        return <Checkbox.Group style={{ width: '100%' }} options={PREVIEW_OPTIONS} />
      }
      const options = getStaticOptions(el)
      return (
        <Checkbox.Group style={{ width: '100%' }} options={options.length ? options : undefined} />
      )
    },
  },
  date: {
    renderPreview: (el) => (
      <DatePicker style={{ width: '100%' }} placeholder={el.placeholder || undefined} />
    ),
  },
  datepicker: {
    renderPreview: (el) => (
      <DatePicker style={{ width: '100%' }} placeholder={el.placeholder || undefined} />
    ),
  },
  time: {
    renderPreview: (el) => (
      <TimePicker style={{ width: '100%' }} placeholder={el.placeholder || undefined} />
    ),
  },
  timepicker: {
    renderPreview: (el) => (
      <TimePicker style={{ width: '100%' }} placeholder={el.placeholder || undefined} />
    ),
  },
  switch: {
    renderPreview: (el) => <Switch />,
  },
  upload: {
    renderPreview: (el) => <Upload action="/" tip={el.placeholder || undefined} />,
  },
}

/**
 * 表单控件渲染映射（element_type → 渲染函数），由统一配置中心派生。
 * 所有表单控件（设计器预览、详情只读、实际表单填写）统一经 renderPreview(el, pageType) 渲染。
 */
export const renderPreviewConfig = Object.fromEntries(
  Object.entries(ELEMENT_RENDER_CONFIG).map(([key, cfg]) => [key, cfg.renderPreview]),
)

/**
 * 元素属性面板总分发：基础组件 → 专属 renderSettings；常规控件 → 通用属性面板
 * LayoutManage 右侧"元素属性"Tab 统一调用此函数，无需再关心具体类型。
 */
export const renderElementSettings = (el, ctx) => {
  const baseCfg = getBaseElementConfig(el.element_type)
  if (baseCfg?.renderSettings) return baseCfg.renderSettings(ctx)
  return renderCommonSettings(ctx)
}

// ==================== 画布/常规表单渲染辅助 ====================

/** 时间/日期相关元素类型（含 datepicker/timepicker 别名） */
export const TIME_ELEMENT_TYPES = ['date', 'datepicker', 'datetime', 'time', 'timepicker']

// 数值补零
const pad2 = (n) => String(n).padStart(2, '0')

/**
 * 将时间值格式化为标准可读格式（按元素类型决定粒度）：
 * - date / datepicker → YYYY-MM-DD
 * - time / timepicker → HH:mm:ss
 * - datetime         → YYYY-MM-DD HH:mm:ss
 * 兼容三种输入形态：ISO/带格式字符串、13 位毫秒时间戳、10 位秒时间戳；
 * 已是标准日期开头（YYYY-MM-DD）的字符串直接截取，避免二次解析引发的时区偏移；
 * 无法解析的值原样返回。
 * @param {*} value         时间值
 * @param {string} elementType 元素类型（date/datetime/time 等）
 * @param {*} emptyValue    空值（null/undefined/''）时的返回值：
 *                          展示场景默认 '-'；提交场景传原值（value）实现空值透传，避免污染数据
 */
export function formatTimeValue(value, elementType, emptyValue = '-') {
  if (value == null || value === '') return emptyValue
  const raw = String(value)
  // 已是标准日期开头（YYYY-MM-DD）：按需截取，避免 new Date 按 UTC 解析导致日期偏移一天
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    if (elementType === 'date' || elementType === 'datepicker') return raw.slice(0, 10)
    return raw.slice(0, 19).replace('T', ' ')
  }
  // 数字时间戳：13 位毫秒 / 10 位秒
  let date
  if (typeof value === 'number' || /^\d+$/.test(raw)) {
    const num = Number(value)
    date = new Date(num > 1e12 ? num : num * 1000)
  } else {
    date = new Date(value)
  }
  if (Number.isNaN(date.getTime())) return raw
  const y = date.getFullYear()
  const mo = pad2(date.getMonth() + 1)
  const d = pad2(date.getDate())
  if (elementType === 'date' || elementType === 'datepicker') return `${y}-${mo}-${d}`
  const h = pad2(date.getHours())
  const mi = pad2(date.getMinutes())
  const s = pad2(date.getSeconds())
  if (elementType === 'time' || elementType === 'timepicker') return `${h}:${mi}:${s}`
  return `${y}-${mo}-${d} ${h}:${mi}:${s}`
}

/**
 * 详情只读模式（pageType='detail'）下的纯文本展示组件：
 * 作为 FormItem 单子元素接收 Arco 注入的 value，直接输出数据值（数组值以 ", " 连接），空值显示 '-'。
 * elementType 为时间/日期类型时，value 经 formatTimeValue 格式化为标准可读的日期/时间字符串。
 */
const ReadonlyValue = ({ value, elementType }) => {
  let text
  if (value == null || value === '') {
    text = '-'
  } else if (TIME_ELEMENT_TYPES.includes(elementType)) {
    text = formatTimeValue(value, elementType)
  } else if (Array.isArray(value)) {
    text = value.join(', ')
  } else {
    text = String(value)
  }
  return <span className="break-all whitespace-pre-wrap">{text}</span>
}

/**
 * 渲染单个表单控件项（标签 / 栅格 / 校验规则 / 控件），画布与常规模式共用。
 * @param {object} el   布局元素
 * @param {object} ctx  渲染上下文 { isHorizontal, formConfig, pageType, isMoveMode }
 */
const renderFormItemElement = (el, ctx) => {
  const { isHorizontal, formConfig, pageType, isMoveMode } = ctx
  const noLabel = isNoLabelElement(el.element_type)
  const isTableElement = el.element_type === 'table'
  const isFormMode = pageType === 'form'
  const isDetailMode = pageType === 'detail'

  // 仅在水平模式下计算栅格/Flex 布局（无标签元素按宽度分配，常规元素按全局标签宽度）
  let labelCol
  let wrapperCol
  if (isHorizontal) {
    if (noLabel) {
      labelCol = { span: 24 - el.width }
      wrapperCol = { span: el.width }
    } else {
      labelCol = { style: { flexBasis: formConfig.labelWidth } }
      wrapperCol = { style: { flexBasis: `calc(100% - ${formConfig.labelWidth}px)` } }
    }
  }

  // 必填判断：画布模式下无标签元素也参与必填星号；
  // 常规模式下无标签元素（分割线/表格）不参与必填——表格元素例外（支持整体/列必填校验）
  const isRequired = isMoveMode
    ? Boolean(el.required)
    : Boolean(el.required) && (!noLabel || isTableElement)

  // 校验规则：表格元素校验移交给内部 Form.List；常规元素用 required 规则（驱动星号与底层校验）
  const rules = isTableElement
    ? undefined
    : isRequired && !isDetailMode
      ? [{ required: true, message: `${el.label || '此项'}不能为空` }]
      : undefined

  // 控件渲染分发：
  // - 详情只读模式（pageType='detail'）：常规控件与字段型组件（如 upload）渲染为纯文本（空值显示 '-'），
  //   divider 保持分割线、table 走表格只读逻辑
  // - 其余模式：基础组件走专属配置（传原始 pageType，表格据此区分 form/move-form 可编辑、
  //   detail 纯文本、move-detail 画布禁用预览）；常规控件走统一渲染配置中心
  const renderControl = () => {
    if (pageType === 'detail' && el.element_type !== 'divider' && el.element_type !== 'table') {
      return <ReadonlyValue elementType={el.element_type} />
    }
    const baseCfg = getBaseElementConfig(el.element_type)
    if (baseCfg?.renderPreview) return baseCfg.renderPreview(el, pageType)
    const render = renderPreviewConfig[el.element_type]
    if (render) return render(el, pageType)
    return <Input disabled={!isFormMode} placeholder={el.placeholder || undefined} />
  }

  return (
    <FormItem
      field={isTableElement ? undefined : el.field_key || el.name || undefined}
      label={noLabel ? '' : el.label}
      labelCol={labelCol}
      wrapperCol={wrapperCol}
      rules={rules}
      noStyle={noLabel}
    >
      {renderControl()}
    </FormItem>
  )
}

/**
 * 画布模式元素容器（memo 化）：拖拽/选中/悬停等高频状态变化时，
 * 仅目标元素的 isSelected / isDragOver 变化触发自身重渲染，其余元素跳过组件树更新。
 */
const CanvasElement = memo(function CanvasElement({
  el,
  index,
  isSelected,
  isDragOver,
  ctx,
  onSelectElement,
  onRemoveElement,
  onElementDragStart,
  onElementDragOver,
  onElementDrop,
  onDragEnd,
}) {
  return (
    <Col span={el.width}>
      <div
        draggable
        onClick={(e) => {
          e.stopPropagation()
          onSelectElement?.(el)
        }}
        onDragStart={(e) => onElementDragStart?.(e, el)}
        onDragOver={(e) => onElementDragOver?.(e, index)}
        onDrop={(e) => onElementDrop?.(e, index)}
        onDragEnd={onDragEnd}
        className={`group relative h-full cursor-pointer border transition-colors ${
          isSelected
            ? 'border-[rgb(var(--arcoblue-6))] bg-[rgb(var(--arcoblue-1))]'
            : isDragOver
              ? 'border-dashed border-[rgb(var(--arcoblue-6))] bg-[rgb(var(--arcoblue-1))]'
              : 'border-transparent bg-white hover:border-[rgb(var(--arcoblue-6))]'
        }`}
      >
        {renderFormItemElement(el, ctx)}
        {/* 透明蒙层阻止触发表单控件原生交互（置于容器内，避免 FormItem children 成数组导致字段注入失效） */}
        <div className="absolute inset-0 z-1"></div>
        {isSelected && (
          <>
            {/* 拖拽图标：绝对定位左下角 */}
            <span className="absolute -bottom-px -left-px bg-[rgb(var(--arcoblue-6))] px-1">
              <IconDragArrow className="cursor-grab text-white!" />
            </span>
            {/* 删除按钮：绝对定位右上角（悬浮于边框上） */}
            <Button
              size="mini"
              status="danger"
              shape="circle"
              icon={<IconDelete />}
              title="删除元素"
              className="absolute! -top-2 -right-2 z-2 shadow"
              onClick={(e) => {
                e.stopPropagation()
                onRemoveElement?.(el.id)
              }}
            />
          </>
        )}
      </div>
    </Col>
  )
})

// ==================== 核心组件：DynamicForm ====================

/**
 * 动态表单渲染组件（纯展示/填写，不含数据加载）：
 * 根据应用配置的 form_layout_json 将布局还原为可填写的动态表单。
 * 供动态表单页面（DynamicRender）与抽屉场景（如审批申请）共用。
 * 元素渲染统一分发至本文件的组件配置中心（renderPreviewConfig / BASE_ELEMENT_CONFIGS）。
 *
 * @param {object} app         应用配置对象（含 form_layout_json 等字段）
 * @param {object} form        Arco Form 实例（可由调用方通过 Form.useForm() 创建）
 * @param {string} pageType    展示模式：
 *   - 'form'        常规可填写动态表单
 *   - 'detail'      详情只读模式（所有控件禁用态，仅数据展示）
 *   - 'move-form'   设计器画布模式（表单页）：支持拖拽排序/新增、选中高亮、删除、蒙层
 *   - 'move-detail' 设计器画布模式（详情页）：同上，表格组件按只读（editable=false）渲染
 * @param {string|null} selectedId        画布模式：当前选中元素 id
 * @param {number|null} dragOverIndex     画布模式：当前拖拽悬停元素索引
 * @param {Function} onSelectElement      画布模式：(el) 点击元素选中
 * @param {Function} onRemoveElement      画布模式：(elId) 删除元素
 * @param {Function} onElementDragStart   画布模式：(e, el) 元素拖拽开始
 * @param {Function} onElementDragOver    画布模式：(e, index) 元素上拖拽悬停
 * @param {Function} onElementDrop        画布模式：(e, index) 元素上放置
 * @param {Function} onDragEnd            画布模式：拖拽结束清理
 * @param {Function} onCanvasDragOver     画布模式：画布空白区拖拽悬停
 * @param {Function} onCanvasDrop         画布模式：画布空白区放置
 * @param {Function} onCanvasClick        画布模式：画布空白区点击（取消选中）
 */
export default function DynamicForm({
  app,
  form,
  pageType = 'form',
  selectedId = null,
  dragOverIndex = null,
  onValuesChange,
  onSelectElement,
  onRemoveElement,
  onElementDragStart,
  onElementDragOver,
  onElementDrop,
  onDragEnd,
  onCanvasDragOver,
  onCanvasDrop,
  onCanvasClick,
}) {
  // 布局解析缓存：仅当布局 JSON 变化时重新解析，拖拽/选中等状态更新不触发重复解析
  const layout = useMemo(() => parseLayoutJson(app?.form_layout_json), [app?.form_layout_json])
  const elements = layout?.elements || []
  const formConfig = layout?.formConfig || DEFAULT_FORM_CONFIG

  const isMoveMode = pageType === 'move-form' || pageType === 'move-detail'
  // 表单渲染上下文（画布元素 memo 依赖）：仅当 formConfig / pageType 变化时重建，
  // 拖拽悬停、选中等高频状态更新不改变该引用，CanvasElement 可跳过无关重渲染
  const formCtx = useMemo(
    () => ({
      isHorizontal: formConfig.layout === 'horizontal',
      formConfig,
      pageType,
      isMoveMode,
    }),
    [formConfig, pageType, isMoveMode],
  )

  // 表单节点：根据页面类型渲染不同内容
  // - 画布模式：memo 化 CanvasElement（拖拽/悬停/选中仅影响目标元素重渲染）
  // - 常规模式：直接渲染 Col + FormItem
  const formNode = (
    <Form
      form={form}
      className={isMoveMode ? 'mx-auto max-w-187.5' : undefined}
      layout={formConfig.layout}
      labelAlign={formConfig.labelAlign}
      disabled={pageType !== 'form'}
      autoComplete="off"
      onValuesChange={(changed, allValues) => onValuesChange?.(allValues)}
    >
      <Row>
        {isMoveMode
          ? elements.map((el, index) => (
              <CanvasElement
                key={el.id || `el_${el.element_type}_${index}`}
                el={el}
                index={index}
                isSelected={el.id === selectedId}
                isDragOver={dragOverIndex === index}
                ctx={formCtx}
                onSelectElement={onSelectElement}
                onRemoveElement={onRemoveElement}
                onElementDragStart={onElementDragStart}
                onElementDragOver={onElementDragOver}
                onElementDrop={onElementDrop}
                onDragEnd={onDragEnd}
              />
            ))
          : elements.map((el, index) => (
              <Col span={el.width || 24} key={el.id || `el_${el.element_type}_${index}`}>
                {renderFormItemElement(el, formCtx)}
              </Col>
            ))}
      </Row>
    </Form>
  )

  // 画布模式：外层虚线容器承载空白区拖拽/点击，内部渲染元素表单
  if (isMoveMode) {
    return (
      <div
        className="m-4 flex-1 overflow-auto border-2 border-dashed border-gray-200 p-4"
        onDragOver={onCanvasDragOver}
        onDrop={onCanvasDrop}
        onClick={onCanvasClick}
      >
        {elements.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <Empty description="从左侧拖拽表单元素到此处开始设计" />
          </div>
        ) : (
          formNode
        )}
      </div>
    )
  }

  if (!elements.length) {
    return (
      <>
        <Empty description="该应用暂未配置表单布局" />
      </>
    )
  }

  return (
    <>
      {formNode}
    </>
  )
}
