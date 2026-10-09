import { Table } from '@arco-design/web-react'
import { ELEMENT_TYPE_OPTIONS } from 'src/config/app.js'

import { evalDynamicExpr } from '../utils/evalExpression'

/**
 * 画布详情预览模拟数据（move-detail）：
 * 布局管理"详情页"画布的统一模拟渲染，主表单字段（MockDetailValue）与子表表格（MockDetailTable）共用。
 * 独立成文件以避免与渲染配置中心（elementConfig）产生循环依赖。
 */

/** 按元素类型生成与类型匹配的模拟展示值（不解析真实 data_source）；
 * 示例值来自 ELEMENT_TYPE_OPTIONS 的 mockDetailValue（类型注册表单一事实源），未注册的类型回退默认值 */
const getMockDetailValue = (el) =>
  ELEMENT_TYPE_OPTIONS.find((o) => o.value === el?.element_type)?.mockDetailValue ?? '示例值'

/** upload 模拟值：以注册的 mockDetailValue 为基准——单选（multiple === false）显示 1 条、
 * 多选派生 2 条（扩展名前插入序号）；附带元素自身 placeholder 提示（与 renderUploadReadOnly 一致：
 * 提示在上、换行分割用 div 包裹），文件值按链接色（text-blue-600）展示 */
export const MockUploadValue = ({ el }) => {
  const base = ELEMENT_TYPE_OPTIONS.find((o) => o.value === 'upload')?.mockDetailValue ?? '示例附件.pdf'
  const value =
    el?.multiple === false
      ? base
      : `${base}\n${/\.\w+$/.test(base) ? base.replace(/\.(\w+)$/, '2.$1') : `${base}2`}`
  const placeholder = el?.placeholder
  return (
    <div>
      {placeholder ? (
        placeholder.includes('\n') ? (
          <div className="mt-1 text-xs text-gray-400">
            {placeholder.split('\n').map((line, index) => (
              <div key={index}>{line}</div>
            ))}
          </div>
        ) : (
          <div className="mt-1 text-xs text-gray-400">{placeholder}</div>
        )
      ) : null}
      <span className="break-all whitespace-pre-wrap text-blue-600">{value}</span>
    </div>
  )
}

/** 画布详情页预览（move-detail）：主表单字段渲染为模拟数据纯文本（与 ReadonlyValue 同款样式）；
 * upload 字段复用 MockUploadValue（placeholder 提示 + 蓝色模拟文件） */
export const MockDetailValue = ({ el }) =>
  el?.element_type === 'upload' ? (
    <MockUploadValue el={el} />
  ) : (
    <span className="break-all whitespace-pre-wrap">{getMockDetailValue(el)}</span>
  )

/** 画布详情页预览（move-detail）：子表表格渲染 2 行模拟数据 */
export const MockDetailTable = ({ el }) => {
  // 列级可见性（visible_if）：画布预览无表单值，以空上下文求值——与真实表格一致，
  // 表达式不满足的列整列不渲染（列标题 + 单元格）；常量 ${true} 保持显示
  const visibleCols = (el.columns || []).filter((col) => {
    const vif = col.dynamic_states?.visible_if
    if (!vif) return true
    return evalDynamicExpr(vif, {})
  })
  const columns = visibleCols.map((col, i) => {
    const colKey = col.dataIndex || col.field_key || `col_${i + 1}`
    return {
      title: col.title || `列${i + 1}`,
      dataIndex: colKey,
      render: () =>
        col.element_type === 'upload' ? (
          <MockUploadValue el={col} />
        ) : (
          <span className="break-all whitespace-pre-wrap">{getMockDetailValue(col)}</span>
        ),
    }
  })
  const rows = Array.from({ length: 2 }, (_, r) => {
    const row = {}
    columns.forEach((c) => {
      row[c.dataIndex] = `${getMockDetailValue({ element_type: 'input' })}${r + 1}`
    })
    return row
  })
  return (
    <Table
      border
      size="small"
      pagination={false}
      columns={columns}
      data={rows}
      className="mt-2"
    />
  )
}
