import {
  Button,
  Checkbox,
  DatePicker,
  Divider,
  Form,
  Input,
  InputNumber,
  Radio,
  Select,
  Switch,
  Table,
  Tag,
  TimePicker,
  TreeSelect,
} from '@arco-design/web-react'
import { IconDelete, IconPlus } from '@arco-design/web-react/icon'
import { useCallback, useContext, useEffect, useMemo } from 'react'
import { ELEMENT_TYPE_OPTIONS } from 'src/config/app.js'

import { evalDynamicExpr } from '../utils/evalExpression'
import {
  TIME_ELEMENT_TYPES,
  buildValidationRules,
  extractFormDeps,
  formatTimeValue,
  getStaticOptions,
  parseDefaultValue,
} from '../utils/formUtils'

import { DeptReadOnly, renderDeptPreview } from './DeptElement'
import { RuntimeFormContext } from './runtimeContext'
import { renderUploadPreview, renderUploadReadOnly, renderUploadSettings } from './UploadElement'
import { UserReadOnly, renderUserPreview } from './UserElement'

// 运行时表单上下文在此原样再导出：DynamicForm 经 `export { RuntimeFormContext } from './elements/elementConfig'`
// 转发给 modes/UploadElement 等既有调用方，保持单一 Context 定义源（runtimeContext.js）
export { RuntimeFormContext } from './runtimeContext'

const FormItem = Form.Item
const FormList = Form.List
// Table 合计行：summary 回调必须返回 Table.Summary.Row / Cell 组合元素
const SummaryRow = Table.Summary.Row
const SummaryCell = Table.Summary.Cell

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
      <Tag color="arcoblue" size="mini">
        {getTypeLabel(selectedElement.element_type)}
      </Tag>
    </div>
    <div>
      <div className="mb-2 text-sm text-gray-600">字段名称</div>
      <Input
        size="mini"
        value={selectedElement.label}
        onChange={(v) => updateSelectedElement({ label: v })}
        placeholder="请输入字段名称"
      />
    </div>
    <div>
      <div className="mb-2 text-sm text-gray-600">宽度占比</div>
      <Radio.Group
        size="mini"
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
export const TableElementField = ({ el, pageType, fieldPerms, editable }) => {
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
  const genDefaultRow = useCallback(() => {
    const row = {}
    ;(el.columns || []).forEach((col) => {
      const key = col.dataIndex || col.field_key
      if (key && col.default_value !== undefined && col.default_value !== '') {
        const def = parseDefaultValue(col.default_value, col.element_type)
        if (def !== undefined) row[key] = def
      }
    })
    return row
  }, [el.columns])
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
  // 可编辑模式下：子表为空（如草稿回填空数组）时自动加一行，避免空白表格无法填写
  useEffect(() => {
    if (!isEditable) return
    const val = form.getFieldValue(listField)
    if (!Array.isArray(val) || val.length === 0) {
      form.setFieldValue(listField, [genDefaultRow()])
    }
  }, [isEditable, listField, form, genDefaultRow])

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
        const hasRequiredCol = (el.columns || []).some((c) => c.required)
        if ((el.required || hasRequiredCol) && rows.length === 0) {
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
            (p) => p && p.field === colKey && (!p.table_key || p.table_key === el.table_key),
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
                  (a) =>
                    a.action_type === 'set_value' &&
                    Array.isArray(a.value) &&
                    a.value.some((m) => m?.target === hKey),
                )
              })
              const renderFn = renderPreviewConfig[col.element_type]
              if (!renderFn) return <span>{cellValue ?? ''}</span>
              // 审批节点字段权限：仅待办审批（editable）详情（detail）下该列 perm=2（可编辑）→ 渲染可编辑控件
              const colEditableByPerm =
                editable &&
                pageType === 'detail' &&
                (fieldPerms || []).find(
                  (p) => p && p.field === colKey && (!p.table_key || p.table_key === el.table_key),
                )?.perm === 2
              const cellEditable = isEditable || colEditableByPerm
              const colDS = col.dynamic_states
              // 单元格控件渲染（extra 可覆盖 hidden/disabled 等属性）
              const renderCellControl = (extra) => {
                const main = !field ? (
                  // 行未注册到 Form store（如画布空态）：可编辑渲染可交互控件，详情渲染纯文本
                  cellEditable ? (
                    renderFn(col, 'form', rt)
                  ) : isReadonlyText ? (
                    <ReadonlyValue
                      value={cellValue}
                      elementType={col.element_type}
                      dataSource={col.data_source}
                    />
                  ) : (
                    renderFn(col, undefined, rt)
                  )
                ) : (
                  <FormItem
                    field={`${field}.${colKey}`}
                    noStyle
                    {...extra}
                    rules={
                      cellEditable
                        ? buildValidationRules(
                            col,
                            () => form?.getFieldsValue?.() || {},
                            false,
                            true,
                          )
                        : undefined
                    }
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
                          <FormItem
                            key={`${el.table_key}-link-${index}-${hKey}`}
                            field={`${field}.${hKey}`}
                            hidden
                          >
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
                            [...deps].some(
                              (d) =>
                                prev?.[listField]?.[index]?.[d] !== cur?.[listField]?.[index]?.[d],
                            )
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
                <Button
                  size="mini"
                  type="primary"
                  icon={<IconPlus />}
                  onClick={() => add(genDefaultRow())}
                >
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
          <Tag color="arcoblue" size="mini">
            分割线
          </Tag>
        </div>
        <div>
          <div className="mb-2 text-sm text-gray-600">分割线文字</div>
          <Input
            size="mini"
            value={selectedElement.text || ''}
            onChange={(v) => updateSelectedElement({ text: v })}
            placeholder="可选，留空为纯分割线"
          />
        </div>
        <div>
          <div className="mb-2 text-sm text-gray-600">文字位置</div>
          <Radio.Group
            size="mini"
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
          <Tag color="arcoblue" size="mini">
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
