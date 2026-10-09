// SQL 模板美化：关键字大写；SELECT/FROM/WHERE 等子句关键字独占一行（顶格），
// 其后的列列表、表/JOIN、条件换行缩进 4；函数调用（JSON_OBJECT 等）括号内参数
// 逐行换行、逐级缩进。字符串字面量与 ${form.xxx} 占位符原样保留；幂等，可重复点击。

const KW = new Set([
  'SELECT', 'DISTINCT', 'FROM', 'WHERE', 'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER',
  'CROSS', 'FULL', 'ON', 'AND', 'OR', 'GROUP', 'BY', 'ORDER', 'HAVING', 'LIMIT',
  'OFFSET', 'UNION', 'ALL', 'AS', 'ASC', 'DESC', 'INSERT', 'INTO', 'UPDATE',
  'DELETE', 'SET', 'VALUES', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'IS', 'NULL',
  'IN', 'LIKE', 'BETWEEN', 'NOT', 'EXISTS',
])

// 复合子句前缀 → 后续必须跟随的词
const PREFIX_FOLLOW = {
  LEFT: 'JOIN', RIGHT: 'JOIN', INNER: 'JOIN', OUTER: 'JOIN', CROSS: 'JOIN', FULL: 'JOIN',
  GROUP: 'BY', ORDER: 'BY', UNION: 'ALL', INSERT: 'INTO', DELETE: 'FROM',
}

// 独占一行（顶格）的单字子句关键字
const CLAUSE_TOP = new Set([
  'SELECT', 'FROM', 'WHERE', 'HAVING', 'LIMIT', 'OFFSET', 'UNION', 'SET', 'VALUES', 'UPDATE',
])

// 独占一行（顶格）的复合子句
const COMPOUND_TOP = new Set(['INSERT INTO', 'DELETE FROM', 'GROUP BY', 'ORDER BY', 'UNION ALL'])

// FROM 块内缩进 4 的复合子句（JOIN 系）
const COMPOUND_INDENT = new Set(['LEFT JOIN', 'RIGHT JOIN', 'INNER JOIN', 'OUTER JOIN', 'CROSS JOIN', 'FULL JOIN'])

function tokenize(src) {
  const toks = []
  let i = 0
  const n = src.length
  while (i < n) {
    const c = src[i]
    // ${form.xxx} 占位符：整体保留（含内部空格），避免被拆散
    if (c === '$' && src[i + 1] === '{') {
      let j = i + 2
      while (j < n && src[j] !== '}') j++
      if (j < n) j++
      toks.push({ t: 'ph', v: src.slice(i, j) })
      i = j
    } else if (c === "'") {
      let j = i + 1
      let s = "'"
      while (j < n) {
        const ch = src[j]
        if (ch === '\\' && j + 1 < n) {
          s += ch + src[j + 1]
          j += 2
          continue
        }
        s += ch
        j++
        if (ch === "'") break
      }
      toks.push({ t: 'str', v: s })
      i = j
    } else if (/\s/.test(c)) {
      i++
    } else if (/[A-Za-z_]/.test(c)) {
      let j = i
      while (j < n && /[A-Za-z0-9_]/.test(src[j])) j++
      toks.push({ t: 'w', v: src.slice(i, j) })
      i = j
    } else if (/[0-9]/.test(c)) {
      let j = i
      while (j < n && /[0-9.]/.test(src[j])) j++
      toks.push({ t: 'n', v: src.slice(i, j) })
      i = j
    } else {
      toks.push({ t: 's', v: c })
      i++
    }
  }
  return toks
}

export function formatSql(text) {
  if (!text) return text
  const src = String(text).trim()
  if (!src) return text

  const norm = tokenize(src).map((t) => {
    if (t.t !== 'w') return t.v
    const u = t.v.toUpperCase()
    return KW.has(u) ? u : t.v
  })

  const lines = []
  let cur = '' // 当前行内容（不含缩进）
  let indent = '' // 当前行缩进
  let depth = 0 // 括号深度
  let lastIsDot = false
  let pending = false // 子句关键字后，下一 token 换行（缩进由 indent 决定）

  // 输出当前行并清空（indent 保留，供后续行沿用）
  const flush = () => {
    if (cur.trim()) lines.push(indent + cur.trim())
    cur = ''
    pending = false
  }
  const isPunct = (ch) => ch === ',' || ch === '(' || ch === ')' || ch === ';' || ch === '.'
  // 标点紧贴前一 token；普通 token 空格分隔（. 后不空格）
  const append = (t) => {
    if (isPunct(t)) {
      if (cur.endsWith(' ')) cur = cur.slice(0, -1)
      cur += t
      lastIsDot = t === '.'
      return
    }
    if (cur && cur.trim() && !lastIsDot) cur += ' '
    cur += t
    lastIsDot = false
  }
  // 普通 token：子句关键字刚结束时换行（indent 已由括号/子句逻辑设置，仅空 indent 时补默认 4）
  const addToken = (t) => {
    if (pending) {
      flush()
      if (!indent) indent = '    '
      cur = ''
      pending = false
    }
    append(t)
  }
  // 子句关键字：独占一行（顶格），后续内容换行
  const startClause = (kw) => {
    flush()
    indent = ''
    cur = kw
    pending = true
  }
  // 块内关键字（JOIN 系）：独占一行（缩进 4），后续内容同行
  const startIndented = (kw) => {
    flush()
    indent = '    '
    cur = kw
    pending = false
  }

  for (let k = 0; k < norm.length; k++) {
    const t = norm[k]

    // 复合子句：INSERT INTO / DELETE FROM / GROUP BY / ORDER BY / UNION ALL 顶格独占一行；
    // LEFT/RIGHT/INNER/OUTER/CROSS/FULL JOIN 在 FROM 块内缩进 4 独占一行
    if (PREFIX_FOLLOW[t] && norm[k + 1] === PREFIX_FOLLOW[t] && depth === 0) {
      const kw = t + ' ' + norm[k + 1]
      k++
      if (COMPOUND_TOP.has(kw)) {
        startClause(kw)
      } else if (COMPOUND_INDENT.has(kw)) {
        startIndented(kw)
      } else {
        // 新增复合词未分类时的兜底：按块内缩进行处理，避免错乱
        startIndented(kw)
      }
      continue
    }
    // 单字子句关键字（括号外）
    if (CLAUSE_TOP.has(t) && depth === 0) {
      startClause(t)
      continue
    }
    // 逗号（任意括号层级）：保留在行尾，换行缩进与上一行同级
    if (t === ',') {
      addToken(t)
      flush()
      continue
    }
    // 括号外 AND/OR：换行缩进 4
    if ((t === 'AND' || t === 'OR') && depth === 0) {
      flush()
      indent = '    '
      cur = t
      continue
    }
    // 函数调用括号：挂行尾后换行，参数行缩进加一级
    if (t === '(') {
      append(t)
      depth++
      flush()
      indent += '    '
      pending = true
      continue
    }
    // 闭合括号：缩进退回函数行层级，括号紧贴最后参数
    if (t === ')') {
      depth = Math.max(0, depth - 1)
      if (indent.length >= 4) indent = indent.slice(0, -4)
      if (cur.endsWith(' ')) cur = cur.slice(0, -1)
      cur += t
      continue
    }
    addToken(t)
  }
  flush()
  return lines.join('\n')
}
