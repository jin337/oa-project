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
  TimePicker,
  Upload,
} from '@arco-design/web-react'
import { IconDelete, IconPlus } from '@arco-design/web-react/icon'

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

export const BASE_ELEMENT_CONFIGS = {
  divider: {
    meta: {
      key: 'base_divider',
      element_type: 'divider',
      label: '分割线',
      width: 24,
      defaultProps: { orientation: 'center', text: '' },
    },
    renderPreview: (el) =>
      el.text ? (
        <Divider orientation={el.orientation || 'center'}>{el.text}</Divider>
      ) : (
        <Divider />
      ),
    renderSettings: ({ selectedElement, updateSelectedElement }) => (
      <>
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
      defaultProps: { columns: [], table_key: '' },
    },
    renderPreview: (el, pageType) => {
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
      // 表单页追加操作列；详情页不追加
      const finalColumns = pageType === 'detail' ? columns : [...columns, action]
      return columns.length ? (
        <Table
          size="small"
          rowKey={el.element_id}
          border
          pagination={false}
          columns={finalColumns}
          data={[]}
        />
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
      addColumn,
      removeColumn,
    }) => (
      <>
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-600">表格列配置</div>
          <Button
            size="mini"
            icon={<IconPlus />}
            disabled={!selectedElement.table_key}
            onClick={addColumn}
          >
            添加列
          </Button>
        </div>
        <Select
          size="small"
          placeholder="选择关联子表"
          value={selectedElement.table_key || undefined}
          onChange={handleTableKeyChange}
          options={appTables.subTables.map((tb) => ({ label: tb, value: tb }))}
        />
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
              onClick={() => removeColumn(col.id)}
            />
          </div>
        ))}
        {!(selectedElement.columns || []).length && (
          <div className="rounded border border-dashed border-gray-200 px-2 py-3 text-center text-xs text-gray-400">
            {selectedElement.table_key ? '点击"添加列"开始配置' : '请先选择关联子表'}
          </div>
        )}
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
  upload: (el) => <Upload action="/" disabled placeholder={el.placeholder || undefined} />,
}
