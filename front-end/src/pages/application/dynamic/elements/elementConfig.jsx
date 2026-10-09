import {
  Checkbox,
  DatePicker,
  Input,
  InputNumber,
  Radio,
  Select,
  Switch,
  Tag,
  TimePicker,
  TreeSelect,
} from '@arco-design/web-react'
import { ELEMENT_TYPE_OPTIONS } from 'src/config/app.js'

import {
  TIME_ELEMENT_TYPES,
  formatTimeValue,
  getStaticOptions,
} from '../utils/formUtils'

import { DeptReadOnly, renderDeptPreview } from './DeptElement'
import { renderDividerPreview, renderDividerSettings } from './DividerElement'
import { TableElementField, renderTableSettings } from './TableElement'
import { renderUploadPreview, renderUploadReadOnly, renderUploadSettings } from './UploadElement'
import { UserReadOnly, renderUserPreview } from './UserElement'

// 表格列配置工具、画布详情模拟渲染与表格字段组件：
// DynamicForm 等既有调用方经本文件转发引用（零改动）
export { addColumn, genColumn, removeColumn, updateColumn } from './TableElement'
export { TableElementField } from './TableElement'
export { MockDetailValue } from './MockPreview'

// 运行时表单上下文在此原样再导出：DynamicForm 经 `export { RuntimeFormContext } from './elements/elementConfig'`
// 转发给 modes/UploadElement 等既有调用方，保持单一 Context 定义源（runtimeContext.js）
export { RuntimeFormContext } from './runtimeContext'

// ==================== 常量与全局配置 ====================

// 元素宽度占比（24 栅格，短标签适配按钮式 Radio）
const WIDTH_OPTIONS = [
  { value: 24, label: '整行' },
  { value: 12, label: '1/2' },
  { value: 8, label: '1/3' },
  { value: 16, label: '2/3' },
  { value: 6, label: '1/4' },
  { value: 18, label: '3/4' },
]

// 画布模式（move-*）下依赖选项组件的统一预览占位选项（不解析真实 data_source）
const PREVIEW_OPTIONS = [
  { label: '选项一', value: 'option1' },
  { label: '选项二', value: 'option2' },
]

// 根据类型获取中文标签
const getTypeLabel = (type) => ELEMENT_TYPE_OPTIONS.find((c) => c.value === type)?.label || type

// 无字段标签的组件类型（画布 FormItem / 动态表单中隐藏 label 并走特殊布局，如分割线/表格）
export const NO_LABEL_TYPES = ['divider', 'table']

// ==================== 工具函数与解析逻辑 ====================

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
            {opt.label}
          </Radio>
        ))}
      </Radio.Group>
    </div>
  </>
)

// ==================== 详情只读展示 ====================

/**
 * 将数据值映射为 data_source 配置的展示 label（select/radio/checkbox 等选项型字段）；
 * 未配置 data_source 或值无匹配项时原样返回。
 */
const labelOfValue = (value, dataSource) => {
  if (dataSource == null || value == null) return value
  const opts = getStaticOptions({ data_source: dataSource })
  if (!opts.length) return value
  const hit = opts.find((o) => String(o.value) === String(value))
  return hit && hit.label != null ? hit.label : value
}

/**
 * 详情只读模式（pageType='detail'）下的纯文本展示组件：
 * 作为 FormItem 单子元素接收 Arco 注入的 value，输出数据值对应的 data_source label
 * （数组值逐项映射后以 ", " 连接），空值显示 '-'。
 * elementType 为时间/日期类型时，value 经 formatTimeValue 格式化为标准可读的日期/时间字符串。
 */
export const ReadonlyValue = ({ value, elementType, dataSource, el }) => {
  // upload 类型：走 UploadElement 的只读渲染
  if (elementType === 'upload') {
    return renderUploadReadOnly(value, el)
  }
  // deptselect 类型：数据源自加载反查部门名
  if (elementType === 'deptselect') {
    return <DeptReadOnly value={value} el={el} />
  }
  // userselect 类型：数据源自加载反查人员名
  if (elementType === 'userselect') {
    return <UserReadOnly value={value} el={el} />
  }
  let text
  if (value == null || value === '') {
    text = '-'
  } else if (TIME_ELEMENT_TYPES.includes(elementType)) {
    text = formatTimeValue(value, elementType)
  } else if (Array.isArray(value)) {
    text = value.map((v) => labelOfValue(v, dataSource)).join(', ')
  } else {
    text = String(labelOfValue(value, dataSource))
  }
  return <span className="break-all whitespace-pre-wrap">{text}</span>
}

/** 判断是否为基础组件（不显示通用字段名称/宽度等配置） */
export const isBaseElement = (element_type) => Boolean(BASE_ELEMENT_CONFIGS[element_type])

/** 判断是否为无字段标签元素（画布中不显示 label；upload 等字段型基础组件不受影响） */
export const isNoLabelElement = (element_type) => NO_LABEL_TYPES.includes(element_type)

/** 获取基础组件配置（含 renderPreview / renderSettings） */
export const getBaseElementConfig = (element_type) => BASE_ELEMENT_CONFIGS[element_type] || null

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
    renderPreview: renderDividerPreview,
    renderSettings: renderDividerSettings,
  },

  table: {
    meta: {
      key: 'base_table',
      element_type: 'table',
      label: '表格',
      width: 24,
      defaultProps: {
        columns: [],
        table_key: '',
        editable: true,
        showSummary: false,
        summaryRules: [],
      },
    },
    renderPreview: (el, pageType) => (
      <TableElementField
        el={el}
        pageType={pageType}
        renderPreviewConfig={renderPreviewConfig}
        ReadonlyValue={ReadonlyValue}
      />
    ),
    renderSettings: renderTableSettings,
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
  select: {
    renderPreview: (el, pageType, rt) => {
      // 画布模式（move-*）：统一硬编码预览选项，不解析 data_source
      if (pageType?.startsWith('move-')) {
        return (
          <Select
            style={{ width: '100%' }}
            placeholder={el.placeholder || undefined}
            options={PREVIEW_OPTIONS}
          />
        )
      }
      // 运行时优先使用动态接口选项（data_source.type=api），其次静态 JSON 选项
      const runtimeOptions = rt?.getOptions?.(el)
      const options = runtimeOptions?.length ? runtimeOptions : getStaticOptions(el)
      return (
        <Select
          style={{ width: '100%' }}
          options={options.length ? options : undefined}
          placeholder={el.placeholder || undefined}
        />
      )
    },
  },
  treeselect: {
    renderPreview: (el, pageType, rt) => {
      // 画布模式（move-*）：统一硬编码预览选项，不解析 data_source
      if (pageType?.startsWith('move-')) {
        return (
          <TreeSelect
            style={{ width: '100%' }}
            placeholder={el.placeholder || undefined}
            treeData={PREVIEW_OPTIONS}
          />
        )
      }
      // 运行时优先动态接口选项，其次静态 JSON；data_source 支持扁平 [{label,value}] 与树形 [{label,value,children}]
      const runtimeOptions = rt?.getOptions?.(el)
      const options = runtimeOptions?.length ? runtimeOptions : getStaticOptions(el)
      return (
        <TreeSelect
          style={{ width: '100%' }}
          treeData={options.length ? options : undefined}
          // Arco TreeSelect 的 treeData 字段名为 key/title（Select 为 value/label），
          // extractOptions 统一输出 value/title，此处通过 fieldNames 映射，
          fieldNames={{ key: 'value', title: 'title', children: 'children' }}
          placeholder={el.placeholder || undefined}
        />
      )
    },
  },
  radio: {
    renderPreview: (el, pageType, rt) => {
      // 画布模式（move-*）：统一硬编码预览选项，不解析 data_source
      if (pageType?.startsWith('move-')) {
        return <Radio.Group style={{ width: '100%' }} options={PREVIEW_OPTIONS} />
      }
      const runtimeOptions = rt?.getOptions?.(el)
      const options = runtimeOptions?.length ? runtimeOptions : getStaticOptions(el)
      return (
        <Radio.Group style={{ width: '100%' }} options={options.length ? options : undefined} />
      )
    },
  },
  checkbox: {
    renderPreview: (el, pageType, rt) => {
      // 画布模式（move-*）：统一硬编码预览选项，不解析 data_source
      if (pageType?.startsWith('move-')) {
        return <Checkbox.Group style={{ width: '100%' }} options={PREVIEW_OPTIONS} />
      }
      const runtimeOptions = rt?.getOptions?.(el)
      const options = runtimeOptions?.length ? runtimeOptions : getStaticOptions(el)
      return (
        <Checkbox.Group style={{ width: '100%' }} options={options.length ? options : undefined} />
      )
    },
  },
  upload: {
    renderPreview: renderUploadPreview,
    renderSettings: renderUploadSettings,
  },
  deptselect: {
    meta: {
      dataSourceDefaults: { type: 'api', url: '/depts', method: 'GET' },
    },
    renderPreview: renderDeptPreview,
  },
  userselect: {
    meta: {
      dataSourceDefaults: { type: 'api', url: '/user-list', method: 'GET' },
    },
    renderPreview: renderUserPreview,
  },
}

/**
 * 表单控件渲染映射（element_type → 渲染函数），由统一配置中心派生。
 * 所有表单控件（设计器预览、详情只读、实际表单填写）统一经 renderPreview(el, pageType) 渲染。
 */
export const renderPreviewConfig = Object.fromEntries(
  Object.entries(ELEMENT_RENDER_CONFIG).map(([key, cfg]) => [key, cfg.renderPreview]),
)
