/**
 * 数学表达式求值 + 日期(时间)差值工具：CalculateExpression。
 *
 * 供 JS 事件脚本（action_type='js_event'）作为工具函数注入，与 TransNumberToUpper 并列：
 *   CalculateExpression('(1+2)*3')                                      -> 9
 *   CalculateExpression('1+2*3')                                        -> 7
 *   CalculateExpression('10/4')                                         -> 2.5
 *   CalculateExpression('-5+3')                                         -> -2
 *   CalculateExpression('2026-10-13-2026-10-12')                        -> 1       （日期差，天）
 *   CalculateExpression('2026-10-13 12:00:00 - 2026-10-12 06:00:00')    -> 1.25    （含时间，按真实时长折算）
 *
 * 安全：使用自建词法 / 语法分析（递归下降）求值，不执行宿主 JS——
 * 没有 eval / new Function / 原型链 / 全局对象入口，非法输入一律返回 NaN。
 * 支持：数字（整数/小数/.5）、+ - * /、括号、一元正负号、空白；
 * 除法保持 JS 语义（除零得 Infinity），非法表达式（未知字符、括号不匹配、缺操作数）返回 NaN。
 *
 * 日期差值：形如「日期(时间) - 日期(时间)」的表达式优先识别（两侧允许为空），
 * 按绝对时间差返回天数（保留 2 位小数、允许负数；含时间戳时按真实时长折算，如 30 小时 = 1.25）；
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
 * 尝试识别「日期(时间) - 日期(时间)」表达式，按绝对时间差返回天数（保留 2 位小数，允许负数）。
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
  let days = (left - right) / 86400000
  days = Math.round(days * 100) / 100
  if (days === 0) days = 0 // 消除 -0
  return days
}

/**
 * 计算数学表达式，返回数值。
 * 支持：number 直通（脚本里 Number(a)+Number(b) 或数字字段相加后的结果直接可用）；
 *       数字字符串（'100' -> 100）；
 *       数学表达式字符串（'+ - * / 与括号'，如 '(1+2)*3' -> 9）；
 *       日期(时间)差值字符串（'2026-10-13-2026-10-12' -> 1，含时间按真实时长折算为天）。
 * 空值、非法字符、括号不匹配、缺操作数、非法日期等一律返回 NaN。
 */
export function CalculateExpression(expr) {
  if (typeof expr === 'number') return Number.isFinite(expr) ? expr : NaN
  if (typeof expr !== 'string') return NaN
  const src = expr.trim()
  if (!src) return NaN
  // 日期(时间)差值优先识别，未命中再按数学表达式处理
  const days = tryDateDiff(src)
  if (days !== null) return days
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
