import {
  Button,
  Form,
  Input,
  InputNumber,
  Select,
  Switch,
  Table,
  Tag,
} from '@arco-design/web-react'
import { IconDelete, IconPlus } from '@arco-design/web-react/icon'
import { useCallback, useContext, useEffect, useMemo } from 'react'
import { useAuth } from 'src/store/auth-context'

import { evalDynamicExpr } from '../utils/evalExpression'
import {
  buildValidationRules,
  extractFormDeps,
  parseDefaultValue,
} from '../utils/formUtils'
import { RuntimeFormContext } from './runtimeContext'

/**
 * 表格元素（组件库/基础）：运行时组件、设计器设置面板与列配置工具独立维护；
 * 注册结构（meta + 引用）保留在 elementConfig.jsx 的 BASE_ELEMENT_CONFIGS 中。
 * 为避免与渲染配置中心循环依赖，列单元格渲染所需的 renderPreviewConfig / ReadonlyValue 由调用方注入。
 *
 * 导出清单：
 *   - TableElementField         表格运行时组件（Form.List 多行录入 + 只读回显）
 *   - renderTableSettings       设计器设置面板（BASE_ELEMENT_CONFIGS.table 注册）
 *   - genColumn / addColumn / removeColumn / updateColumn  表格列配置工具（LayoutManage 转发引用）
 */

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

// ==================== 表格运行时组件 ====================

const SummaryRow = Table.Summary.Row
const SummaryCell = Table.Summary.Cell
const FormItem = Form.Item
const FormList = Form.List

/**
 * 表格组件（table）字段：基于 Arco Form.List 的多行数据录入表格。
 * - Form.List field 绑定 el.table_key，行数据以 table_key[index].colKey 嵌套路径注册到 Form store
 * - 校验规则挂在 Form.List 上（整体至少一行 + 必填列非空），错误通过 useFormState 读取并显示在表格底部
 * - form / move-form：可编辑模式，显示"新增"按钮与行内"删除"按钮，行内控件可交互
 * - detail / move-detail：只读模式（真实详情 / 画布详情预览注入 mock 数据），
 *   行内单元格渲染为纯文本（ReadonlyValue，空值 '-'）
 */
export const TableElementField = ({
  el,
  pageType,
  fieldPerms,
  editable,
  renderPreviewConfig: rpc,
  ReadonlyValue: ReadonlyValueCmp,
}) => {
  // 运行时上下文：列控件动态选项（api 数据源，与主表元素同结构解析）
  const rt = useContext(RuntimeFormContext)
  // 可编辑：实际填写（form）与画布表单页（move-form）
  const isEditable = pageType === 'form' || pageType === 'move-form'
  // 详情只读：真实详情页（detail）与画布详情预览（move-detail，注入 mock 数据）均渲染纯文本
  const isReadonlyText = pageType === 'detail' || pageType === 'move-detail'
  const { form } = Form.useFormContext()
  // 当前登录用户：供列默认值中的 ${user.xxx} 表达式求值
  const { user } = useAuth()
  // Form.List 字段名：优先关联子表名（table_key），其次元素 id 兜底
  const listField = el.table_key || el.id || 'table'
  // 按列 default_value 生成一行默认数据（列与元素同结构解析）
  const genDefaultRow = useCallback(() => {
    const row = {}
    ;(el.columns || []).forEach((col) => {
      const key = col.dataIndex || col.field_key
      if (key && col.default_value !== undefined && col.default_value !== '') {
        const def = parseDefaultValue(col.default_value, col.element_type, { user })
        if (def !== undefined) row[key] = def
      }
    })
    return row
  }, [el.columns, user])
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

  // 画布详情预览（move-detail）与真实详情（detail）共用同一只读管线：
  // 数据由 MoveDetailMode 注入 mock 行，此处不特判，直接走下方 FormList + 列只读渲染

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
            align: col.align || undefined,
            width: col.width || undefined,
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
              const renderFn = rpc[col.element_type]
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
                    renderFn(col, pageType, rt)
                  ) : isReadonlyText ? (
                    <ReadonlyValueCmp
                      value={cellValue}
                      elementType={col.element_type}
                      dataSource={col.data_source}
                      el={col}
                      rt={rt}
                      pageType={pageType}
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
                      renderFn(col, pageType, rt)
                    ) : isReadonlyText ? (
                      <ReadonlyValueCmp
                        elementType={col.element_type}
                        dataSource={col.data_source}
                        el={col}
                        rt={rt}
                        pageType={pageType}
                      />
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
            <Button status="danger" onClick={() => remove(index)}>
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
                            style={{
                              ...cellStyle,
                              textAlign: col.align || 'center',
                            }}
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
                <Button type="primary" icon={<IconPlus />} onClick={() => add(genDefaultRow())}>
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

// ==================== 设计器设置面板 ====================

/** 表格设计器设置面板：关联子表 / 列配置 / 开启合计 / 列合计配置（ctx 由 LayoutManage 注入） */
export const renderTableSettings = ({
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
      placeholder="选择关联子表"
      value={selectedElement.table_key || undefined}
      onChange={handleTableKeyChange}
      options={appTables.subTables.map((tb) => ({ label: tb, value: tb }))}
    />
    <div className="text-sm text-gray-600">列配置</div>
    <div>
      {(selectedElement.columns || []).map((col, idx) => (
      <div key={col.id || `col_${idx}`} className="mb-2 rounded border border-gray-200 p-2">
        <div className="mb-1 flex items-center justify-between">
          <div className="whitespace-nowrap text-gray-500">列 {idx + 1}</div>
          <Button
            size="mini"
            status="danger"
            icon={<IconDelete />}
            onClick={() => removeColumn(updateSelectedElementColumns, col.id)}
          />
        </div>
        <Select
          className="mb-1 w-full"
          placeholder={selectedElement.table_key ? '选择字段' : '请先选择关联子表'}
          value={col.dataIndex || undefined}
          disabled={!selectedElement.table_key}
          loading={Boolean(fieldLoadingKeys[selectedElement.table_key])}
          options={(tableFieldsMap[selectedElement.table_key] || []).map((f) => {
            const fk = f.field_key || f.name || String(f.id)
            return {
              label: `${f.label || f.name || f.field_key}（${fk}）`,
              value: fk,
            }
          })}
          onChange={(v) => handleColumnFieldChange(col.id, selectedElement.table_key, v)}
        />
        <div className="flex items-center gap-2">
          <Select
            className="flex-1"
            size="mini"
            value={col.align || undefined}
            placeholder="对齐"
            options={[
              { label: '左对齐', value: 'left' },
              { label: '居中', value: 'center' },
              { label: '右对齐', value: 'right' },
            ]}
            onChange={(v) =>
              updateSelectedElementColumns(
                (cols) =>
                  cols.map((c, i) => (i === idx ? { ...c, align: v } : c)),
              )
            }
          />
          <InputNumber
            className="flex-1"
            size="mini"
            min={40}
            max={600}
            placeholder="列宽"
            value={col.width || undefined}
            onChange={(v) =>
              updateSelectedElementColumns(
                (cols) =>
                  cols.map((c, i) => (i === idx ? { ...c, width: v || undefined } : c)),
              )
            }
          />
        </div>
      </div>
    ))}
    </div>
    <Button
      icon={<IconPlus />}
      disabled={!selectedElement.table_key}
      onClick={() => addColumn(updateSelectedElementColumns, selectedElement.table_key)}
    >
      添加列
    </Button>
    {(selectedElement.columns || []).some(
      (c) => (c.dataIndex || c.field_key) && c.element_type === 'number',
    ) && (
      <div className="flex justify-between">
        <div className="text-sm text-gray-600">开启合计</div>
        <Switch
          checked={Boolean(selectedElement.showSummary)}
          onChange={(v) => updateSelectedElement({ showSummary: v })}
        />
      </div>
    )}
    {selectedElement.showSummary && (
      <>
        <div className="text-sm text-gray-600">列合计配置</div>
        {(selectedElement.summaryRules || []).map((rule, idx) => (
          <div key={idx} className="flex items-center gap-1">
            <Select
              placeholder="选择参与合计的表格列"
              value={rule.colKey || undefined}
              options={(selectedElement.columns || [])
                .filter((c) => (c.dataIndex || c.field_key) && c.element_type === 'number')
                .map((c) => {
                  const fk = c.dataIndex || c.field_key
                  return {
                    label: `${c.title || fk}（${fk}）`,
                    value: fk,
                  }
                })}
              onChange={(v) =>
                updateSelectedElement({
                  summaryRules: (selectedElement.summaryRules || []).map((r, i) =>
                    i === idx ? { ...r, colKey: v } : r,
                  ),
                })
              }
            />
            <Button
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
)
