/**
 * 动态表单引擎 · 纯函数与解析工具
 *
 * 从 DynamicForm.jsx 抽出：这些函数不依赖 React 状态、不依赖 Arco 组件实例，
 * 只负责布局解析、路径取值、表达式解析、校验规则与时间序列化，可独立测试与复用。
 * 需要被外部或 DynamicForm.jsx 使用的符号均由 DynamicForm.jsx 原样再导出，调用方无需改动。
 */

import { ELEMENT_TYPE_OPTIONS } from 'src/config/app.js'

import { evalDynamicExpr } from './evalExpression'

// ==================== 布局与数据源解析 ====================

// 全局表单配置默认值（垂直/水平布局、标签宽度、标签对齐）
export const DEFAULT_FORM_CONFIG = {
  layout: 'horizontal', // vertical | horizontal
  labelWidth: 100,
  labelAlign: 'right', // left | right
}

// 解析后端布局 JSON（form_layout_json / detail_layout_json 均为 { formConfig, elements } 结构）
// 后端可能返回字符串或已解析对象，这里兼容两种情况
export const parseLayoutJson = (raw) => {
  if (!raw) return null
  try {
    let data = raw
    if (typeof raw === 'string') {
      data = raw ? JSON.parse(raw) : null
    }
    if (!data || typeof data !== 'object') return null
    return {
      formConfig: { ...DEFAULT_FORM_CONFIG, ...(data.formConfig || {}) },
      elements: Array.isArray(data.elements) ? data.elements : [],
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

// ==================== 取值与表达式 ====================

// 选项型元素（支持动态数据源，如 select/deptselect/userselect/projectselect 等）：
// 由元素类型配置 ELEMENT_TYPE_OPTIONS 的 needDataSource 标记自动派生，
// 新增元素类型只需在 src/config/app.js 声明 needDataSource: true，无需在此处手工登记。
export const OPTION_ELEMENT_TYPES = new Set(
  ELEMENT_TYPE_OPTIONS.filter((o) => o.needDataSource).map((o) => o.value),
)

/** 递归查找选项：树形选项（children 子节点）的选中项匹配需下钻子级 */
export const findOptionByValue = (opts, val) => {
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
export const getByPath = (obj, path) => {
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
export const resolveExpr = (expr, vars) => {
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
export const resolvePath = (expr, roots) => {
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
export const extractFormDeps = (str) => {
  const deps = new Set()
  String(str ?? '').replace(/\$\{form\.([^}]+)\}/g, (_, p) => {
    deps.add(p.split('.')[0])
    return ''
  })
  return deps
}

// ==================== 动态状态与校验 ====================

/**
 * 动态状态表达式求值（visible_if / disabled_if）的实现见 ./evalExpression：
 * 已用自建词法 / 语法分析替代原先的 new Function + 字符串黑名单
 * （后者匹配原始文本，可被 '"con"+"structor"' 这类拼接绕过）。
 */

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
          visible: el.dynamic_states.visible_if
            ? !!evalDynamicExpr(el.dynamic_states.visible_if, values)
            : true,
          disabled: el.dynamic_states.disabled_if
            ? !!evalDynamicExpr(el.dynamic_states.disabled_if, values)
            : false,
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
export const buildValidationRules = (el, getFormValues, isDetail, skipRequired) => {
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
          rules.push({
            match: new RegExp(m[1], m[2]),
            message: el.validation_message || `${label}格式不正确`,
          })
        } catch {
          /* 非法正则忽略 */
        }
      }
    } else if (str.includes('${')) {
      rules.push({
        validator: (value, callback) => {
          try {
            const ok = evalDynamicExpr(str, getFormValues?.() || {})
            if (ok) callback()
            else callback(el.validation_message || `${label}校验不通过`)
          } catch {
            callback()
          }
        },
      })
    }
  }
  return rules.length ? rules : undefined
}

/**
 * 解析元素默认值 default_value：
 * - 时间表达式（'${new Date()}' / '${now()}' / '${today()}'）：求值为当前时间；
 *   时间类元素按元素粒度格式化，其余元素格式化为 'YYYY-MM-DD HH:mm:ss'
 * - 当前用户表达式（'${user.id}' / '${user.username}' / '${user.profile.nickname}' /
 *   '${user.dept_id}' / '${user.dept_name}'）：按点路径取当前登录用户字段；
 *   用户资料未就绪时返回 undefined（不填充，就绪后由调用方重新解析补填）
 * - 时间类元素（date/datepicker/datetime/time/timepicker）：统一规范化为标准格式串，
 *   无法解析的值返回 undefined（不填充），避免组件渲染出 Invalid Date
 * - 输入类：字符串原样作为输入框内容
 * - 下拉/单选（select/radio/treeselect 单选）：值字符串（匹配选项 value）
 * - 多选（checkbox/multi_select/treeselect 多选）：JSON 数组（'["a","b"]'）或逗号分隔（"a,b"）
 * - 无法解析时原样返回
 * @param {*} raw         default_value 原始配置
 * @param {string} elementType 元素类型
 * @param {Object} [context] 求值上下文，当前仅支持 { user }（当前登录用户对象）
 */
export const parseDefaultValue = (raw, elementType, context) => {
  if (raw == null || raw === '') return undefined
  const text = String(raw)
  const isTimeType = TIME_ELEMENT_TYPES.includes(elementType)
  // 时间表达式：求值为当前时间（时间类元素按元素粒度格式化）
  if (TIME_DEFAULT_EXPR_RE.test(text.trim())) {
    const now = new Date()
    return isTimeType ? normalizeTimeDefault(now, elementType) : formatTimeValue(now, 'datetime')
  }
  // 当前用户表达式：按点路径取当前登录用户字段
  const userMatch = USER_DEFAULT_EXPR_RE.exec(text.trim())
  if (userMatch) {
    const v = resolveUserDefault(userMatch[1], context?.user)
    return v == null || v === '' ? undefined : v
  }
  try {
    const v = JSON.parse(text)
    // 数组/对象按结构化值返回（多选默认选中项、树选择等）
    if (Array.isArray(v)) return v
    if (v !== null && typeof v === 'object') return v
    // 标量（字符串/数字/布尔）：时间类仍需规范化为标准格式
    return isTimeType ? normalizeTimeDefault(v, elementType) : text
  } catch (e) {
    // 多选型支持逗号分隔字符串
    if (
      ['checkbox', 'multi_select', 'treeselect'].includes(elementType) &&
      text.includes(',')
    ) {
      return text
        .split(',')
        .map((x) => x.trim())
    }
    return isTimeType ? normalizeTimeDefault(text, elementType) : text
  }
}

// ==================== 时间处理 ====================

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
 * 默认值中支持的时间表达式：'${new Date()}' / '${now()}' / '${today()}'（容忍空格与大小写差异）。
 * 仅识别这三种"当前时间"语义的写法，其余 ${...} 一律按普通字面量处理，不做通用 JS 求值。
 */
const TIME_DEFAULT_EXPR_RE =
  /^\$\{\s*(?:new\s+Date\s*\(\s*\)|now\s*\(\s*\)|today\s*\(\s*\))\s*\}$/i

/**
 * 时间类默认值规范化：按元素粒度转成标准格式串（YYYY-MM-DD / YYYY-MM-DD HH:mm:ss / HH:mm:ss）。
 * 入参兼容 Date 对象、ISO/带格式字符串、13 位毫秒与 10 位秒时间戳；
 * 无法解析时返回 undefined（不填充该字段），避免非法值被日期组件渲染成 Invalid Date、
 * 或被 serializeTimeFields 原样透传写进数据库。
 */
const normalizeTimeDefault = (value, elementType) => {
  if (value == null || value === '') return undefined
  const formatted = formatTimeValue(value, elementType, undefined)
  if (formatted == null || formatted === '') return undefined
  const probe = String(formatted)
  if (elementType === 'time' || elementType === 'timepicker') {
    return /^\d{2}:\d{2}:\d{2}$/.test(probe) ? probe : undefined
  }
  const dt = new Date(probe.replace(' ', 'T'))
  return Number.isNaN(dt.getTime()) ? undefined : probe
}

/**
 * 默认值中支持的当前用户表达式：'${user.id}' / '${user.username}' / '${user.profile.nickname}'
 * / '${user.dept_id}' / '${user.dept_name}'（dept_name 由 dept_ids 按当前 dept_id 派生）。
 * 仅按点路径从当前登录用户对象（/auth/profile 返回的 user）取值，不做任意 JS 求值。
 */
const USER_DEFAULT_EXPR_RE = /^\$\{\s*user\.([\w.]+)\s*\}$/i

/** 按点路径读取当前用户字段；用户对象缺失或路径不存在时返回 undefined */
const resolveUserDefault = (path, user) => {
  if (!user) return undefined
  // 部门名称：dept_ids 中与当前 dept_id 匹配的那一项
  if (path === 'dept_name') {
    const hit = (user.dept_ids || []).find((d) => d.id === user.dept_id)
    return hit?.name
  }
  return path.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), user)
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

// ==================== 表单提交前后事件钩子 ====================

/**
 * 安全执行用户在「表单设置布局」里填写的提交事件 JS。
 * 配置形如：  (form) => { ... return false; }
 * 支持字符串直接作为函数体（缺省包装为 async function）。
 * - onSubmitBefore：返回 false（或 throw）阻止提交；返回其他值/void 继续。
 * - onSubmitAfter：提交成功后调用；异常仅打日志，不影响主流程。
 */
const compileHook = (source) => {
  if (!source || typeof source !== 'string') return null
  const src = source.trim()
  if (!src) return null
  try {
    // 用户既可能写完整箭头函数，也可能只写函数体；统一包成 async function
    if (/^\(/.test(src) || /^function/.test(src) || /^async/.test(src)) {
      // eslint-disable-next-line no-new-func
      return new Function(`return (${src})`)()
    }
    // eslint-disable-next-line no-new-func
    return new Function(`form`, `result`, `"use strict";\n${src}`)
  } catch (e) {
    console.warn('[form-hook] 编译失败:', e)
    return null
  }
}

/**
 * 执行提交前钩子：返回 false 表示阻止提交。
 * @param {object} formConfig layout.formConfig
 * @param {object} formValues 表单当前值
 * @returns {Promise<boolean>} true=继续提交，false=阻止
 */
export const runOnSubmitBefore = async (formConfig, formValues) => {
  const fn = compileHook(formConfig?.onSubmitBefore)
  if (!fn) return true
  try {
    const ret = await fn(formValues)
    return ret !== false
  } catch (e) {
    console.error('[onSubmitBefore] 执行异常:', e)
    return false
  }
}

/**
 * 执行提交后钩子：提交成功后调用，异常仅打日志。
 * @param {object} formConfig
 * @param {object} formValues
 * @param {*} result 接口返回数据
 */
export const runOnSubmitAfter = async (formConfig, formValues, result) => {
  const fn = compileHook(formConfig?.onSubmitAfter)
  if (!fn) return
  try {
    await fn(formValues, result)
  } catch (e) {
    console.error('[onSubmitAfter] 执行异常:', e)
  }
}
