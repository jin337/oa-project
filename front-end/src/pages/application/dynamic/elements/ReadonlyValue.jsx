import { ELEMENT_TYPE_OPTIONS } from 'src/config/app.js'

import {
  TIME_ELEMENT_TYPES,
  formatTimeValue,
  getStaticOptions,
} from '../utils/formUtils'
import { DeptReadOnly } from './DeptElement'
import { renderUploadReadOnly } from './UploadElement'
import { UserReadOnly } from './UserElement'

/**
 * 详情只读展示管线（detail / move-detail 共用）：
 * - ReadonlyValue：统一「值 → 展示」入口——选项型按 data_source 映射 label、日期格式化、
 *   upload/deptselect/userselect 走专属只读渲染、空值显示 '-'。
 * - buildMockFormData：画布详情预览（move-detail）构造类型匹配的模拟数据，
 *   注入 Form store 后由 ReadonlyValue 渲染，与真实详情页展示逻辑完全一致。
 * 独立成文件，避免与渲染配置中心（elementConfig）产生循环依赖。
 */

/** 将数据值映射为 data_source 配置的展示 label（select/radio/checkbox 等选项型字段）；
 * 未配置 data_source 或值无匹配项时原样返回 */
const labelOfValue = (value, dataSource) => {
  if (dataSource == null || value == null) return value
  const opts = getStaticOptions({ data_source: dataSource })
  if (!opts.length) return value
  const hit = opts.find((o) => String(o.value) === String(value))
  return hit && hit.label != null ? hit.label : value
}

/**
 * 详情只读模式（pageType='detail' / 'move-detail'）下的纯文本展示组件：
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

/** 按元素类型生成与类型匹配的模拟展示值（不解析真实 data_source）；
 * 示例值来自 ELEMENT_TYPE_OPTIONS 的 mockDetailValue（类型注册表单一事实源），未注册的类型回退默认值 */
const getMockDetailValue = (el) =>
  ELEMENT_TYPE_OPTIONS.find((o) => o.value === el?.element_type)?.mockDetailValue ?? '示例值'

/** upload 模拟值：构造文件数组喂 renderUploadReadOnly（蓝色链接 + placeholder 提示），
 * 单选（multiple === false）1 条、多选派生 2 条（扩展名前插入序号） */
const resolveUploadMock = (el) => {
  const base =
    ELEMENT_TYPE_OPTIONS.find((o) => o.value === 'upload')?.mockDetailValue ?? '示例附件.pdf'
  const names =
    el?.multiple === false
      ? [base]
      : [base, /\.\w+$/.test(base) ? base.replace(/\.(\w+)$/, '2.$1') : `${base}2`]
  return names.map((name) => ({ name, url: '' }))
}

/** 单个元素（字段/列）的模拟值：upload 返回文件数组，其余返回类型注册的示例文本 */
const resolveMockValue = (el) =>
  el?.element_type === 'upload' ? resolveUploadMock(el) : getMockDetailValue(el)

/** 由表单布局元素构造完整模拟数据（主表字段 + 子表 2 行）：
 * - 主表元素：{ [field_key]: mockValue }
 * - 表格元素：{ [table_key]: [行1, 行2] }，行内为各列字段 mock 值 */
export const buildMockFormData = (elements) => {
  const data = {}
  ;(elements || []).forEach((el) => {
    if (el.element_type === 'table') {
      const rows = Array.from({ length: 2 }, () => {
        const row = {}
        ;(el.columns || []).forEach((col) => {
          const colKey = col.dataIndex || col.field_key
          if (colKey) row[colKey] = resolveMockValue(col)
        })
        return row
      })
      data[el.table_key || el.id || 'table'] = rows
      return
    }
    const key = el.field_key || el.name
    if (key) data[key] = resolveMockValue(el)
  })
  return data
}
