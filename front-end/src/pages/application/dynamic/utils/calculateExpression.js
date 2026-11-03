/**
 * 数学表达式求值工具：CalculateExpression。
 *
 * 供 JS 事件脚本（action_type='js_event'）作为工具函数注入，与 TransNumberToUpper 并列：
 *   CalculateExpression('(1+2)*3')   -> 9
 *   CalculateExpression('1+2*3')     -> 7
 *   CalculateExpression('10/4')      -> 2.5
 *   CalculateExpression('-5+3')      -> -2
 *
 * 安全：使用自建词法 / 语法分析（递归下降）求值，不执行宿主 JS——
 * 没有 eval / new Function / 原型链 / 全局对象入口，非法输入一律返回 NaN。
 * 支持：数字（整数/小数/.5）、+ - * /、括号、一元正负号、空白；
 * 除法保持 JS 语义（除零得 Infinity），非法表达式（未知字符、括号不匹配、缺操作数）返回 NaN。
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

/**
 * 计算数学表达式，返回数值。
 * 支持：number 直通（脚本里 Number(a)+Number(b) 或数字字段相加后的结果直接可用）；
 *       数字字符串（'100' -> 100）；
 *       数学表达式字符串（'+ - * / 与括号'，如 '(1+2)*3' -> 9）。
 * 空值、非法字符、括号不匹配、缺操作数等一律返回 NaN。
 */
export function CalculateExpression(expr) {
  if (typeof expr === 'number') return Number.isFinite(expr) ? expr : NaN
  if (typeof expr !== 'string') return NaN
  const src = expr.trim()
  if (!src) return NaN
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
