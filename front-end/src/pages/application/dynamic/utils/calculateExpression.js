/**
 * 数学表达式求值 + 日期(时间)差值工具：CalculateExpression。
 *
 * 供 JS 事件脚本（action_type='js_event'）作为工具函数注入，与 TransNumberToUpper 并列：
 *   CalculateExpression('(1+2)*3')                                      -> 9
 *   CalculateExpression('1+2*3')                                        -> 7
 *   CalculateExpression('10/4')                                         -> 2.5
 *   CalculateExpression('-5+3')                                         -> -2
 *   CalculateExpression('2026-10-13-2026-10-12')                        -> 2       （纯日期，首尾都算一天）
 *   CalculateExpression('2026-10-12-2026-10-12')                        -> 1       （同一天算 1 天）
 *   CalculateExpression('2026-10-13 12:00:00 - 2026-10-12 06:00:00')    -> 1.25    （含时间，按真实时长折算）
 *
 * 安全：使用自建词法 / 语法分析（递归下降）求值，不执行宿主 JS——
 * 没有 eval / new Function / 原型链 / 全局对象入口，非法输入一律返回 NaN。
 * 支持：数字（整数/小数/.5）、+ - * /、括号、一元正负号、空白；
 * 除法保持 JS 语义（除零得 Infinity），非法表达式（未知字符、括号不匹配、缺操作数）返回 NaN。
 *
 * 日期差值：形如「日期(时间) - 日期(时间)」的表达式优先识别（两侧允许为空），
 * 纯日期按首尾都计入（10-13 - 10-12 → 2，同一天 → 1），含时间按真实时长折算（30 小时 = 1.25）；
 * 任一侧为空（如 2026-10-13- / -2026-10-13）视为空值参与相减，返回 0；
 * 命中但日期非法（如 2026-13-45、2026-02-30）返回 NaN，避免静默算出错误数值；
 * 未命中日期形式时按普通数学表达式处理。两侧统一按 UTC 解析，与后端历史 /utils/calculate 语义一致。
 */

const NUM_RE = /^(\d+(\.\d+)?|\.\d+)/

/** 词法分析：数字与操作符 token；无法识别的字符抛错（由调用方归一为 NaN） */
const tokenize = (src) => {
  const tokens = []
  let i = 0
  while (i < src.length) {
    const ch = src[i]
    if (/\s/.test(ch)) {
      i += 1
      continue
    }
    const num = NUM_RE.exec(src.slice(i))
    if (num) {
      tokens.push({ type: 'num', value: Number(num[0]) })
      i += num[0].length
      continue
    }
    if ('+-*/()'.includes(ch)) {
      tokens.push({ type: 'op', value: ch })
      i += 1
      continue
    }
    throw new Error(`unexpected character: ${ch}`)
  }
  return tokens
}

/** 递归下降解析器：expr -> term (('+'|'-') term)* ；term -> factor (('*'|'/') factor)* ；factor -> ('+'|'-') factor | '(' expr ')' | number */
const createParser = (tokens) => {
  let pos = 0

  const peek = () => tokens[pos]
  const eat = (op) => {
    const t = tokens[pos]
    if (t && t.type === 'op' && t.value === op) {
      pos += 1
      return true
    }
    return false
  }

  const parseFactor = () => {
    if (eat('+')) return parseFactor()
    if (eat('-')) return -parseFactor()
    if (eat('(')) {
      const v = parseExpr()
      if (!eat(')')) throw new Error('missing )')
      return v
    }
    const t = peek()
    if (!t || t.type !== 'num') throw new Error('expected number')
    pos += 1
    return t.value
  }

  const parseTerm = () => {
    let left = parseFactor()
    for (;;) {
      if (eat('*')) left *= parseFactor()
      else if (eat('/')) left /= parseFactor()
      else return left
    }
  }

  const parseExpr = () => {
    let left = parseTerm()
    for (;;) {
      if (eat('+')) left += parseTerm()
      else if (eat('-')) left -= parseTerm()
      else return left
    }
  }

  return { parseExpr, get pos() { return pos } }
}

// 匹配「日期(时间) - 日期(时间)」形式的表达式，例如：
//   - 2026-10-13-2026-10-12
//   - 2026-10-13 - 2026-10-12
//   - 2026-10-13 12:00:00 - 2026-10-12 06:00:00
//   - 2026-10-13 12:00 - 2026-10-12 06:00
// 两侧均允许为空，用于兼容表单里取到空值的情况（如 2026-10-13- / -2026-10-13）。
const DATE_DIFF_RE = /^\s*(\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2})?)?)?\s*-\s*(\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2})?)?)?\s*$/

/** 解析日期 / 日期时间（支持 YYYY-MM-DD、YYYY-MM-DD HH:mm、YYYY-MM-DD HH:mm:ss，也接受 T 分隔）；
 *  统一按 UTC 解析并校验真实日期，非法返回 null。 */
const parseDate = (s) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(s)
  if (!m) return null
  const [, Y, Mo, D, H, Mi, Se] = m
  const y = +Y
  const mo = +Mo
  const d = +D
  const h = H === undefined ? 0 : +H
  const mi = Mi === undefined ? 0 : +Mi
  const se = Se === undefined ? 0 : +Se
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || se > 59) return null
  const t = new Date(Date.UTC(y, mo - 1, d, h, mi, se))
  // 校验 day 是否越界（Date.UTC 会归一化 2026-02-30 -> 03-02，需回读确认）
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== mo - 1 || t.getUTCDate() !== d) return null
  return t.getTime()
}

/**
 * 日期差天数：
 * - 纯日期（两侧都没有时分秒）：首尾都算一天，如 10-13 与 10-12 → 2 天，同一天 → 1 天；
 * - 含时间：按真实时长折算，保留 2 位小数（如 30 小时 → 1.25）。
 */
const dateDiffDays = (leftMs, rightMs, withTime) => {
  const raw = (leftMs - rightMs) / 86400000
  if (withTime) {
    const days = Math.round(raw * 100) / 100
    return days === 0 ? 0 : days
  }
  // 纯日期按 UTC 解析，差值必为整数天
  return Math.abs(Math.round(raw)) + 1
}

/** 字符串是否带时分秒 */
const hasTimePart = (text) => /[ T]\d{2}:\d{2}/.test(String(text || ''))

/**
 * 尝试识别「日期(时间) - 日期(时间)」表达式，按日期差返回天数。
 * 纯日期按首尾都计入（10-13 - 10-12 → 2 天，同一天 → 1 天）；
 * 含时间按真实时长折算（30 小时 → 1.25 天）。
 * 未命中返回 null（交由数学表达式处理）；命中但日期非法返回 NaN；
 * 任一侧为空视为空值参与相减，返回 0。
 */
const tryDateDiff = (src) => {
  const m = DATE_DIFF_RE.exec(src)
  if (!m) return null
  const leftRaw = (m[1] || '').trim()
  const rightRaw = (m[2] || '').trim()
  const left = leftRaw ? parseDate(leftRaw) : null
  if (leftRaw && left === null) return NaN
  const right = rightRaw ? parseDate(rightRaw) : null
  if (rightRaw && right === null) return NaN
  // 任一侧为空：空值参与相减，返回 0
  if (!leftRaw || !rightRaw) return 0
  return dateDiffDays(left, right, hasTimePart(leftRaw) || hasTimePart(rightRaw))
}

const DAY_MS = 86400000

// 日期字段相减的运行期上下文：
// JS 的减法只能得到原始数字差值，函数无法再从数字反推出两个日期。
// 这里在日期值转数字时记下相邻的两个日期操作数，CalculateExpression 收到
// 与之匹配的差值数字时，即可按「日期」而不是普通数字处理（首尾都算一天）。
const MAX_DATE_PAIRS = 16
let dateOperandPairs = []
let lastDateOperand = null

/** 每次执行 JS 事件脚本前清空日期相减上下文，避免跨脚本串扰 */
export function resetDateDiffContext() {
  dateOperandPairs = []
  lastDateOperand = null
}

/** 记录一次日期值参与数值运算；连续两个日期值即构成一对相减操作数 */
const registerDateOperand = (value) => {
  const prev = lastDateOperand
  lastDateOperand = value
  if (!prev || prev === value || prev.ms === null || value.ms === null) return
  dateOperandPairs.push({ raw: (prev.ms - value.ms) / DAY_MS, left: prev, right: value })
  if (dateOperandPairs.length > MAX_DATE_PAIRS) dateOperandPairs.shift()
}

/** 找出与给定数字匹配的日期相减上下文（同一脚本执行内、允许浮点误差） */
const takeDatePair = (num) => {
  for (let i = dateOperandPairs.length - 1; i >= 0; i -= 1) {
    const pair = dateOperandPairs[i]
    if (Math.abs(pair.raw - num) < 1e-9) {
      dateOperandPairs.splice(i, 1)
      return pair
    }
  }
  return null
}

/**
 * 表单日期值包装器：脚本里既能当日期字符串使用，也能直接参与减法。
 *
 * 关键点：JS 对两个日期字符串做减法会先转数字，'2026-11-27' - '2026-11-19' 得到 NaN，
 * 进入 CalculateExpression 时原始日期已经丢失。这里把日期字段包装成对象，
 * toString / toJSON 返回原始日期字符串，valueOf 返回「距 1970-01-01 的天数」，
 * 并记录相减的两个日期，使 CalculateExpression(form.enddt-form.begindt)
 * 能识别出这是日期差并按首尾计数，而不是把结果当成普通数字。
 */
export class FormDateValue {
  constructor(text, ms) {
    this.text = text || ''
    this.ms = Number.isFinite(ms) ? ms : null
  }

  toString() {
    return this.text
  }

  toJSON() {
    return this.text
  }

  valueOf() {
    if (this.ms === null) return NaN
    registerDateOperand(this)
    return this.ms / DAY_MS
  }

  // 减法等数值运算取天数；加法/字符串拼接仍取日期文本，避免把日期拼成 20700。
  [Symbol.toPrimitive](hint) {
    return hint === 'number' ? this.valueOf() : this.text
  }
}

/** 判断一个值是否可视为日期：FormDateValue / Date / dayjs、moment 等带 format 的对象 */
const isDateValue = (value) =>
  value instanceof FormDateValue ||
  value instanceof Date ||
  (value != null && typeof value === 'object' && typeof value.format === 'function')

/** 从日期值取毫秒时间戳；无效返回 NaN */
const dateValueMs = (value) => {
  if (value instanceof FormDateValue) return value.ms === null ? NaN : value.ms
  if (value instanceof Date) return value.getTime()
  if (value != null && typeof value.format === 'function') {
    const ms = typeof value.valueOf === 'function' ? Number(value.valueOf()) : NaN
    return Number.isFinite(ms) ? ms : NaN
  }
  return NaN
}

/** 字符串是否严格是日期 / 日期时间（YYYY-MM-DD 或 YYYY-MM-DD HH:mm[:ss]） */
const asDateString = (value) => {
  if (typeof value !== 'string') return null
  const src = value.trim()
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(src)
  if (!m) return null
  return src
}

/** 按日期字符串构造 FormDateValue；非法日期返回 ms=null 的包装（减法得 NaN） */
export function toFormDateValue(value) {
  if (value instanceof FormDateValue) return value
  const src = asDateString(value)
  if (!src) return new FormDateValue(typeof value === 'string' ? value : '', null)
  const ms = parseDate(src)
  return new FormDateValue(src, ms === null ? NaN : ms)
}

const DATE_ELEMENT_TYPES = new Set(['date', 'datepicker', 'datetime'])

/**
 * 把表单快照中的日期字段包装成 FormDateValue，供 JS 事件脚本按日期语义参与减法。
 * 主表字段、子表行内日期列都会处理；未配置的行保持原值。
 * @param {object} values 表单值快照（原地修改）
 * @param {object[]} elements 表单元素配置
 */
export function wrapDateFields(values, elements) {
  if (!values || !Array.isArray(elements)) return values
  for (const el of elements) {
    if (!el) continue
    if (DATE_ELEMENT_TYPES.has(el.element_type)) {
      const key = el.field_key
      if (key && Object.prototype.hasOwnProperty.call(values, key)) {
        values[key] = toFormDateValue(values[key])
      }
      continue
    }
    if (el.element_type === 'table') {
      const tableKey = el.table_key || el.field_key || el.id
      const rows = tableKey ? values[tableKey] : null
      if (!Array.isArray(rows)) continue
      const dateCols = (el.columns || [])
        .filter((col) => DATE_ELEMENT_TYPES.has(col.element_type))
        .map((col) => col.dataIndex || col.field_key)
        .filter(Boolean)
      if (!dateCols.length) continue
      rows.forEach((row) => {
        if (!row || typeof row !== 'object') return
        dateCols.forEach((col) => {
          if (Object.prototype.hasOwnProperty.call(row, col)) {
            row[col] = toFormDateValue(row[col])
          }
        })
      })
    }
  }
  return values
}

/** 日期值是否带非零时间（决定按首尾计数还是按真实时长折算） */
const dateValueHasTime = (value) => {
  if (value instanceof FormDateValue) {
    return hasTimePart(value.text) && !/\s00:00(?::00)?$/.test(value.text)
  }
  if (value instanceof Date) {
    return (
      value.getHours() !== 0 || value.getMinutes() !== 0 || value.getSeconds() !== 0
    )
  }
  if (value != null && typeof value.format === 'function') {
    const text = value.format('YYYY-MM-DD HH:mm:ss')
    return hasTimePart(text) && !/\s00:00:00$/.test(text)
  }
  return false
}

/** 解析双参数中的一个操作数：日期对象 / 日期字符串 → { isDate, ms, hasTime }，其余 → { isDate: false } */
const asDateOperand = (value) => {
  if (isDateValue(value)) {
    return { isDate: true, ms: dateValueMs(value), hasTime: dateValueHasTime(value) }
  }
  if (typeof value === 'string') {
    const src = asDateString(value)
    if (src) {
      const ms = parseDate(src)
      return {
        isDate: true,
        ms: ms === null ? NaN : ms,
        hasTime: hasTimePart(src) && !/\s00:00(?::00)?$/.test(src),
      }
    }
  }
  return { isDate: false, ms: NaN, hasTime: false }
}

/** 严格数值转换：空值 / 空白 / 无法完全转成数字的字符串一律 NaN */
const toNumber = (value) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN
  if (typeof value === 'string') {
    const src = value.trim()
    if (!src) return NaN
    const n = Number(src)
    return Number.isFinite(n) ? n : NaN
  }
  return NaN
}

/**
 * 计算数学表达式或日期差，返回数值。判断顺序：
 * 1) 日期：两个参数都能识别为日期 → 按天差返回；单参数是日期 → NaN（没有可相减的另一个日期）。
 *    纯日期首尾都算一天（10-13 与 10-12 → 2 天，同一天 → 1 天）；含时间按真实时长折算。
 * 2) 数字：数值直接返回；字符串是纯数字 → 转数字返回。
 * 3) 可转数字：字符串去空白后 Number 可转 → 按数字。
 * 4) 数学表达式：'+ - * /' 与括号，如 '(1+2)*3'。
 * 5) 日期差表达式字符串：'2026-10-13-2026-10-12' → 2 天。
 *
 * 另支持双参数 CalculateExpression(a, b)：日期按天差，数字按算术差。
 * 空值、非法字符、括号不匹配、缺操作数、非法日期等一律返回 NaN。
 */
export function CalculateExpression(expr, right) {
  if (arguments.length >= 2) {
    const left = asDateOperand(expr)
    const rightDate = asDateOperand(right)
    if (left.isDate || rightDate.isDate) {
      if (!left.isDate || !rightDate.isDate) return NaN
      if (Number.isNaN(left.ms) || Number.isNaN(rightDate.ms)) return NaN
      return dateDiffDays(left.ms, rightDate.ms, left.hasTime || rightDate.hasTime)
    }
    const a = toNumber(expr)
    const b = toNumber(right)
    if (Number.isFinite(a) && Number.isFinite(b)) return a - b
    return NaN
  }

  // 单参数：日期对象本身不构成差值，返回 NaN；字符串先按日期差表达式识别。
  if (isDateValue(expr)) return NaN
  if (typeof expr === 'number') {
    if (!Number.isFinite(expr)) return NaN
    // 若这个数字来自两个日期字段相减（FormDateValue.valueOf 已记录操作数），按日期差处理
    const pair = takeDatePair(expr)
    if (pair) {
      return dateDiffDays(
        pair.left.ms,
        pair.right.ms,
        dateValueHasTime(pair.left) || dateValueHasTime(pair.right),
      )
    }
    return expr
  }
  if (typeof expr !== 'string') return NaN
  const src = expr.trim()
  if (!src) return NaN

  // 1) 纯日期字符串：没有第二个日期，不能当作数学表达式（否则 2026-10-13 会被算成 2003）
  if (asDateString(src)) return NaN
  // 2) 日期差表达式优先于数学表达式
  const days = tryDateDiff(src)
  if (days !== null) return days
  // 3) 纯数字 / 可完整转数字的字符串
  const n = toNumber(src)
  if (Number.isFinite(n)) return n
  // 4) 数学表达式
  try {
    const tokens = tokenize(src)
    if (!tokens.length) return NaN
    const parser = createParser(tokens)
    const value = parser.parseExpr()
    if (parser.pos !== tokens.length) return NaN
    return value
  } catch {
    return NaN
  }
}

export default CalculateExpression
