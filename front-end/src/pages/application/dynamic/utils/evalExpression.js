/**
 * 动态状态表达式求值（visible_if / disabled_if）。
 *
 * 安全约束：本模块用自建词法 / 语法分析求值，不执行宿主 JS，因此没有原型链、
 * 全局对象或任意代码执行的入口。
 * 旧实现是 `new Function` + 字符串黑名单，实测可被 '"con"+"structor"' 这类拼接绕过
 * （黑名单匹配的是原始文本，拼接后不含关键字），因此换成下面的解析实现。
 *
 * 支持的语法：
 * - 取值：${form.xxx}（点路径）、${true} / ${false} / ${数字} 字面量；
 *   没有 form. 前缀的 ${xxx}（如 ${item.xxx}）取不到值，与旧实现一致
 * - 字面量：数字、单 / 双 / 反引号字符串、true / false / null
 * - 运算符：=== !== == != > < >= <= && || ! + - * / % 、三元 ?: 、括号
 * - 语义与 JS 对齐：+ 遇字符串为拼接，== 走宽松相等，&& / || 返回操作数本身
 *
 * 求值失败、表达式为空、或取值命中对象 / 数组时一律返回 false
 * （命中对象时判 false 与旧实现的字符白名单行为一致：JSON 化后会含 {} 而被拒）。
 */

/** 按点号路径取值：getByPath({ a: { b: 1 } }, 'a.b') -> 1 */
const getByPath = (obj, path) => {
  if (obj == null) return undefined
  const p = String(path || '')
  if (p === '') return obj
  return p.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj)
}

/** 取值命中对象 / 数组的标记：整体判 false */
const INVALID = Symbol('invalid')

const NUMBER_RE = /^\d+(\.\d+)?/
const IDENT_RE = /^[A-Za-z_$][\w$]*/
// 长的放前面，保证 === 不被解析成 == 加 =
const OPERATORS = [
  '===',
  '!==',
  '==',
  '!=',
  '>=',
  '<=',
  '&&',
  '||',
  '>',
  '<',
  '!',
  '+',
  '-',
  '*',
  '/',
  '%',
  '?',
  ':',
  '(',
  ')',
]

/** 读一个字符串字面量（含转义），返回 { value, next } */
const readString = (src, start) => {
  const quote = src[start]
  let out = ''
  let i = start + 1
  while (i < src.length) {
    const ch = src[i]
    if (ch === '\\') {
      const next = src[i + 1]
      if (next === undefined) throw new Error('unterminated escape')
      out += next === 'n' ? '\n' : next === 't' ? '\t' : next
      i += 2
      continue
    }
    if (ch === quote) return { value: out, next: i + 1 }
    out += ch
    i += 1
  }
  throw new Error('unterminated string')
}

/**
 * 词法分析：把表达式切成 literal / value(${...}) / op 三类 token。
 * 任何无法识别的字符（含 [] {} , . 以及 self、constructor 这类标识符）直接抛错，
 * 由调用方统一按 false 处理——不支持的写法一律求值失败，不做兜底执行。
 */
const tokenize = (src) => {
  const tokens = []
  let i = 0
  while (i < src.length) {
    const ch = src[i]
    if (/\s/.test(ch)) {
      i += 1
      continue
    }
    if (ch === '$' && src[i + 1] === '{') {
      const end = src.indexOf('}', i + 2)
      if (end < 0) throw new Error('unterminated placeholder')
      tokens.push({ type: 'value', path: src.slice(i + 2, end) })
      i = end + 1
      continue
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      const { value, next } = readString(src, i)
      tokens.push({ type: 'literal', value })
      i = next
      continue
    }
    const num = NUMBER_RE.exec(src.slice(i))
    if (num) {
      tokens.push({ type: 'literal', value: Number(num[0]) })
      i += num[0].length
      continue
    }
    const ident = IDENT_RE.exec(src.slice(i))
    if (ident) {
      const word = ident[0]
      if (word === 'true') tokens.push({ type: 'literal', value: true })
      else if (word === 'false') tokens.push({ type: 'literal', value: false })
      else if (word === 'null') tokens.push({ type: 'literal', value: null })
      else throw new Error(`unsupported identifier: ${word}`)
      i += word.length
      continue
    }
    const op = OPERATORS.find((o) => src.startsWith(o, i))
    if (!op) throw new Error(`unexpected character: ${ch}`)
    tokens.push({ type: 'op', value: op })
    i += op.length
  }
  return tokens
}

/** JS 宽松相等（仅基本类型；对象已被 INVALID 拦下） */
const looseEqual = (a, b) => {
  if (a === b) return true
  if (a === null || a === undefined) return b === null || b === undefined
  if (b === null || b === undefined) return false
  const ta = typeof a
  const tb = typeof b
  if (ta === 'number' && tb === 'string') return a === Number(b)
  if (ta === 'string' && tb === 'number') return Number(a) === b
  if (ta === 'boolean') return looseEqual(Number(a), b)
  if (tb === 'boolean') return looseEqual(a, Number(b))
  return false
}

/** 二元运算：任一操作数为 INVALID 时整体 INVALID */
const applyBinary = (op, left, right) => {
  if (left === INVALID || right === INVALID) return INVALID
  switch (op) {
    case '===':
      return left === right
    case '!==':
      return left !== right
    case '==':
      return looseEqual(left, right)
    case '!=':
      return !looseEqual(left, right)
    case '>':
      return left > right
    case '<':
      return left < right
    case '>=':
      return left >= right
    case '<=':
      return left <= right
    case '+':
      return left + right
    case '-':
      return left - right
    case '*':
      return left * right
    case '/':
      return left / right
    case '%':
      return left % right
    default:
      throw new Error(`unsupported operator: ${op}`)
  }
}

/** 解析 ${...} 的取值语义（与旧实现一致） */
const resolvePlaceholder = (path, formValues) => {
  const parts = String(path ?? '').split('.')
  const scope = parts[0]
  if (scope === 'true') return true
  if (scope === 'false') return false
  if (/^-?\d+(\.\d+)?$/.test(scope)) return Number(scope)
  const root = scope === 'form' ? formValues : undefined
  const val = getByPath(root, parts.slice(1).join('.'))
  if (val !== null && typeof val === 'object') return INVALID
  // null / undefined 归一为空串，与旧实现 JSON.stringify(val ?? '') 的行为一致
  return val ?? ''
}

/** 递归下降解析 + 即时求值，按 JS 优先级组织 */
const createParser = (tokens, formValues) => {
  let pos = 0

  const peek = () => tokens[pos]
  const eatOp = (...ops) => {
    const t = tokens[pos]
    if (t && t.type === 'op' && ops.includes(t.value)) {
      pos += 1
      return t.value
    }
    return false
  }

  const parsePrimary = () => {
    const t = peek()
    if (!t) throw new Error('unexpected end of expression')
    if (t.type === 'literal') {
      pos += 1
      return t.value
    }
    if (t.type === 'value') {
      pos += 1
      return resolvePlaceholder(t.path, formValues)
    }
    if (t.type === 'op' && t.value === '(') {
      pos += 1
      const v = parseTernary()
      if (!eatOp(')')) throw new Error('missing )')
      return v
    }
    throw new Error('unexpected token')
  }

  const parseUnary = () => {
    if (eatOp('!')) {
      const v = parseUnary()
      return v === INVALID ? INVALID : !v
    }
    if (eatOp('-')) {
      const v = parseUnary()
      return v === INVALID ? INVALID : -Number(v)
    }
    if (eatOp('+')) {
      const v = parseUnary()
      return v === INVALID ? INVALID : Number(v)
    }
    return parsePrimary()
  }

  const parseMul = () => {
    let left = parseUnary()
    for (;;) {
      const op = eatOp('*', '/', '%')
      if (!op) return left
      left = applyBinary(op, left, parseUnary())
    }
  }

  const parseAdd = () => {
    let left = parseMul()
    for (;;) {
      const op = eatOp('+', '-')
      if (!op) return left
      left = applyBinary(op, left, parseMul())
    }
  }

  const parseRelational = () => {
    let left = parseAdd()
    for (;;) {
      const op = eatOp('>', '<', '>=', '<=')
      if (!op) return left
      left = applyBinary(op, left, parseAdd())
    }
  }

  const parseEquality = () => {
    let left = parseRelational()
    for (;;) {
      const op = eatOp('===', '!==', '==', '!=')
      if (!op) return left
      left = applyBinary(op, left, parseRelational())
    }
  }

  const parseAnd = () => {
    let left = parseEquality()
    for (;;) {
      if (!eatOp('&&')) return left
      const right = parseEquality()
      if (left === INVALID || right === INVALID) left = INVALID
      else left = left ? right : left
    }
  }

  const parseOr = () => {
    let left = parseAnd()
    for (;;) {
      if (!eatOp('||')) return left
      const right = parseAnd()
      if (left === INVALID || right === INVALID) left = INVALID
      else left = left ? left : right
    }
  }

  const parseTernary = () => {
    const cond = parseOr()
    if (!eatOp('?')) return cond
    const whenTrue = parseTernary()
    if (!eatOp(':')) throw new Error('missing :')
    const whenFalse = parseTernary()
    if (cond === INVALID) return INVALID
    return cond ? whenTrue : whenFalse
  }

  return {
    parse: () => {
      const value = parseTernary()
      if (pos !== tokens.length) throw new Error('unexpected trailing token')
      return value
    },
  }
}

/**
 * 求值动态状态表达式，返回布尔值。
 * 表达式为空、语法不支持、取值命中对象 / 数组、或任何异常时返回 false。
 */
export function evalDynamicExpr(expr, formValues) {
  if (expr == null || !String(expr).trim()) return false
  try {
    const tokens = tokenize(String(expr))
    if (!tokens.length) return false
    const value = createParser(tokens, formValues).parse()
    if (value === INVALID) return false
    return Boolean(value)
  } catch {
    return false
  }
}

export default evalDynamicExpr
