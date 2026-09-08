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
import { IconDelete, IconDragArrow, IconPlus } from '@arco-design/web-react/icon'
import { ELEMENT_TYPE_OPTIONS } from '../../config/app.js'

const FormItem = Form.Item
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
 * 布局设计器 —— 基础组件配置中心
 *
 * 集中维护基础组件（不依赖后端表单元素、始终显示在左侧"基础"分组）的：
 *   - meta：元数据（拖拽标识、类型、标签、默认宽度、默认属性）
 *   - renderPreview(el, activePage)：画布预览渲染（所有表单控件渲染的统一入口）
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
    renderPreview: (el, activePage) => {
      const columns = (el.columns || []).map((col, i) => ({
        title: col.title || col.dataIndex || `列${i + 1}`,
        dataIndex: col.dataIndex || `col_${i + 1}`,
        // 按列配置的 element_type 从 renderPreviewConfig 映射渲染禁用态表单控件预览；
        // element_type 缺失或未定义时降级为直接显示普通文本
        render: (value) => {
          const renderFn = renderPreviewConfig[col.element_type]
          if (renderFn) return renderFn(col)
          return <span>{value ?? ''}</span>
        },
      }))
      const action = {
        key: 'action',
        title: '操作',
        width: 60,
        render: () => (
          <Button size="mini" status="danger">
            删除
          </Button>
        ),
      }
      // 固定的"序号"列：独立于用户配置列与操作列，渲染当前行行号（index + 1）
      const indexColumn = {
        key: 'index',
        title: '序号',
        width: 62,
        render: (_, __, index) => index + 1,
      }
      // 判断当前页面是否为表单页
      const isEditable = activePage === 'form'
      // 可编辑且为表单页时追加操作列；详情页或不可编辑时不追加
      const finalColumns = [indexColumn, ...(isEditable ? [...columns, action] : columns)]
      const finalData = isEditable ? [{ element_id: '1' }] : []
      return columns.length ? (
        <div>
          <Table
            size="small"
            rowKey={el.element_id}
            border
            pagination={false}
            columns={finalColumns}
            data={finalData}
          />
          {isEditable && (
            <div className="mt-2 flex justify-end">
              <Button size="mini" type="primary" icon={<IconPlus />}>
                新增
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded border border-dashed border-gray-200 px-2 py-3 text-center text-xs text-gray-400">
          表格（未配置列）
        </div>
      )
    },
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
          <div key={col.id} className="flex items-center justify-between gap-1">
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
            options={[
              { label: '选项一', value: 'option1' },
              { label: '选项二', value: 'option2' },
            ]}
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
        return (
          <Radio.Group
            style={{ width: '100%' }}
            options={[
              { label: '选项一', value: 'option1' },
              { label: '选项二', value: 'option2' },
            ]}
          />
        )
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
        return (
          <Checkbox.Group
            style={{ width: '100%' }}
            options={[
              { label: '选项一', value: 'option1' },
              { label: '选项二', value: 'option2' },
            ]}
          />
        )
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
  const layout = parseLayoutJson(app?.form_layout_json)
  const elements = layout?.elements || []
  const formConfig = layout?.formConfig || DEFAULT_FORM_CONFIG

  const isMoveMode = pageType === 'move-form' || pageType === 'move-detail'
  const isDetail = pageType === 'detail'
  // 画布模式下基础组件（表格等）的 activePage 语义：move-form → 'form'，move-detail → 'detail'
  const canvasPageType = pageType === 'move-detail' ? 'detail' : 'form'
  const isHorizontal = formConfig.layout === 'horizontal'

  // 控件渲染分发（统一由 renderPreview 承担）：
  // - 画布模式 / 详情模式：pageType 非 'form' → 控件禁用态预览
  // - form 模式：pageType 为 'form' → 控件可交互
  // - 基础组件（分割线/表格等）：走配置中心，传二值 activePage（form/detail）供表格 editable 判断
  const renderControl = (el) => {
    const baseCfg = getBaseElementConfig(el.element_type)
    if (baseCfg?.renderPreview) return baseCfg.renderPreview(el, canvasPageType)
    const render = renderPreviewConfig[el.element_type]
    if (render) return render(el, pageType)
    return <Input disabled={pageType !== 'form'} placeholder={el.placeholder || undefined} />
  }

  // 表单控件渲染：包含标签和控件
  const renderFormItem = (el, index) => {
    const noLabel = isNoLabelElement(el.element_type)
    // 画布模式：无标签元素用 span 相对占位（留白给控件），常规元素按全局标签宽度 flexBasis
    // 默认值
    let labelCol = undefined
    let wrapperCol = undefined

    // 仅在水平模式下进行布局计算
    if (isHorizontal) {
      if (noLabel) {
        // 无标签：无论是否在拖拽模式，都使用栅格布局按宽度分配
        labelCol = { span: 24 - el.width }
        wrapperCol = { span: el.width }
      } else {
        // 有标签：无论是否在拖拽模式，都使用 Flex 布局
        labelCol = { style: { flexBasis: formConfig.labelWidth } }
        wrapperCol = { style: { flexBasis: `calc(100% - ${formConfig.labelWidth}px)` } }
      }
    }

    return (
      <FormItem
        label={noLabel ? '' : el.label}
        labelCol={labelCol}
        wrapperCol={wrapperCol}
        required={isMoveMode ? Boolean(el.required) : Boolean(el.required) && !noLabel}
        className={isMoveMode ? 'mb-0!' : undefined}
      >
        {renderControl(el)}
        {/* 画布模式：透明蒙层阻止触发表单控件原生交互 */}
        {isMoveMode && <div className="absolute inset-0 z-1"></div>}
      </FormItem>
    )
  }

  // 画布模式：每个元素包裹可拖拽容器（选中高亮 / 悬停位标识 / 删除按钮 / 拖拽图标）
  const renderCanvasElement = (el, index) => {
    const isSelected = el.id === selectedId
    const isDragOver = dragOverIndex === index
    return (
      <Col span={el.width} key={el.id}>
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
          {renderFormItem(el, index)}
          {isSelected && (
            <>
              {/* 拖拽图标：绝对定位左下角，hover 显示 */}
              <span className="absolute -bottom-px -left-px bg-[rgb(var(--arcoblue-6))] px-1">
                <IconDragArrow className="cursor-grab text-white!" />
              </span>
              {/* 删除按钮：绝对定位右上角（悬浮于边框上），hover 显示 */}
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
  }

  // 表单节点：根据页面类型渲染不同内容
  const formNode = (
    <Form
      form={form}
      className={isMoveMode ? 'mx-auto max-w-187.5' : undefined}
      layout={formConfig.layout}
      labelAlign={formConfig.labelAlign}
      disabled={pageType !== 'form'}
    >
      <Row gutter={[12, 12]}>
        {elements.map((el, index) =>
          isMoveMode ? (
            renderCanvasElement(el, index)
          ) : (
            <Col span={el.width || 24} key={el.id || `el_${el.element_type}_${index}`}>
              {renderFormItem(el, index)}
            </Col>
          ),
        )}
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
    return <Empty description="该应用暂未配置表单布局" />
  }

  return formNode
}
