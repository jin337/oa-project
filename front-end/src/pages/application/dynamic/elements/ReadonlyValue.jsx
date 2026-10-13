import { ELEMENT_TYPE_OPTIONS } from 'src/config/app.js'

import {
  TIME_ELEMENT_TYPES,
  formatTimeValue,
  getStaticOptions,
} from '../utils/formUtils'
import { DeptReadOnly } from './DeptElement'
import { ModelReadOnly } from './ModelElement'
import { ProjectReadOnly } from './ProjectElement'
import { UploadMockValue, UploadReadOnly } from './UploadElement'
import { UserReadOnly } from './UserElement'

/**
 * 详情只读展示管线（detail / move-detail 共用），独立成文件避免与渲染配置中心（elementConfig）循环依赖：
 *
 * 1. 只读展示（ReadonlyValue）：统一「值 → 展示」入口——
 *    - READONLY_RENDERERS 注册表按 element_type 分派专属只读组件
 *      （upload → UploadReadOnly、deptselect → DeptReadOnly、userselect → UserReadOnly）；
 *    - 未注册类型走通用回显：选项型按 data_source 映射 label、日期格式化、数组逐项连接、空值 '-'。
 * 2. 画布模拟数据（buildMockFormData）：move-detail 画布预览按 element_type 构造类型匹配的示例值——
 *    MOCK_GENERATORS 注册表有定义走专属生成（upload → 单条文件数组，与真实存储结构同构），
 *    否则取 ELEMENT_TYPE_OPTIONS.mockDetailValue 默认示例值；注入 Form store 后由 ReadonlyValue
 *    渲染，与真实详情页展示逻辑完全一致。
 */

// ==================== 只读展示 ====================

/** 将数据值映射为 data_source 配置的展示 label（select/radio/checkbox 等选项型字段）；
 * 未配置 data_source 或值无匹配项时原样返回 */
const labelOfValue = (value, dataSource) => {
  if (dataSource == null || value == null) return value
  const opts = getStaticOptions({ data_source: dataSource })
  if (!opts.length) return value
  const hit = opts.find((o) => String(o.value) === String(value))
  return hit && hit.label != null ? hit.label : value
}

/** 按元素类型注册的专属只读展示组件（与 MOCK_GENERATORS 对称的注册表）：
 * - 有定义的类型走专属组件（upload → UploadReadOnly、deptselect → DeptReadOnly、userselect → UserReadOnly）；
 * - 未定义的类型走下方通用文本回显（label 映射 / 日期格式化 / 数组连接 / 空值 '-'） */
const READONLY_RENDERERS = {
  upload: UploadReadOnly,
  deptselect: DeptReadOnly,
  userselect: UserReadOnly,
  projectselect: ProjectReadOnly,
  modelselect: ModelReadOnly,
}

/**
 * 详情只读模式（pageType='detail' / 'move-detail'）下的纯文本展示组件：
 * 作为 FormItem 单子元素接收 Arco 注入的 value，输出数据值对应的 data_source label
 * （数组值逐项映射后以 ", " 连接），空值显示 '-'。
 * elementType 为时间/日期类型时，value 经 formatTimeValue 格式化为标准可读的日期/时间字符串。
 */
export const ReadonlyValue = ({ value, elementType, dataSource, el }) => {
  // 专属只读组件分派（upload/deptselect/userselect 等注册类型）
  const Renderer = READONLY_RENDERERS[elementType]
  if (Renderer) {
    return <Renderer value={value} el={el} />
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

// ==================== 画布模拟数据构造 ====================

/** 按元素类型注册的专属模拟值生成器（与 READONLY_RENDERERS 对称的注册表）：
 * - 有定义的类型走专属生成（如 upload → 单条文件数组，与真实存储结构同构）；
 * - 未定义的类型回退 ELEMENT_TYPE_OPTIONS.mockDetailValue 默认示例值（deptselect/userselect
 *   默认值即展示文本，未注册专属生成器） */
const MOCK_GENERATORS = {
  upload: UploadMockValue,
}

/** 按元素类型生成与类型匹配的模拟展示值（不解析真实 data_source）：
 * 先查 MOCK_GENERATORS 专属生成器（定义才有），否则取 ELEMENT_TYPE_OPTIONS.mockDetailValue
 * 默认示例值（类型注册表单一事实源），仍未命中回退 '示例值' */
const getMockDetailValue = (el) =>
  MOCK_GENERATORS[el?.element_type]?.(el) ??
  ELEMENT_TYPE_OPTIONS.find((o) => o.value === el?.element_type)?.mockDetailValue ??
  '示例值'

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
          if (colKey) row[colKey] = getMockDetailValue(col)
        })
        return row
      })
      data[el.table_key || el.id || 'table'] = rows
      return
    }
    const key = el.field_key || el.name
    if (key) data[key] = getMockDetailValue(el)
  })
  return data
}
