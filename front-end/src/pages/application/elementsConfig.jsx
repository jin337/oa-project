import {
  Button,
  Checkbox,
  DatePicker,
  Divider,
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
import { IconDelete, IconPlus } from '@arco-design/web-react/icon'
import { ELEMENT_TYPE_OPTIONS } from '../../config/app.js'

/**
 * 布局设计器 —— 基础组件配置中心
 *
 * 集中维护基础组件（不依赖后端表单元素、始终显示在左侧"基础"分组）的：
 *   - meta：元数据（拖拽标识、类型、标签、默认宽度、默认属性）
 *   - renderPreview(el)：画布预览渲染
 *   - renderSettings(ctx)：右侧属性面板渲染（ctx 由 LayoutManage 注入组件状态与回调）
 *
 * 新增基础组件只需在此对象中追加一项，左侧组件库、画布预览、属性面板自动生效。
 */

// 元素宽度占比（24 栅格，短标签适配按钮式 Radio）
const WIDTH_OPTIONS = [
  { label: '100%', value: 24, tip: '整行' },
  { label: '50%', value: 12, tip: '1/2' },
  { label: '33%', value: 8, tip: '1/3' },
  { label: '25%', value: 6, tip: '1/4' },
]

// 根据类型获取中文标签
const getTypeLabel = (type) => ELEMENT_TYPE_OPTIONS.find((c) => c.value === type)?.label || type

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
      const finalColumns = [indexColumn, ...(!isEditable ? columns : [...columns, action])]
      return columns.length ? (
        <div>
          <Table
            size="small"
            rowKey={el.element_id}
            border
            pagination={false}
            columns={finalColumns}
            data={[]}
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

/** 判断是否为基础组件（不显示通用字段名称/宽度等配置） */
export const isBaseElement = (element_type) => Boolean(BASE_ELEMENT_CONFIGS[element_type])

// 无字段标签的基础组件（画布 FormItem 中隐藏 label 并走特殊布局，如分割线/表格）
const NO_LABEL_ELEMENT_TYPES = ['divider', 'table']

/** 判断是否为无字段标签元素（画布中不显示 label；upload 等字段型基础组件不受影响） */
export const isNoLabelElement = (element_type) => NO_LABEL_ELEMENT_TYPES.includes(element_type)

/** 获取基础组件配置（含 renderPreview / renderSettings） */
export const getBaseElementConfig = (element_type) => BASE_ELEMENT_CONFIGS[element_type] || null

/**
 * 常规表单控件的预览渲染映射（element_type → 渲染函数）
 * 画布中动态表单元素（来自后端表单元素接口）按此映射渲染禁用态预览。
 */
export const renderPreviewConfig = {
  input: (el) => <Input disabled placeholder={el.placeholder || undefined} />,
  textarea: (el) => (
    <Input.TextArea disabled autoSize={{ minRows: 2 }} placeholder={el.placeholder || undefined} />
  ),
  number: (el) => (
    <InputNumber disabled style={{ width: '100%' }} placeholder={el.placeholder || undefined} />
  ),
  select: (el) => <Select disabled placeholder={el.placeholder || '请选择'} />,
  radio: () => (
    <Radio.Group disabled>
      <Radio>选项一</Radio>
      <Radio>选项二</Radio>
    </Radio.Group>
  ),
  checkbox: () => (
    <Checkbox.Group disabled>
      <Checkbox>选项一</Checkbox>
      <Checkbox>选项二</Checkbox>
    </Checkbox.Group>
  ),
  date: (el) => <DatePicker disabled placeholder={el.placeholder || undefined} />,
  datepicker: (el) => <DatePicker disabled placeholder={el.placeholder || undefined} />,
  time: (el) => (
    <TimePicker disabled style={{ width: '100%' }} placeholder={el.placeholder || undefined} />
  ),
  timepicker: (el) => (
    <TimePicker disabled style={{ width: '100%' }} placeholder={el.placeholder || undefined} />
  ),
  switch: () => <Switch disabled />,
  upload: (el) => <Upload action="/" disabled tip={el.placeholder || undefined} />,
}

/**
 * 元素属性面板总分发：基础组件 → 专属 renderSettings；常规控件 → 通用属性面板
 * LayoutManage 右侧"元素属性"Tab 统一调用此函数，无需再关心具体类型。
 */
export const renderElementSettings = (el, ctx) => {
  const baseCfg = getBaseElementConfig(el.element_type)
  if (baseCfg?.renderSettings) return baseCfg.renderSettings(ctx)
  return renderCommonSettings(ctx)
}
