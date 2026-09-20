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
  TreeSelect,
  Upload,
} from '@arco-design/web-react'
import { IconDelete, IconDragArrow, IconPlus } from '@arco-design/web-react/icon'
import { memo, useCallback, createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import request from 'src/api/request'
import { ELEMENT_TYPE_OPTIONS } from 'src/config/app.js'
import { renderUploadPreview, renderUploadSettings } from './elements/UploadElement'

const FormItem = Form.Item
const FormList = Form.List
const Row = Grid.Row
const Col = Grid.Col
// Table 合计行：summary 回调必须返回 Table.Summary.Row / Cell 组合元素
const SummaryRow = Table.Summary.Row
const SummaryCell = Table.Summary.Cell

// ==================== 常量与全局配置 ====================

// 元素宽度占比（24 栅格，短标签适配按钮式 Radio）
const WIDTH_OPTIONS = [
  { value: 24, label: '整行' },
  { value: 12, label: '1/2' },
  { value: 8, label: '1/3' },
  { value: 6, label: '1/4' },
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
            {opt.label}
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
const TableElementField = ({ el, pageType, fieldPerms, editable }) => {
  // 运行时上下文：列控件动态选项（api 数据源，与主表元素同结构解析）
  const rt = useContext(RuntimeFormContext)
  // 可编辑：实际填写（form）与画布表单页（move-form）
  const isEditable = pageType === 'form' || pageType === 'move-form'
  // 详情只读：仅真实详情页（detail）渲染纯文本；画布 move-detail 保持禁用控件预览
  const isReadonlyText = pageType === 'detail'
  const { form } = Form.useFormContext()
  // Form.List 字段名：优先关联子表名（table_key），其次元素 id 兜底
  const listField = el.table_key || el.id || 'table'
  // 按列 default_value 生成一行默认数据（列与元素同结构解析）
  const genDefaultRow = () => {
    const row = {}
    ;(el.columns || []).forEach((col) => {
      const key = col.dataIndex || col.field_key
      if (key && col.default_value !== undefined && col.default_value !== '') {
        const def = parseDefaultValue(col.default_value, col.element_type)
        if (def !== undefined) row[key] = def
      }
    })
    return row
  }
  // 列级 visible_if 依赖字段（全局表单值）：订阅变化重建列可见性
  const colVifDeps = useMemo(() => {
    const s = new Set()
    ;(el.columns || []).forEach((col) => {
      const vif = col.dynamic_states?.visible_if
      if (vif) extractFormDeps(vif).forEach((d) => s.add(d))
    })
    return [...s]
  }, [el.columns])
  // 依赖字段变化时重渲染（常量 ${true}/${false} 时 deps 为空，初始渲染即完成列可见性计算）
  Form.useWatch(colVifDeps, form)
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
      initialValue={isEditable ? [genDefaultRow()] : undefined}
    >
      {(fields, { add, remove }) => {
        // 列级可见性（visible_if）：基于全局表单值求值，不满足则整列不渲染（列标题 + 单元格）
        const globalVals = form?.getFieldsValue?.() || {}
        // 列级可见性（visible_if）：基于全局表单值求值，不满足则整列不渲染（列标题 + 单元格）
        const vifCols = (el.columns || []).filter((col) => {
          const vif = col.dynamic_states?.visible_if
          if (!vif) return true
          return evalDynamicExpr(vif, globalVals)
        })
        // visible_if 不满足的隐藏列：整列过滤不渲染；其字段作为隐藏 Input 附加到
        // set_value target 指向它的来源列单元格内，字段值仍可读取/提交（不卸载字段）
        const hiddenCols = (el.columns || []).filter((col) => {
          const vif = col.dynamic_states?.visible_if
          return vif ? !evalDynamicExpr(vif, globalVals) : false
        })
        // 字段权限 perm=1（隐藏）：子表列不渲染（与主表字段隐藏一致）；
        // 严格按 field + table_key 匹配，避免主表同名字段的权限误伤子表列
        const permColumns = vifCols.filter((col) => {
          const colKey = col.dataIndex || col.field_key
          const fp = (fieldPerms || []).find(
            (p) => p && p.field === colKey && (!p.table_key || p.table_key === el.table_key)
          )
          return !fp || fp.perm !== 1
        })
        const columns = permColumns.map((col, i) => {
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
              const field = fields[index]?.field
              // 被本列 actions.set_value 的 target 指向的隐藏列：作为隐藏 Input 附加在本列单元格内，
              // 与 TreeSelect/Select 等控件同行注册，联动写入的值可读取/提交（不占独立列）
              const linkedHidden = hiddenCols.filter((h) => {
                const hKey = h.dataIndex || h.field_key
                if (!hKey) return false
                return (col.actions?.on_change || []).some(
                  (a) => a.action_type === 'set_value' && Array.isArray(a.value) && a.value.some((m) => m?.target === hKey)
                )
              })
              const renderFn = renderPreviewConfig[col.element_type]
              if (!renderFn) return <span>{cellValue ?? ''}</span>
              // 审批节点字段权限：仅待办审批（editable）详情（detail）下该列 perm=2（可编辑）→ 渲染可编辑控件
              const colEditableByPerm =
                editable &&
                pageType === 'detail' &&
                (fieldPerms || []).find(
                  (p) => p && p.field === colKey && (!p.table_key || p.table_key === el.table_key)
                )?.perm === 2
              const cellEditable = isEditable || colEditableByPerm
              const colDS = col.dynamic_states
              // 单元格控件渲染（extra 可覆盖 hidden/disabled 等属性）
              const renderCellControl = (extra) => {
                const main = !field
                  ? // 行未注册到 Form store（如画布空态）：可编辑渲染可交互控件，详情渲染纯文本
                    cellEditable
                    ? renderFn(col, 'form', rt)
                    : isReadonlyText
                      ? <ReadonlyValue value={cellValue} elementType={col.element_type} dataSource={col.data_source} />
                      : renderFn(col, undefined, rt)
                  : (
                    <FormItem
                      field={`${field}.${colKey}`}
                      noStyle
                      {...extra}
                      rules={cellEditable ? buildValidationRules(col, () => form?.getFieldsValue?.() || {}, false, true) : undefined}
                    >
                      {cellEditable ? (
                        renderFn(col, 'form', rt)
                      ) : isReadonlyText ? (
                        <ReadonlyValue elementType={col.element_type} dataSource={col.data_source} />
                      ) : (
                        renderFn(col, undefined, rt)
                      )}
                    </FormItem>
                  )
                return (
                  <>
                    {main}
                    {field &&
                      linkedHidden.map((h) => {
                        const hKey = h.dataIndex || h.field_key
                        return (
                          <FormItem key={`${el.table_key}-link-${index}-${hKey}`} field={`${field}.${hKey}`} hidden>
                            <Input />
                          </FormItem>
                        )
                      })}
                  </>
                )
              }
              // 列级禁用状态（disabled_if）：与主表元素一致，通过 shouldUpdate 监听当前行值变化
              // 注意：visible_if 已在列构建阶段做整列过滤（列标题+单元格一起隐藏），此处仅处理禁用
              if (colDS?.disabled_if) {
                const deps = extractFormDeps(colDS.disabled_if)
                return (
                  <Form.Item
                    shouldUpdate={
                      deps.size
                        ? (prev, cur) =>
                            [...deps].some((d) => prev?.[listField]?.[index]?.[d] !== cur?.[listField]?.[index]?.[d])
                        : true
                    }
                    noStyle
                  >
                    {(formData) => {
                      const row = formData?.[listField]?.[index] || {}
                      const disabled = evalDynamicExpr(colDS.disabled_if, row)
                      return renderCellControl({ disabled })
                    }}
                  </Form.Item>
                )
              }
              return renderCellControl()
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
              summary={
                // 表格合计/汇总：showSummary 开启时渲染底部汇总行。
                // 注意：Arco Table 的 summary 回调必须返回 JSX（Table.Summary.Row / Cell 组合），
                // 而非数据对象（Tfoot 直接渲染其返回值，返回对象会触发 "Objects are not valid as a React child"）
                el.showSummary
                  ? () => {
                      // Table 的 data 为 Form.List 注册数组（fields，不含单元格值），
                      // 需从 Form store 读取该子表的实际行数据用于合计计算
                      const rows = Array.isArray(form?.getFieldValue?.(listField))
                        ? form.getFieldValue(listField)
                        : []
                      // 按"列合计"规则逐列计算：展示层始终显示明细行实时求和的总计值（保证合计行准确）；
                      // rule.target 用于配置该合计关联的主表字段（数据来源/回填目标），仅作数据关联存储，
                      // 不覆盖展示值（避免主表旧值未同步时合计行显示错误）
                      const values = {}
                      ;(el.summaryRules || []).forEach((rule) => {
                        if (!rule?.colKey) return
                        const sum = rows.reduce((acc, row) => {
                          const n = Number.parseFloat(row?.[rule.colKey])
                          return acc + (Number.isNaN(n) ? 0 : n)
                        }, 0)
                        values[rule.colKey] = Math.round(sum * 100) / 100
                      })
                      // 合计行单元格样式：与数据行网格线保持一致（Arco body td 用 border-left + border-bottom
                      // 勾勒表格线，而 tfoot 的 td 默认无边框，导致合计行最左侧缺边框），内容统一居中对齐
                      const summaryCellStyle = {
                        fontWeight: 600,
                        textAlign: 'center',
                        borderLeft: '1px solid var(--color-border-2)',
                        borderBottom: '1px solid var(--color-border-2)',
                      }

                      const cellStyle = { fontWeight: 600, textAlign: 'center' }
                      // 合计单元格统一放入数组后展开渲染：isEditable 为 false 时用空数组展开，
                      // 避免向 SummaryRow 传入 false/null 子节点——Arco Table.Summary.Row 内部通过
                      // React.Children.map(child => child.props.colSpan) 处理子节点，React 会把
                      // false/null 归一为 null 后仍调用回调，从而触发 null.props 崩溃
                      const cells = [
                        <SummaryCell key="summary-label" style={summaryCellStyle}>
                          合计
                        </SummaryCell>,
                        ...columns.map((col) => (
                          <SummaryCell
                            key={col.dataIndex || col.field_key || col.key || 'col'}
                            style={cellStyle}
                          >
                            {values[col.dataIndex ?? col.field_key] ?? ''}
                          </SummaryCell>
                        )),
                        ...(isEditable
                          ? [<SummaryCell key="summary-action" style={cellStyle} />]
                          : []),
                      ]
                      return <SummaryRow>{cells}</SummaryRow>
                    }
                  : undefined
              }
            />
            {isEditable && (
              <div className="mt-2 flex justify-between">
                {/* 表格错误提示：显示 Form.List 校验错误（整体必填 / 必填列非空） */}
                <div className="arco-form-message">{errorMessage || ''}</div>
                <Button size="mini" type="primary" icon={<IconPlus />} onClick={() => add(genDefaultRow())}>
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
      defaultProps: {
        columns: [],
        table_key: '',
        editable: true,
        showSummary: false,
        summaryRules: [],
      },
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
        <div className="flex justify-between">
          <div className="text-sm text-gray-600">开启合计</div>
          <Switch
            size="small"
            checked={Boolean(selectedElement.showSummary)}
            onChange={(v) => updateSelectedElement({ showSummary: v })}
          />
        </div>
        {selectedElement.showSummary && (
          <>
            <div className="text-sm text-gray-600">列合计配置</div>
            {(selectedElement.summaryRules || []).map((rule, idx) => (
              <div key={idx} className="flex items-center gap-1">
                <Select
                  size="small"
                  placeholder="选择参与合计的表格列"
                  value={rule.colKey || undefined}
                  options={(selectedElement.columns || [])
                    .filter((c) => c.dataIndex || c.field_key)
                    .map((c) => ({
                      label: c.title || c.dataIndex || c.field_key,
                      value: c.dataIndex || c.field_key,
                    }))}
                  onChange={(v) =>
                    updateSelectedElement({
                      summaryRules: (selectedElement.summaryRules || []).map((r, i) =>
                        i === idx ? { ...r, colKey: v } : r,
                      ),
                    })
                  }
                />
                <Button
                  size="small"
                  status="danger"
                  icon={<IconDelete />}
                  onClick={() =>
                    updateSelectedElement({
                      summaryRules: (selectedElement.summaryRules || []).filter(
                        (_, i) => i !== idx,
                      ),
                    })
                  }
                />
              </div>
            ))}
            <Button
              size="mini"
              icon={<IconPlus />}
              onClick={() =>
                updateSelectedElement({
                  summaryRules: [...(selectedElement.summaryRules || []), { colKey: '' }],
                })
              }
            >
              添加合计项
            </Button>
          </>
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
    renderPreview: (el, pageType, rt) => {
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
      // 运行时优先使用动态接口选项（data_source.type=api），其次静态 JSON 选项
      const runtimeOptions = rt?.getOptions?.(el)
      const options = runtimeOptions?.length ? runtimeOptions : getStaticOptions(el)
      return (
        <Select
          style={{ width: '100%' }}
          options={options.length ? options : undefined}
          placeholder={el.placeholder || '请选择'}
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
            placeholder={el.placeholder || '请选择'}
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
          placeholder={el.placeholder || '请选择'}
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
    renderPreview: renderUploadPreview,
    renderSettings: renderUploadSettings,
  },
}

/**
 * 表单控件渲染映射（element_type → 渲染函数），由统一配置中心派生。
 * 所有表单控件（设计器预览、详情只读、实际表单填写）统一经 renderPreview(el, pageType) 渲染。
 */
export const renderPreviewConfig = Object.fromEntries(
  Object.entries(ELEMENT_RENDER_CONFIG).map(([key, cfg]) => [key, cfg.renderPreview]),
)

// ==================== 动态表单运行时：数据源(api) + 事件联动(actions) ====================

// 选项型元素（支持动态数据源）
const OPTION_ELEMENT_TYPES = new Set(['select', 'radio', 'checkbox', 'treeselect'])

/** 递归查找选项：树形选项（children 子节点）的选中项匹配需下钻子级 */
const findOptionByValue = (opts, val) => {
  for (const o of opts || []) {
    if (String(o.value) === String(val)) return o
    if (Array.isArray(o.children) && o.children.length) {
      const found = findOptionByValue(o.children, val)
      if (found) return found
    }
  }
  return null
}

/** 按点号路径取值：getByPath({ a: { b: 1 } }, 'a.b') -> 1 */
const getByPath = (obj, path) => {
  if (obj == null) return undefined
  const p = String(path || '')
  // 空路径直接返回根对象（${id} 无剩余路径时取当前值本身）
  if (p === '') return obj
  return p.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj)
}

/**
 * 解析表达式字符串：支持 ${form.xxx}（表单字段）、${item.xxx}（选项项）与字面量拼接。
 * 例：'/item/' + ${form.country}/${form.city} -> '/item/CN/北京'
 */
const resolveExpr = (expr, vars) => {
  if (expr == null) return ''
  const str = String(expr)
  return str.replace(/\$\{([^}]+)\}/g, (_, pathExpr) => {
    const parts = String(pathExpr).split('.')
    const scope = parts[0]
    // ${form.xxx} / ${item.xxx} 显式作用域；无前缀 ${xxx} 一律视为表单字段简写（等价 ${form.xxx}），
    // 选中项数据必须显式写 ${item.xxx}，语义唯一不依赖隐式规则
    let root
    if (scope === 'form') root = vars?.form
    else if (scope === 'item') root = vars?.item
    else root = vars?.form?.[scope]
    const val = getByPath(root, parts.slice(1).join('.'))
    return val === undefined || val === null ? '' : String(val)
  })
}

/**
 * 统一取值路径解析（表达式规则：拼接才用 ${}，独立取值直接写路径）：
 * - ${...} 内联：拼接场景，走 resolveExpr（如 ${item.username}-${item.dept.name}、/users/${item.id}）
 * - form.xxx / item.xxx 前缀：独立取值场景，按作用域取（form=整个表单，item=选中项）
 * - 无前缀：matched=false，由调用方按当前上下文处理（如 target_mapping 的响应字段路径）
 */
const resolvePath = (expr, roots) => {
  if (expr == null || expr === '') return { value: undefined, matched: false }
  const str = String(expr)
  if (str.includes('${')) {
    return { value: resolveExpr(str, { form: roots?.form, item: roots?.item }), matched: true }
  }
  if (str.startsWith('form.')) return { value: getByPath(roots?.form, str.slice(5)), matched: true }
  if (str.startsWith('item.')) return { value: getByPath(roots?.item, str.slice(5)), matched: true }
  return { value: undefined, matched: false }
}

/** 提取表达式中依赖的表单字段（去重），用于判断值变化时是否需刷新动态选项 */
const extractFormDeps = (str) => {
  const deps = new Set()
  String(str ?? '').replace(/\$\{form\.([^}]+)\}/g, (_, p) => {
    deps.add(p.split('.')[0])
    return ''
  })
  return deps
}

/** 提取选项型元素的 api 数据源依赖字段（params/label 中的 ${form.xxx}）；非 api 数据源返回 null */
const apiOptionDeps = (el) => {
  if (!OPTION_ELEMENT_TYPES.has(el?.element_type) || el?.data_source?.type !== 'api') return null
  const ds = el.data_source
  return extractFormDeps([ds.params, ds.label].filter(Boolean).join(' '))
}

/**
 * 动态状态表达式求值（visible_if / disabled_if）：
 * - 支持 ${form.xxx} 引用表单字段值（点路径）
 * - 支持比较/逻辑/算术运算符（=== !== == != > < >= <= && || ! + - * /）
 * - 字符白名单 + 原型链/全局关键字拦截，禁止语句注入
 * - 求值失败或表达式为空一律返回 false
 */
const evalDynamicExpr = (expr, formValues) => {
  if (!expr || !String(expr).trim()) return false
  const code = String(expr).replace(/\$\{([^}]+)\}/g, (_, p) => {
    const parts = String(p).split('.')
    const scope = parts[0]
    // 字面量支持：${true} / ${false} / ${数字}（不经过 form 查找）
    if (scope === 'true') return 'true'
    if (scope === 'false') return 'false'
    if (/^-?\d+(\.\d+)?$/.test(scope)) return scope
    const root = scope === 'form' ? formValues : undefined
    const val = getByPath(root, parts.slice(1).join('.'))
    return JSON.stringify(val ?? '')
  })
  if (!/^[\s\w.$"'`+\-*/%<>=!&|?:()\[\],]+$/.test(code)) return false
  if (/(constructor|__proto__|prototype|Function|eval|window|globalThis|document)/i.test(code)) return false
  try {
    return Boolean(new Function(`"use strict"; return (${code});`)())
  } catch (e) {
    return false
  }
}

/**
 * 预计算布局中所有动态状态字段（visible_if / disabled_if）的求值结果（detail 只读静态化用）：
 * 基于完整业务数据一次性求值，返回 { field_key: { visible, disabled }, ... }，
 * 使 detail 只读场景无需 shouldUpdate 响应式监听，同时绕开 Arco setFieldsValue 快照覆盖问题。
 */
export function evaluateDynamicStates(layout, data) {
  const result = {}
  const values = data || {}
  const collect = (els) => {
    ;(Array.isArray(els) ? els : []).forEach((el) => {
      if (Array.isArray(el)) return collect(el)
      if (!el || typeof el !== 'object') return
      if (el.field_key && (el.dynamic_states?.visible_if || el.dynamic_states?.disabled_if)) {
        result[el.field_key] = {
          visible: el.dynamic_states.visible_if ? !!evalDynamicExpr(el.dynamic_states.visible_if, values) : true,
          disabled: el.dynamic_states.disabled_if ? !!evalDynamicExpr(el.dynamic_states.disabled_if, values) : false,
        }
      }
    })
  }
  collect(layout?.elements)
  return result
}

/**
 * 构建 Arco Form 校验规则（required + validation_rule）：
 * - validation_rule 支持正则表达式（如 /^1[3-9]\\d{9}$/，Arco 用 match 承载）
 *   或校验表达式（如 ${form.end_date} > ${form.start_date}，求值为 false 时校验失败，用 validator 承载）
 * - isDetail：详情只读模式跳过必填；skipRequired：必填移交外部（表格整体规则）时跳过
 * - getFormValues：返回当前表单值的函数（表达式校验求值用）
 */
const buildValidationRules = (el, getFormValues, isDetail, skipRequired) => {
  const rules = []
  const label = el.label || '此项'
  if (el.required && !isDetail && !skipRequired) {
    rules.push({ required: true, message: `${label}不能为空` })
  }
  const ruleStr = el.validation_rule
  if (ruleStr) {
    const str = String(ruleStr).trim()
    if (str.startsWith('/')) {
      const m = str.match(/^\/([\s\S]*)\/([a-z]*)$/i)
      if (m) {
        try {
          rules.push({ match: new RegExp(m[1], m[2]), message: el.validation_message || `${label}格式不正确` })
        } catch { /* 非法正则忽略 */ }
      }
    } else if (str.includes('${')) {
      rules.push({
        validator: (value, callback) => {
          try {
            const ok = evalDynamicExpr(str, getFormValues?.() || {})
            if (ok) callback()
            else callback(el.validation_message || `${label}校验不通过`)
          } catch { callback() }
        },
      })
    }
  }
  return rules.length ? rules : undefined
}

/**
 * 解析元素默认值 default_value：
 * - 输入类：字符串原样作为输入框内容
 * - 下拉/单选（select/radio/treeselect 单选）：值字符串（匹配选项 value）
 * - 多选（checkbox/multi_select/treeselect 多选）：JSON 数组（'["a","b"]'）或逗号分隔（"a,b"）
 * - 无法解析时原样返回
 */
const parseDefaultValue = (raw, elementType) => {
  if (raw == null || raw === '') return undefined
  try {
    const v = JSON.parse(raw)
    // 数组/对象按结构化值返回（多选默认选中项、树选择等）
    if (Array.isArray(v)) return v
    if (v !== null && typeof v === 'object') return v
    return raw
  } catch (e) {
    // 多选型支持逗号分隔字符串
    if (['checkbox', 'multi_select', 'treeselect'].includes(elementType) && String(raw).includes(',')) {
      return String(raw)
        .split(',')
        .map((x) => x.trim())
    }
    return raw
  }
}

/** 正则转义（列路径匹配用） */
const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * 收集全部字段定义：顶层元素 + 各表（table）的列。
 * 列与元素同结构解析（element_type/data_source/actions/default_value/dynamic_states），
 * 运行时统一按字段定义加载动态选项，保证子表列与主表元素能力一致。
 */
const collectFieldDefs = (elements) => {
  const defs = []
  ;(elements || []).forEach((el) => {
    defs.push({ ...el, __isColumn: false })
    if (el.element_type === 'table' && Array.isArray(el.columns)) {
      el.columns.forEach((col) => {
        defs.push({
          ...col,
          __isColumn: true,
          __tableKey: el.table_key || el.id || '',
          field_key: col.dataIndex || col.field_key,
        })
      })
    }
  })
  return defs
}

/** 规范化动态接口地址：绝对 URL 原样保留；/api/v1 前缀去掉（request 实例 baseURL 已含）；其余作为相对路径 */
const normalizeApiUrl = (url) => {
  if (!url) return ''
  if (/^https?:\/\//.test(url)) return url
  return url.replace(/^\/api\/v1/, '')
}

/**
 * 动态接口请求构造：解析 url 模板（${form.xxx} / ${item.xxx}）与 params 表达式后发起请求。
 * cfg.url / cfg.api_url 均可（数据源用 url，联动动作用 api_url）。
 */
const requestDynamicApi = async (cfg, vars) => {
  const url = normalizeApiUrl(resolveExpr(cfg?.url || cfg?.api_url, vars))
  const params = resolveParams(cfg?.params, vars)
  const method = (cfg?.method || 'GET').toUpperCase()
  return request({
    url,
    method,
    params: method === 'GET' ? params : undefined,
    data: method === 'GET' ? undefined : params,
  })
}

/** 判断联动写入标记是否命中当前变化值（写回触发字段时跳过二次联动） */
const isLinkWritten = (lw, key, val) => {
  if (!lw || !Object.prototype.hasOwnProperty.call(lw, key)) return false
  try {
    return JSON.stringify(lw[key]) === JSON.stringify(val)
  } catch {
    return lw[key] === val
  }
}

/** 解析请求参数：JSON 字符串（含表达式）或对象（值含表达式）统一转为普通对象 */
const resolveParams = (params, vars) => {
  if (!params) return {}
  if (typeof params === 'string') {
    const str = resolveExpr(params, vars)
    if (!String(str).trim()) return {}
    try {
      return JSON.parse(str)
    } catch (e) {
      return {}
    }
  }
  if (typeof params === 'object') {
    const out = {}
    for (const [k, v] of Object.entries(params)) {
      out[k] = typeof v === 'string' ? resolveExpr(v, vars) : v
    }
    return out
  }
  return {}
}

/**
 * 递归提取动态接口响应中的选项数组：
 * - 直接数组：[...]
 * - 常见包裹：{ data: [...] } / { data: { list: [...] } } / { list: [...] } / { records: [...] } / { rows: [...] }
 * - 分页结构：{ data: { list: [...], page, size, total } }
 * - 递归深度上限 3，避免意外深层循环
 */
const findListData = (obj, depth = 0) => {
  if (depth > 3) return undefined
  if (Array.isArray(obj)) return obj
  if (obj && typeof obj === 'object') {
    // 优先常见列表字段名
    for (const key of ['list', 'records', 'rows', 'items', 'data', 'content', 'recordsList']) {
      if (Array.isArray(obj[key])) return obj[key]
    }
    // 无命中时递归深入对象值（如 data = { list: [...] } / data = { data: [...] }）
    for (const v of Object.values(obj)) {
      const found = findListData(v, depth + 1)
      if (found) return found
    }
  }
  return undefined
}

/**
 * 将动态接口响应转为选项数组：
 * - 数组提取见 findListData（兼容多级/分页包裹）
 * - 元素可为 {label,value} 或 {name,id,title,code} 或原始值
 * - data_source.label 支持 ${item.xxx} 表达式（动态接口的"显示标签"，item 为列表元素，支持点路径如 ${item.dept.name}）
 */
const extractOptions = (resp, ds, vars) => {
  const list = findListData(resp)
  if (!Array.isArray(list)) return []
  // 单个数据项 → 选项节点：label/title 双字段（Select 用 label，TreeSelect 用 title），
  // 树形结构（treeselect）递归保留 children，避免拍平后树节点丢失
  const mapItem = (item) => {
    if (item == null) return null
    if (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') {
      return { label: String(item), title: String(item), value: String(item) }
    }
    const labelExpr = ds?.label
    let label
    if (labelExpr) {
      const r = resolvePath(labelExpr, { form: vars?.form, item })
      // 拼接/前缀命中取解析值；纯文本（无 ${} 无前缀）原样显示
      label = r.matched ? r.value : String(labelExpr)
    } else {
      label = item.label ?? item.name ?? item.title ?? ''
    }
    if (label === undefined || label === null) label = ''
    // 对应值 value_field：显式指定选项 value 取哪个字段（支持表达式 ${item.id}），
    // 例：接口数据项字段为 id、而当前表单字段（field_key）为 user_id 时，配置 value_field=id，
    // 选项 value 即取 item.id；留空默认按 value / id / key / code 顺序兜底
    const vf = ds?.value_field
    let value
    if (vf && String(vf).trim()) {
      const vfStr = String(vf).trim()
      const r = resolvePath(vfStr, { form: vars?.form, item })
      // 表达式/前缀命中取解析值；无前缀按选项项字段取（如 id）
      value = r.matched ? r.value : item?.[vfStr]
      if (value === undefined || value === null || value === '') value = ''
    } else {
      value = item.value ?? item.id ?? item.key ?? item.code
    }
    const node = {
      label: String(label ?? ''),
      title: String(label ?? ''),
      // 保留原始类型（数字/字符串）：接口字段与表单值同源，字符串化会导致
      // 回填（如 user_id=1 数字）与选项 value（"1" 字符串）严格匹配失败，Select 显示 raw value
      value: value === undefined || value === null ? '' : value,
      raw: item,
    }
    if (Array.isArray(item.children) && item.children.length) {
      node.children = item.children.map(mapItem).filter(Boolean)
    }
    return node
  }
  return list.map(mapItem).filter((o) => o && o.label)
}

/** 运行时表单上下文：向选项型控件提供动态选项、向元素容器提供失焦回调 */
export const RuntimeFormContext = createContext(null)

/**
 * 运行时交互 Hook：动态数据源(api)加载 + 事件驱动联动(actions)执行。
 * 仅在 pageType='form'（实际填写）时启用；画布/详情只读不触发。
 */
const useRuntimeForm = ({ elements, form, pageType, app }) => {
  const [apiOptions, setApiOptions] = useState({})
  const isRuntime = pageType === 'form'
  const formRef = useRef(null)
  // 联动写入标记：set_value/fetch_and_fill 写入的字段值，onValuesChange 识别并跳过（防写回触发字段导致二次联动）
  const linkWrittenRef = useRef({})
  formRef.current = form
  // 最新动态选项（联动 set_value 需按选中项 raw 取值）
  const apiOptionsRef = useRef({})
  apiOptionsRef.current = apiOptions
  const elementsRef = useRef([])
  elementsRef.current = elements

  /** 加载某元素动态接口选项（data_source.type='api'） */
  const loadOptions = useCallback(async (el, allValues) => {
    const ds = el.data_source
    if (!ds?.url) return
    const vars = { form: allValues || {} }
    // 先解析 URL 中的 ${form.xxx} / ${item.xxx} 路径模板，避免 ${} 被请求层整体编码
    try {
      const res = await requestDynamicApi(ds, vars)
      const options = extractOptions(res?.data ?? res, ds, vars)
      // 先同步更新 ref，保证紧随其后的补联动能取到刚加载的选项（state 提交是异步的）
      apiOptionsRef.current = { ...apiOptionsRef.current, [el.id]: options }
      setApiOptions((prev) => ({ ...prev, [el.id]: options }))
      // 选项加载完成：若该元素当前已有值（默认值/回填）且配置了 on_change，
      // 补跑一次联动以按选中项填充字段（默认值设置时机早于选项加载，正常联动取不到选中项数据）
      const cur = formRef.current?.getFieldValue?.(el.field_key)
      if ((el.actions?.on_change?.length || 0) > 0 && cur !== undefined && cur !== null && cur !== '') {
        runActionsRef.current?.('on_change', el, formRef.current?.getFieldsValue?.() || {})
      }
    } catch (e) {
      // 动态接口请求失败：保留空选项，不打断表单
    }
  }, [])

  /** 执行 fetch_and_fill 动作：请求接口并按 target_mapping 填充目标字段 */
  const runFetchFill = useCallback(async (action, allValues, currentObj) => {
    // vars：form = 表单值；item = 选中项数据（api_url 中显式写 ${item.xxx} 引用）
    const vars = { form: allValues || {}, item: currentObj }
    // 先解析 URL 中的 ${form.xxx} / ${item.xxx} 路径模板，避免 ${} 被请求层整体编码
    try {
      const res = await requestDynamicApi(action, vars)
      const data = res?.data ?? res
      const mapping = Array.isArray(action.target_mapping) ? action.target_mapping : []
      const patch = {}
      for (const m of mapping) {
        if (m?.target) {
          // source 为响应数据字段路径（点路径，如 profile.nickname）
          const v = getByPath(data, String(m.source || ''))
          if (v !== undefined) patch[m.target] = v
        }
      }
      if (Object.keys(patch).length) {
        linkWrittenRef.current = { ...patch }
        formRef.current?.setFieldsValue?.(patch)
      }
    } catch (e) {
      // 填充失败不打断流程
    }
  }, [])

  /** 执行某元素指定触发时机的全部动作（set_value / fetch_and_fill）；colCtx 为子表列上下文（tableKey/index/fieldKey） */
  const runActions = useCallback(
    (trigger, el, allValues, colCtx) => {
      const actions = Array.isArray(el.actions?.[trigger]) ? el.actions[trigger] : []
      for (const action of actions) {
        if (!action?.action_type) continue
        // 触发字段当前值 + 选中项完整数据（set_value / fetch_and_fill 共用）：
        // 触发字段值读 tableKey[index].colKey（列场景）或 field_key（普通场景）
        const currentVal = colCtx
          ? formRef.current?.getFieldValue?.([colCtx.tableKey, colCtx.index, colCtx.fieldKey])
          : el?.field_key
            ? formRef.current?.getFieldValue?.(el.field_key)
            : undefined
        // 选中项完整数据：优先从该元素动态选项 raw 中匹配，回退为 { 字段: 值 }
        const opts = apiOptionsRef.current[el?.id] || []
        const sel = findOptionByValue(opts, currentVal)
        const currentObj = sel?.raw || { [colCtx?.fieldKey || el?.field_key]: currentVal }
        if (action.action_type === 'set_value') {
          const list = Array.isArray(action.value) ? action.value : []
          const patch = {}
          for (const m of list) {
            if (m?.target) {
              // 保护：目标字段等于触发字段自身时跳过写入。
              // 选项型字段（select/radio/treeselect 等）的值应为选项 value（如 id），
              // 若把选中项文本（如 username）覆盖到自身，值将不再匹配任何选项，
              // 导致 label 无法渲染、校验误报"不能为空"。
              const selfTarget = colCtx ? colCtx.fieldKey === m.target : m.target === el.field_key
              if (selfTarget) continue
              const src = m.source
              let v
              if (typeof src === 'string' && src.includes('${')) {
                // 拼接表达式：form = 表单值；item = 触发元素选中项数据
                v = resolveExpr(src, { form: allValues, item: currentObj })
              } else if (src != null) {
                // 独立路径：item.xxx 取选中项字段 / form.xxx 取表单字段；无前缀按选中项字段取
                const r = resolvePath(src, { form: allValues, item: currentObj })
                v = r.matched ? r.value : getByPath(currentObj, src)
                if (v === undefined || v === null) v = ''
              }
              // 目标字段：列场景为同行 target（tableKey[索引].target，与 Arco Form.List 字段路径一致）
              const targetKey = colCtx ? `${colCtx.tableKey}[${colCtx.index}].${m.target}` : m.target
              // 与当前值相同则跳过，避免无效写入反复触发 onValuesChange 造成循环
              if (v !== undefined && v !== formRef.current?.getFieldValue?.(targetKey)) {
                patch[targetKey] = v
              }
            }
          }
          if (Object.keys(patch).length) {
            linkWrittenRef.current = { ...patch }
            formRef.current?.setFieldsValue?.(patch)
          }
        } else if (action.action_type === 'fetch_and_fill') {
          // 传入选中项完整数据：api_url 中的 ${item.xxx} / ${form.xxx} 均可解析
          runFetchFill(action, allValues, currentObj)
        }
      }
    },
    [runFetchFill],
  )

  // 用 ref 持有最新回调，避免 useEffect 依赖链（on_mount 仅随 elements 变化执行一次）
  const runActionsRef = useRef(null)
  runActionsRef.current = runActions
  const loadOptionsRef = useRef(null)
  loadOptionsRef.current = loadOptions

  // 挂载：应用默认值 + 执行 on_mount 动作 + 初始加载全部 api 动态选项
  useEffect(() => {
    if (!isRuntime || !elements?.length) return
    const vals = formRef.current?.getFieldsValue?.() || {}
    // 应用默认值 default_value：仅字段当前为空时填充（输入框->内容，选择型->默认选中）
    const defPatch = {}
    elements.forEach((el) => {
      if (el.default_value === undefined || el.default_value === '') return
      const current = formRef.current?.getFieldValue?.(el.field_key)
      if (current === undefined || current === null || current === '') {
        const def = parseDefaultValue(el.default_value, el.element_type)
        if (def !== undefined) defPatch[el.field_key] = def
      }
    })
    if (Object.keys(defPatch).length) formRef.current?.setFieldsValue?.(defPatch)
    // 顶层元素：on_mount 动作（列级 on_mount 无行上下文，由列默认值/初始化承担）
    elements.forEach((el) => {
      runActionsRef.current?.('on_mount', el, vals)
    })
    // 全部字段定义（主表元素 + 子表列）：加载 api 动态选项（列与元素同结构解析）
    collectFieldDefs(elements).forEach((el) => {
      if (OPTION_ELEMENT_TYPES.has(el.element_type) && el.data_source?.type === 'api') {
        loadOptionsRef.current?.(el, vals)
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elements, isRuntime])

  /** 值变化：执行 on_change 动作；依赖字段变化的 api 选项刷新 */
  const handleValuesChange = useCallback((changed, allValues) => {
    // 仅填写场景（pageType='form'）启用联动：detail 展示/审批场景无填写交互，
    // 且 Arco setFieldsValue 回填也会触发 onValuesChange——若此处执行 on_change，
    // 无选中项上下文时 set_value 会把目标字段清空（如 user_id 联动清空 phone/email）
    if (!isRuntime) return
    const changedKeys = Object.keys(changed || {})
    elementsRef.current.forEach((el) => {
      const actions = el.actions?.on_change
      // on_change 语义：仅当该元素自身字段值变化时触发；
      // 联动写入（set_value/fetch_and_fill 的目标）按 linkWrittenRef 标记跳过，避免写回触发字段造成二次联动
      if (Array.isArray(actions) && actions.length && changedKeys.includes(el.field_key)) {
        const lw = linkWrittenRef.current
        const val = changed[el.field_key]
        const isLinkWrite = isLinkWritten(lw, el.field_key, val)
        if (isLinkWrite) {
          delete lw[el.field_key]
        } else {
          runActionsRef.current?.('on_change', el, allValues)
        }
      }
      const deps = apiOptionDeps(el)
      if (deps && changedKeys.some((k) => deps.has(k))) {
        loadOptionsRef.current?.(el, allValues)
      }
      // 子表列：与元素同结构解析——on_change（同行联动）与 api 选项刷新
      if (el.element_type === 'table' && Array.isArray(el.columns)) {
        const tableKey = el.table_key || el.id || ''
        el.columns.forEach((col) => {
          const colKey = col.dataIndex || col.field_key
          if (!colKey) return
          // 命中 tableKey[索引].colKey（Arco Form.List 实际格式）或 tableKey.索引.colKey 变化：触发该列 on_change（同行联动）
          // 用字符串前缀+后缀匹配替代每次 new RegExp，高频字段变更下避免反复编译正则
          const suffix = `.${colKey}`
          const rowHit = changedKeys.find((k) => k.startsWith(tableKey) && k.endsWith(suffix))
          if (rowHit) {
            // 提取索引：tableKey[3].colKey -> 3；tableKey.3.colKey -> 3
            const idxMatch = rowHit.match(/\[(\d+)\]|\.(\d+)\./)
            const idx = Number(idxMatch ? idxMatch[1] || idxMatch[2] : 0)
            const colActions = col.actions?.on_change
            if (Array.isArray(colActions) && colActions.length) {
              runActionsRef.current?.('on_change', col, allValues, { tableKey, index: idx, fieldKey: colKey })
            }
          }
          // 列 api 选项刷新：依赖字段变化（顶层字段或同行字段）时重新加载
          const colDeps = apiOptionDeps(col)
          if (
            colDeps &&
            [...colDeps].some(
              (d) => changedKeys.includes(d) || changedKeys.some((k) => k.endsWith(`.${d}`))
            )
          ) {
            loadOptionsRef.current?.(col, allValues)
          }
        })
      }
    })
  }, [])

  /** 元素失焦：执行 on_blur 动作 */
  const handleElementBlur = useCallback(
    (el) => {
      if (!isRuntime) return
      const vals = formRef.current?.getFieldsValue?.() || {}
      runActionsRef.current?.('on_blur', el, vals)
    },
    [isRuntime],
  )

  // getOptions 依赖 apiOptions 变化重建；getFormValues 经 ref 读取可稳定引用
  const getOptions = useCallback((el) => apiOptionsRef.current?.[el.id] || apiOptions[el.id], [apiOptions])
  const getFormValues = useCallback(() => formRef.current?.getFieldsValue?.() || {}, [])

  const contextValue = useMemo(
    () => ({
      getOptions,
      handleElementBlur,
      getFormValues,
      appCode: app?.code || '',
    }),
    [getOptions, handleElementBlur, getFormValues, app?.code],
  )

  return { contextValue, handleValuesChange }
}

/** 元素容器：仅对配置了 on_blur 动作的元素包一层 blur 捕获（focusout 冒泡），触发联动 */
const RuntimeFieldWrap = ({ el, children }) => {
  const rt = useContext(RuntimeFormContext)
  const hasBlur = Array.isArray(el.actions?.on_blur) && el.actions.on_blur.length > 0
  if (!hasBlur) return <>{children}</>
  return <div onBlurCapture={() => rt?.handleElementBlur?.(el)}>{children}</div>
}

/**
 * 元素属性面板总分发：基础组件 → 专属 renderSettings；常规控件 → 通用属性面板
 * LayoutManage 右侧"元素属性"Tab 统一调用此函数，无需再关心具体类型。
 */
export const renderElementSettings = (el, ctx) => {
  // 基础元素（divider/table）走 BASE_ELEMENT_CONFIGS；
  // 常规元素走 ELEMENT_RENDER_CONFIG 自带的 renderSettings；
  // 都没有时回退通用配置。
  const baseCfg = getBaseElementConfig(el.element_type)
  if (baseCfg?.renderSettings) return baseCfg.renderSettings(ctx)
  const runtimeCfg = ELEMENT_RENDER_CONFIG[el.element_type]
  if (runtimeCfg?.renderSettings) return runtimeCfg.renderSettings(ctx)
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
 * 将表单 values 中的时间字段序列化为 MySQL 兼容格式（提交前统一调用）：
 * 依据表单元素配置（含 table 子表的列配置）识别时间类型字段（TIME_ELEMENT_TYPES），
 * 主表字段与子表行内字段均转换：
 * - date / datepicker → YYYY-MM-DD
 * - datetime         → YYYY-MM-DD HH:mm:ss
 * - time / timepicker → HH:mm:ss
 * 统一复用 formatTimeValue，第三个参数传原值（value）实现空值透传，避免污染提交数据。
 * @param {Object} values   表单校验后的提交值
 * @param {Object[]} elements 表单元素配置（form_layout_json.elements / detail_layout_json.elements）
 * @returns {Object} 序列化后的提交值
 */
export function serializeTimeFields(values, elements) {
  if (!values || !Array.isArray(elements)) return values
  const next = { ...values }
  for (const el of elements || []) {
    if (el.element_type === 'table') {
      // 子表（Form.List）：注册字段名是 table_key（非 field_key），需按 table_key 定位行数据
      const tableKey = el.table_key || el.field_key || el.id || ''
      if (!tableKey) continue
      const rows = Array.isArray(next[tableKey]) ? next[tableKey] : []
      // 关键：Arco Form.List 删除最后一行后字段值会变为 undefined，对象展开后 JSON.stringify
      // 会丢弃该 key，导致请求体缺少子表字段，后端无法感知"子表已删光"而残留旧记录。
      // 统一归一为数组（未传 / 删光 -> []），确保请求体始终携带子表 key，
      // 后端才能执行"先清后插"同步删除已移除的子表行。
      next[tableKey] = rows.map((row) => {
        if (!row || typeof row !== 'object') return row
        const nr = { ...row }
        // 遍历行内时间列（date/datetime/time 等）统一序列化为 MySQL 兼容格式
        for (const col of el.columns || []) {
          const colKey = col.dataIndex || col.field_key
          if (
            colKey &&
            TIME_ELEMENT_TYPES.includes(col.element_type) &&
            nr[colKey] != null &&
            nr[colKey] !== ''
          ) {
            nr[colKey] = formatTimeValue(nr[colKey], col.element_type, nr[colKey])
          }
        }
        return nr
      })
      continue
    }
    const key = el?.field_key
    if (!key) continue
    if (TIME_ELEMENT_TYPES.includes(el.element_type) && next[key] != null && next[key] !== '') {
      next[key] = formatTimeValue(next[key], el.element_type, next[key])
    }
  }
  return next
}

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
const ReadonlyValue = ({ value, elementType, dataSource, renderUpload }) => {
  // upload 类型：解析 JSON 字符串或数组，渲染文件链接/图片预览
  if (elementType === 'upload') {
    let list = value
    if (typeof list === 'string') {
      try { list = JSON.parse(list) } catch { list = null }
    }
    return <UploadReadOnlyList list={list} />
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

// upload 只读文件列表渲染
const UploadReadOnlyList = ({ list }) => {
  if (!Array.isArray(list) || list.length === 0) return <span className="text-gray-400">-</span>
  return (
    <div className="flex flex-col gap-1">
      {list.map((f, i) => {
        const url = f?.url || ''
        const name = f?.name || url
        const isImg = /\.(png|jpg|jpeg|gif|webp|bmp)$/i.test(name)
        return isImg ? (
          <a key={i} href={url} target="_blank" rel="noreferrer">
            <img src={url} alt={name} className="h-16 w-16 rounded border object-cover" />
          </a>
        ) : (
          <a key={i} href={url} target="_blank" rel="noreferrer" className="text-blue-600 break-all">
            {name}
          </a>
        )
      })}
    </div>
  )
}

/**
 * 渲染单个表单控件项（标签 / 栅格 / 校验规则 / 控件），画布与常规模式共用。
 * @param {object} el   布局元素
 * @param {object} ctx  渲染上下文 { isHorizontal, formConfig, pageType, isMoveMode }
 */
const renderFormItemElement = (el, ctx) => {
  const { isHorizontal, formConfig, pageType, isMoveMode, fieldPerms, editable, detailDynamicStates } = ctx
  const noLabel = isNoLabelElement(el.element_type)
  const isTableElement = el.element_type === 'table'
  const isFormMode = pageType === 'form'
  const isDetailMode = pageType === 'detail'
  // 审批节点字段权限：仅待办审批（editable）详情（detail）场景下 perm=2（可编辑）的字段渲染可编辑控件
  const permEditable =
    editable &&
    pageType === 'detail' &&
    (fieldPerms || []).find((p) => p && p.field === el.field_key)?.perm === 2

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

  // 校验规则：表格元素校验移交给内部 Form.List；详情只读不校验；
  // 常规元素由 rules 统一承载（required 必填 + validation_rule 正则/表达式），
  // Arco 依据 rules 中的 required 自动渲染必填星号，表达式校验经 ctx.runtime.getFormValues 求值
  const rules = isTableElement || isDetailMode
    ? undefined
    : buildValidationRules(el, () => ctx.runtime?.getFormValues?.() || {}, false, false)

  // 控件渲染分发：
  // - 详情只读模式（pageType='detail'）：常规控件与字段型组件（如 upload）渲染为纯文本（空值显示 '-'），
  //   divider 保持分割线、table 走表格只读逻辑
  // - 其余模式：基础组件走专属配置（传原始 pageType，表格据此区分 form/move-form 可编辑、
  //   detail 纯文本、move-detail 画布禁用预览）；常规控件走统一渲染配置中心
  const renderControl = () => {
    if (el.element_type === 'table') {
      // 表格（子表）：透传字段权限，支持 detail 下按列 perm=2 渲染可编辑控件
      return <TableElementField el={el} pageType={pageType} fieldPerms={fieldPerms} editable={editable} />
    }
    // detail 只读：upload 走专属只读渲染（文件链接/图片预览），其他走 ReadonlyValue
    if (pageType === 'detail' && el.element_type !== 'divider' && !permEditable) {
      if (el.element_type === 'upload') {
        return <ReadonlyValue elementType={el.element_type} dataSource={el.data_source} renderUpload />
      }
      return <ReadonlyValue elementType={el.element_type} dataSource={el.data_source} />
    }
    const baseCfg = getBaseElementConfig(el.element_type)
    if (baseCfg?.renderPreview) return baseCfg.renderPreview(el, pageType)
    const render = renderPreviewConfig[el.element_type]
    if (render) return render(el, pageType, ctx.runtime)
    return <Input disabled={!isFormMode && !permEditable} placeholder={el.placeholder || undefined} />
  }

  // 内部 FormItem 渲染（extra 可覆盖 hidden/disabled 等属性）
  const renderItem = (extra) => (
    <FormItem
      field={isTableElement ? undefined : el.field_key || el.name || undefined}
      label={noLabel ? '' : el.label}
      labelCol={labelCol}
      wrapperCol={wrapperCol}
      rules={rules}
      noStyle={noLabel}
      {...extra}
    >
      {renderControl()}
    </FormItem>
  )

  // 动态状态（visible_if / disabled_if）：通过 Form.Item shouldUpdate 监听依赖字段变化并重新渲染
  // - hidden 关联 visible_if：表达式不成立时隐藏该字段
  // - disabled 关联 disabled_if：表达式成立时禁用/只读该字段
  // - 画布（isMoveMode）不应用动态状态，设计时始终完整展示
  const ds = el.dynamic_states
  if ((ds?.visible_if || ds?.disabled_if) && !isMoveMode) {
    // detail 只读（字段级不可编辑）：使用父组件按完整业务数据预计算的静态映射，
    // 无需响应式监听，同时绕开 Arco setFieldsValue 同批写入依赖/目标字段时的快照覆盖问题
    if (isDetailMode && !permEditable && ctx.detailDynamicStates) {
      const st = ctx.detailDynamicStates[el.field_key]
      if (st) return renderItem({ hidden: !st.visible, disabled: st.disabled })
    }
    const deps = extractFormDeps([ds.visible_if, ds.disabled_if].filter(Boolean).join(' '))
    // 自身字段也纳入依赖：setFieldsValue 回填/联动写入该字段时 shouldUpdate 需感知变化并重新渲染，
    // 否则 store 值已更新但 UI 仍停留在旧值（如详情回填 phone 后显示空）
    if (el.field_key) deps.add(el.field_key)
    return (
      <Form.Item
        shouldUpdate={deps.size ? (prev, cur) => [...deps].some((d) => prev[d] !== cur[d]) : true}
        noStyle
      >
        {(formData) => {
          const values = formData || {}
          const visible = ds.visible_if ? evalDynamicExpr(ds.visible_if, values) : true
          const disabled = ds.disabled_if ? evalDynamicExpr(ds.disabled_if, values) : false
          return renderItem({ hidden: !visible, disabled })
        }}
      </Form.Item>
    )
  }

  return renderItem()
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
 * @param {Array}    fieldPerms           字段权限 [{field, perm}]：perm=1 隐藏（不渲染）、perm=2 可编辑（正常渲染）；
 *                                        未配置权限的字段默认渲染。审批详情场景由实例详情接口返回当前节点 field_perms。
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
  fieldPerms,
  editable = false,
  detailDynamicStates,
}) {
  // 布局解析缓存：仅当布局 JSON 变化时重新解析，拖拽/选中等状态更新不触发重复解析
  const layout = useMemo(() => parseLayoutJson(app?.form_layout_json), [app?.form_layout_json])
  const elements = layout?.elements || []
  const formConfig = layout?.formConfig || DEFAULT_FORM_CONFIG

  // 运行时交互：动态数据源(api)选项加载 + 事件联动(actions)执行（仅 pageType='form' 启用）
  const { contextValue, handleValuesChange } = useRuntimeForm({ elements, form, pageType, app })

  const isMoveMode = pageType === 'move-form' || pageType === 'move-detail'
  // 表单渲染上下文（画布元素 memo 依赖）：仅当 formConfig / pageType 变化时重建，
  // 拖拽悬停、选中等高频状态更新不改变该引用，CanvasElement 可跳过无关重渲染
  const formCtx = useMemo(
    () => ({
      isHorizontal: formConfig.layout === 'horizontal',
      formConfig,
      pageType,
      isMoveMode,
      fieldPerms,
      editable,
      detailDynamicStates,
    }),
    [formConfig, pageType, isMoveMode, fieldPerms, editable, detailDynamicStates],
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
      disabled={
        pageType !== 'form' &&
        !(pageType === 'detail' && editable && (fieldPerms || []).some((p) => p && p.perm === 2))
      }
      autoComplete="off"
      onValuesChange={(changed, allValues) => {
        handleValuesChange(changed, allValues)
        onValuesChange?.(allValues)
      }}
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
          : elements
              .filter((el) => {
                // 字段权限过滤：perm=1（隐藏）不渲染；未配置权限的字段默认渲染
                if (!fieldPerms || !el.field_key) return true
                const fp = fieldPerms.find((p) => p && p.field === el.field_key)
                return !fp || fp.perm !== 1
              })
              .map((el, index) => (
                <Col span={el.width || 24} key={el.id || `el_${el.element_type}_${index}`}>
                  <RuntimeFieldWrap el={el}>
                    {renderFormItemElement(el, { ...formCtx, runtime: contextValue })}
                  </RuntimeFieldWrap>
                </Col>
              ))}
      </Row>
    </Form>
  )

  // 画布模式：外层虚线容器承载空白区拖拽/点击，内部渲染元素表单
  let node
  if (isMoveMode) {
    node = (
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
  } else if (!elements.length) {
    node = (
      <>
        <Empty description="该应用暂未配置表单布局" />
      </>
    )
  } else {
    node = formNode
  }

  return <RuntimeFormContext.Provider value={contextValue}>{node}</RuntimeFormContext.Provider>
}
