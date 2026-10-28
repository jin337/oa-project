import { Button, Modal, Space } from '@arco-design/web-react'
import { IconCode, IconFullscreen, IconFullscreenExit, IconMinus, IconPlus } from '@arco-design/web-react/icon'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'

// ──────────────────────────────── 字号（模块级，localStorage 持久化） ────────────────────────────────
// 多个 SqlEditor 实例共享同一份字号：改一处，其它实例下次挂载 / 运行时事件同步。
const FONT_SIZE_KEY = 'sql-editor:font-size'
const FONT_SIZE_DEFAULT = 14
const FONT_SIZE_MIN = 11
const FONT_SIZE_MAX = 22
const FONT_SIZE_EVENT = 'sql-editor:font-size-change'

function readFontSize() {
  try {
    const v = parseInt(localStorage.getItem(FONT_SIZE_KEY), 10)
    if (Number.isFinite(v) && v >= FONT_SIZE_MIN && v <= FONT_SIZE_MAX) return v
  } catch {
    // 隐私模式等场景读取失败时回退默认值
  }
  return FONT_SIZE_DEFAULT
}

function changeFontSize(delta) {
  const next = Math.max(FONT_SIZE_MIN, Math.min(FONT_SIZE_MAX, readFontSize() + delta))
  try {
    localStorage.setItem(FONT_SIZE_KEY, String(next))
  } catch {
    // 写失败不影响本会话使用
  }
  window.dispatchEvent(new CustomEvent(FONT_SIZE_EVENT))
}

// ──────────────────────────────── SQL 工具 ────────────────────────────────
// SQL 模板美化：关键字大写；SELECT/FROM/WHERE 等子句关键字独占一行（顶格），
// 其后的列列表、表/JOIN、条件换行缩进 4；函数调用（JSON_OBJECT 等）括号内参数
// 逐行换行、逐级缩进。字符串字面量与 ${form.xxx} 占位符原样保留；幂等，可重复点击。

const KW = new Set([
  'SELECT',
  'DISTINCT',
  'FROM',
  'WHERE',
  'JOIN',
  'LEFT',
  'RIGHT',
  'INNER',
  'OUTER',
  'CROSS',
  'FULL',
  'ON',
  'AND',
  'OR',
  'GROUP',
  'BY',
  'ORDER',
  'HAVING',
  'LIMIT',
  'OFFSET',
  'UNION',
  'ALL',
  'AS',
  'ASC',
  'DESC',
  'INSERT',
  'INTO',
  'UPDATE',
  'DELETE',
  'SET',
  'VALUES',
  'CASE',
  'WHEN',
  'THEN',
  'ELSE',
  'END',
  'IS',
  'NULL',
  'IN',
  'LIKE',
  'BETWEEN',
  'NOT',
  'EXISTS',
])

// 复合子句前缀 → 后续必须跟随的词
const PREFIX_FOLLOW = {
  LEFT: 'JOIN',
  RIGHT: 'JOIN',
  INNER: 'JOIN',
  OUTER: 'JOIN',
  CROSS: 'JOIN',
  FULL: 'JOIN',
  GROUP: 'BY',
  ORDER: 'BY',
  UNION: 'ALL',
  INSERT: 'INTO',
  DELETE: 'FROM',
}

// 独占一行（顶格）的单字子句关键字
const CLAUSE_TOP = new Set([
  'SELECT',
  'FROM',
  'WHERE',
  'HAVING',
  'LIMIT',
  'OFFSET',
  'UNION',
  'SET',
  'VALUES',
  'UPDATE',
])

// CASE 块内缩进单字关键字：CASE/END 缩进 4、WHEN/ELSE 缩进 8（各独占一行，后续内容同行）
const CLAUSE_INDENT = new Set(['CASE', 'END'])
const CLAUSE_INDENT_DEEP = new Set(['WHEN', 'ELSE'])

// 独占一行（顶格）的复合子句
const COMPOUND_TOP = new Set(['INSERT INTO', 'DELETE FROM', 'GROUP BY', 'ORDER BY', 'UNION ALL'])

// FROM 块内缩进 4 的复合子句（JOIN 系）
const COMPOUND_INDENT = new Set([
  'LEFT JOIN',
  'RIGHT JOIN',
  'INNER JOIN',
  'OUTER JOIN',
  'CROSS JOIN',
  'FULL JOIN',
])

// 常用函数（MySQL 直查高频）：JSON 系 / 聚合 / 条件 / 字符串 / 数值 / 日期
const SQL_FUNCS = [
  // JSON
  'JSON_OBJECT', 'JSON_ARRAY', 'JSON_ARRAYAGG', 'JSON_EXTRACT', 'JSON_UNQUOTE', 'JSON_CONTAINS', 'JSON_SET',
  // 聚合
  'COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'GROUP_CONCAT',
  // 条件
  'IF', 'IFNULL', 'COALESCE', 'NULLIF',
  // 字符串
  'CONCAT', 'CONCAT_WS', 'SUBSTRING', 'REPLACE', 'TRIM', 'UPPER', 'LOWER', 'LENGTH', 'FIND_IN_SET',
  // 数值
  'ROUND', 'FLOOR', 'CEIL', 'ABS',
  // 日期
  'NOW', 'CURDATE', 'DATE_FORMAT', 'DATE', 'YEAR', 'MONTH', 'DAY',
  // 类型转换
  'CAST',
]

// 常用 DDL / 语句关键字
const SQL_EXTRA = [
  'TABLE', 'DATABASE', 'SCHEMA', 'SHOW', 'USE', 'CREATE', 'ALTER', 'DROP', 'TRUNCATE', 'RENAME',
  'PRIMARY', 'FOREIGN', 'REFERENCES', 'INDEX', 'UNIQUE', 'DEFAULT', 'AUTO_INCREMENT', 'COMMENT', 'ENGINE',
  'BEGIN', 'COMMIT', 'ROLLBACK', 'TRANSACTION',
]

// 输入提示词库：KW 单词 + 复合子句 + 函数 + 扩展关键字，去重后短词优先
const SUGGEST_POOL = Array.from(
  new Set([
    ...Array.from(KW),
    ...Object.entries(PREFIX_FOLLOW).map(([a, b]) => `${a} ${b}`),
    ...Array.from(CLAUSE_TOP),
    ...Array.from(COMPOUND_TOP),
    ...Array.from(COMPOUND_INDENT),
    ...SQL_FUNCS,
    ...SQL_EXTRA,
  ]),
).sort((a, b) => a.length - b.length || a.localeCompare(b))

// 合并外部自定义提示词（如数据库名、表名）：保留默认排序，外部词追加到末尾
const buildSuggestPool = (extra) => {
  if (!Array.isArray(extra) || !extra.length) return SUGGEST_POOL
  const extras = extra.filter(Boolean).map(String)
  if (!extras.length) return SUGGEST_POOL
  return Array.from(new Set([...SUGGEST_POOL, ...extras]))
}

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

function formatSql(text) {
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
  let lastIsOpenParen = false // 上一 token 是 '('（其后内容紧贴不空格）
  let pending = false // 子句关键字后，下一 token 换行（缩进由 indent 决定）

  // 输出当前行并清空（indent 保留，供后续行沿用）
  const flush = () => {
    if (cur.trim()) lines.push(indent + cur.trim())
    cur = ''
    pending = false
  }
  const isPunct = (ch) => ch === ',' || ch === '(' || ch === ')' || ch === ';' || ch === '.'
  // 标点紧贴前一 token；普通 token 空格分隔（. 后与 ( 后不空格）
  const append = (t) => {
    if (isPunct(t)) {
      if (cur.endsWith(' ')) cur = cur.slice(0, -1)
      cur += t
      lastIsDot = t === '.'
      lastIsOpenParen = false
      return
    }
    if (cur && cur.trim() && !lastIsDot && !lastIsOpenParen) cur += ' '
    cur += t
    lastIsDot = false
    lastIsOpenParen = false
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
  // 块内关键字（JOIN 系 / CASE 块）：独占一行（默认缩进 4，可指定层级），后续内容同行
  const startIndented = (kw, level = 4) => {
    flush()
    indent = ' '.repeat(level)
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
    // 块内缩进关键字（CASE 块内 CASE/END 缩进 4）：独占一行，后续内容同行
    if (CLAUSE_INDENT.has(t) && depth === 0) {
      startIndented(t)
      continue
    }
    // CASE 块内 WHEN/ELSE 深一层缩进 8：独占一行，后续内容同行
    if (CLAUSE_INDENT_DEEP.has(t) && depth === 0) {
      startIndented(t, 8)
      continue
    }
    // 逗号：括号外（顶层 SELECT 列列表）保留在行尾换行；括号内（函数/列表/子查询）同行
    if (t === ',') {
      addToken(t)
      if (depth === 0) flush()
      continue
    }
    // 括号外 AND/OR：换行缩进 4
    if ((t === 'AND' || t === 'OR') && depth === 0) {
      flush()
      indent = '    '
      cur = t
      continue
    }
    // 左括号：紧贴挂行尾，括号内内容不换行（不加深缩进）。
    // 函数名/标识符后紧贴（JSON_OBJECT( / COUNT(），关键字、运算符、标点后保留空格（IN ( / AND ( / = (）
    if (t === '(') {
      const prevIdent =
        k > 0 && /^[A-Za-z_][A-Za-z0-9_]*$/.test(norm[k - 1]) && !KW.has(norm[k - 1].toUpperCase())
      if (prevIdent) {
        if (cur.endsWith(' ')) cur = cur.slice(0, -1)
      } else if (cur && !cur.endsWith(' ')) {
        cur += ' '
      }
      cur += '('
      depth++
      lastIsOpenParen = true
      continue
    }
    // 右括号：紧贴最后参数结束（缩进不变，括号内未加深）
    if (t === ')') {
      depth = Math.max(0, depth - 1)
      if (cur.endsWith(' ')) cur = cur.slice(0, -1)
      cur += t
      lastIsOpenParen = false
      continue
    }
    addToken(t)
  }
  flush()
  return lines.join('\n')
}

// HTML 转义：防止 SQL 中的特殊字符破坏高亮结构
const escapeHtml = (s) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

// 关键字高亮：KW 集合中的词渲染为蓝色加粗。
// 按原文本逐字符扫描，空白/占位符/字符串/数字/标点全部原样保留（tokenize 会丢弃空白，不能用于渲染）。
const highlightLine = (line) => {
  let html = ''
  let i = 0
  const n = line.length
  const emit = (s) => {
    html += escapeHtml(s)
  }
  while (i < n) {
    const c = line[i]
    // ${form.xxx} 占位符：整体原样保留（含内部空格）
    if (c === '$' && line[i + 1] === '{') {
      let j = i + 2
      while (j < n && line[j] !== '}') j++
      if (j < n) j++
      emit(line.slice(i, j))
      i = j
    } else if (c === "'" || c === '"') {
      // 字符串/标识符字面量（单/双引号，含转义）：整体渲染为红色，内部不做关键字高亮
      const q = c
      let j = i + 1
      let s = q
      while (j < n) {
        const ch = line[j]
        if (ch === '\\' && j + 1 < n) {
          s += ch + line[j + 1]
          j += 2
          continue
        }
        s += ch
        j++
        if (ch === q) break
      }
      html += `<span style="color:#f53f3f">${escapeHtml(s)}</span>`
      i = j
    } else if (/\s/.test(c)) {
      // 连续空白原样保留
      let j = i
      while (j < n && /\s/.test(line[j])) j++
      emit(line.slice(i, j))
      i = j
    } else if (/[A-Za-z_]/.test(c)) {
      let j = i
      while (j < n && /[A-Za-z0-9_]/.test(line[j])) j++
      const word = line.slice(i, j)
      const u = word.toUpperCase()
      html +=
        u && KW.has(u)
          ? `<span style="color:#3370ff;font-weight:600">${escapeHtml(word)}</span>`
          : escapeHtml(word)
      i = j
    } else if (/[0-9]/.test(c)) {
      let j = i
      while (j < n && /[0-9.]/.test(line[j])) j++
      html += `<span style="color:#00b42a">${escapeHtml(line.slice(i, j))}</span>`
      i = j
    } else {
      emit(c)
      i++
    }
  }
  return html
}

// 简化：把 SQL 压缩为紧凑单行（去除换行与多余空格）。
// 字符串字面量（含 ${form.xxx} 占位符）原样保留；
// . / ( 前紧贴且后紧贴（u.id、JSON_OBJECT(），, / ) / ; 前紧贴，其余运算符两侧保留单空格。
function compactSql(text) {
  if (!text) return text
  const toks = tokenize(String(text).trim())
  const noSpaceBefore = new Set([',', ')', ';', '.', '('])
  const noSpaceAfter = new Set(['.', '('])
  let out = ''
  for (const t of toks) {
    if (t.t === 's') {
      if (out && !noSpaceBefore.has(t.v)) out += ' '
      out += t.v
    } else {
      if (out && !noSpaceAfter.has(out[out.length - 1])) out += ' '
      out += t.v
    }
  }
  return out
}

// ──────────────────────────────── 组件 ────────────────────────────────

// 带行号的等宽编辑区：底层语法高亮层（pre-wrap）+ 透明原生 textarea 叠加。
// 不使用组件库 TextArea，行高/字号/内边距全部显式控制（20px 紧凑行高）。
// 高亮层与 textarea 同宽同字体同折行规则，关键字（KW 集合）蓝色加粗；
// textarea 文字透明仅保留光标/选择，负责输入与滚动；滚动时高亮层/行号列同步。
// 每逻辑行折行段数通过高亮层测量，折行段行号补空白行，行号与视觉行严格对齐。
function LineTextarea({ value, onChange, onFocus, placeholder, maxLength, minRows, maxRows, id, full, fontSize = FONT_SIZE_DEFAULT, extraSuggestions }) {
  const gutterRef = useRef(null)
  const highlightRef = useRef(null)
  const taRef = useRef(null)
  // 光标位置测量：measureRef 渲染光标行前缀 + marker，markerRef 坐标即光标像素位置
  const measureRef = useRef(null)
  const markerRef = useRef(null)
  const [wrapSegs, setWrapSegs] = useState([])
  const [suggestions, setSuggestions] = useState([])
  const [activeIdx, setActiveIdx] = useState(0)
  const [caretPos, setCaretPos] = useState({ top: 0, left: 0 })
  const lines = value ? value.split('\n') : ['']
  // 行高随行号字号联动：与默认 13px/20px 的比例一致（≈1.54）
  const ROW_H = Math.max(16, Math.round(fontSize * 1.54))
  // 总视觉行数 = 各逻辑行折行段数之和（未测量时按逻辑行数估算）
  const totalLines = wrapSegs.length ? wrapSegs.reduce((a, b) => a + b, 0) : lines.length
  const rows = Math.max(minRows, Math.min(maxRows, totalLines))
  const height = rows * ROW_H + 8
  const fontStyle = {
    fontFamily: 'ui-monospace, SFMono-Regular, Consolas, "Courier New", monospace',
    fontSize,
    lineHeight: `${ROW_H}px`,
  }
  const padStyle = { padding: '4px 8px' }

  // 文本变化后测量高亮层中每个逻辑行的折行段数（与 textarea 同宽同字体同折行规则）
  useLayoutEffect(() => {
    if (!highlightRef.current) return
    const segs = Array.from(highlightRef.current.children).map((el) =>
      Math.max(1, Math.round(el.offsetHeight / ROW_H)),
    )
    setWrapSegs(segs)
  }, [value, minRows, maxRows, fontSize, ROW_H])

  // 滚动同步：行号列（纵向）+ 高亮层（纵/横向）
  const syncScroll = (e) => {
    const t = e.target
    if (gutterRef.current) gutterRef.current.scrollTop = t.scrollTop
    if (highlightRef.current) {
      highlightRef.current.scrollTop = t.scrollTop
      highlightRef.current.scrollLeft = t.scrollLeft
    }
  }

  // 提示打开时测量光标像素位置（相对文本容器）：累计前序行的 offsetTop + 光标行内前缀的 offsetLeft
  useLayoutEffect(() => {
    if (!suggestions.length || !measureRef.current || !markerRef.current) return
    setCaretPos({ top: markerRef.current.offsetTop, left: markerRef.current.offsetLeft })
  }, [suggestions, value])

  // 输入后计算补全候选：光标前最后一个词长度 >= 2 且命中词库才提示
  const computeSuggestions = (src) => {
    const ta = taRef.current
    const pos = ta ? ta.selectionStart : src.length
    const before = src.slice(0, pos)
    const m = before.match(/([A-Za-z_][A-Za-z0-9_]*)$/)
    if (!m || m[1].length < 2) {
      setSuggestions([])
      return
    }
    const pre = m[1].toLowerCase()
    const pool = buildSuggestPool(extraSuggestions)
    const hits = pool.filter((s) => s.toLowerCase().startsWith(pre))
    setSuggestions(hits)
    setActiveIdx(0)
  }

  // 填入候选：替换光标前的当前词，光标移到填入内容末尾
  const applySuggestion = (s) => {
    const ta = taRef.current
    const pos = ta ? ta.selectionStart : value.length
    const before = value.slice(0, pos)
    const m = before.match(/([A-Za-z_][A-Za-z0-9_]*)$/)
    const wordStart = m ? pos - m[1].length : pos
    const next = value.slice(0, wordStart) + s + value.slice(ta ? ta.selectionEnd : pos)
    onChange?.(next)
    setSuggestions([])
    requestAnimationFrame(() => {
      if (!ta) return
      const p = wordStart + s.length
      ta.focus()
      ta.setSelectionRange(p, p)
    })
  }

  // 原生 textarea 的 onChange 传事件对象，需转为 (value, event) 以匹配外层受控接口
  const handleNativeChange = (e) => {
    onChange?.(e.target.value, e)
    computeSuggestions(e.target.value)
  }

  // 键盘：Enter 补全（提示打开时）/ 自动缩进；上下键切换候选；Esc 关闭提示
  const handleKeyDown = (e) => {
    const ta = e.target
    if (e.key === 'Enter' && suggestions.length > 0) {
      e.preventDefault()
      applySuggestion(suggestions[activeIdx])
      return
    }
    if (e.key === 'ArrowDown' && suggestions.length > 0) {
      e.preventDefault()
      setActiveIdx((i) => (i + 1) % suggestions.length)
      return
    }
    if (e.key === 'ArrowUp' && suggestions.length > 0) {
      e.preventDefault()
      setActiveIdx((i) => (i - 1 + suggestions.length) % suggestions.length)
      return
    }
    if (e.key === 'Escape') {
      setSuggestions([])
      return
    }
    if (e.key !== 'Enter') return
    e.preventDefault()
    // 回车换行：新行自动继承当前行的前导空白缩进，光标定位到缩进之后（与上一行对齐）
    const pos = ta.selectionStart
    const end = ta.selectionEnd
    const lineStart = value.lastIndexOf('\n', pos - 1) + 1
    const indent = (value.slice(lineStart, pos).match(/^[ \t]*/) || [''])[0]
    const next = value.slice(0, pos) + '\n' + indent + value.slice(end)
    onChange?.(next, e)
    requestAnimationFrame(() => {
      const p = pos + 1 + indent.length
      ta.focus()
      ta.setSelectionRange(p, p)
    })
  }

  // 光标测量层内容：提示打开时渲染到光标行（前序行完整 + 光标行前缀 + marker）
  let measureLines = null
  if (suggestions.length > 0) {
    const pos = taRef.current ? taRef.current.selectionStart : value.length
    const upTo = value.slice(0, pos)
    const lineIdx = upTo.split('\n').length - 1
    const prefix = upTo.slice(upTo.lastIndexOf('\n') + 1)
    measureLines = [...lines.slice(0, lineIdx), prefix]
  }

  return (
    <div className="flex" style={{ height, ...fontStyle , ...(full?{height:'calc(100% - 34px)'}:{})}}>
      <pre
        ref={gutterRef}
        className="m-0 overflow-hidden border-r border-gray-200 bg-gray-50 py-1 pr-2 text-right text-gray-400 select-none"
        style={{ ...fontStyle, width: 44, paddingLeft: 4, flexShrink: 0 }}
      >
        {lines.map((l, i) => (
          <div key={i}>
            {i + 1}
            {Array.from({ length: (wrapSegs[i] || 1) - 1 }, (_, j) => (
              <div key={j}> </div>
            ))}
          </div>
        ))}
      </pre>
      <div className="relative flex-1 overflow-hidden bg-gray-50 h-full" >
        {/* 语法高亮层：关键字蓝色加粗；与 textarea 同尺寸同折行规则，随 textarea 滚动 */}
        <div
          ref={highlightRef}
          aria-hidden
          className="absolute inset-0 overflow-hidden"
          style={{ ...fontStyle, ...padStyle, whiteSpace: 'pre-wrap', overflowWrap: 'break-word' }}
        >
          {lines.map((l, i) => (
            <div key={i} dangerouslySetInnerHTML={{ __html: l ? highlightLine(l) : ' ' }} />
          ))}
        </div>
        {/* 透明输入层：文字透明仅保留光标/选区，placeholder 通过外部样式保持可见 */}
        <textarea
          id={id}
          ref={taRef}
          value={value}
          onChange={handleNativeChange}
          onKeyDown={handleKeyDown}
          onFocus={onFocus}
          onBlur={() => setSuggestions([])}
          onScroll={syncScroll}
          placeholder={placeholder}
          maxLength={maxLength}
          spellCheck={false}
          className="sql-editor-input absolute inset-0 resize-none border-none bg-transparent outline-none"
          style={{
            ...fontStyle,
            ...padStyle,
            color: 'transparent',
            caretColor: '#1d2129',
            whiteSpace: 'pre-wrap',
            overflowWrap: 'break-word',
            overflow: 'auto',
          }}
        />
        {/* 光标测量层：提示打开时渲染到光标位置，marker 坐标即光标像素位置 */}
        {suggestions.length > 0 && (
          <div
            ref={measureRef}
            aria-hidden
            className="absolute inset-0 invisible"
            style={{ ...fontStyle, ...padStyle, whiteSpace: 'pre-wrap', overflowWrap: 'break-word', pointerEvents: 'none' }}
          >
            {measureLines.map((l, i) => (
              <div key={i}>
                {l || ' '}
                {i === measureLines.length - 1 && <span ref={markerRef}>|</span>}
              </div>
            ))}
          </div>
        )}
        {/* 补全下拉框：定位在光标下方 */}
        {suggestions.length > 0 && (
          <div
            className="absolute z-20 max-h-52 overflow-auto rounded border border-gray-200 bg-white py-1 shadow-lg"
            style={{ top: caretPos.top + ROW_H, left: caretPos.left, minWidth: 160 }}
          >
            {suggestions.map((s, i) => (
              <div
                key={s}
                className={
                  'flex cursor-pointer items-center px-2 py-0.5 ' +
                  (i === activeIdx ? 'bg-blue-50 text-blue-600' : 'text-gray-700')
                }
                style={{ fontSize, lineHeight: `${Math.max(16, Math.round(fontSize * 1.6))}px` }}
                onMouseDown={(e) => {
                  e.preventDefault()
                  applySuggestion(s)
                }}
                onMouseEnter={() => setActiveIdx(i)}
              >
                <IconCode className="mr-1.5 text-gray-400" />
                {s}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * SQL 模板编辑器：顶部功能按钮区（美化 / 全屏）+ 带行号输入区。
 * 受控组件，可直接作为 Arco FormItem 的 children（透传 value/onChange/id）。
 */
export default function SqlEditor(props) {
  const { value = '', onChange, id, placeholder, maxLength = 8000, extraSuggestions } = props
  const [fullscreen, setFullscreen] = useState(false)
  // 字号：初始读 localStorage；其它实例改动时通过自定义事件同步刷新
  const [fontSize, setFontSize] = useState(readFontSize)
  useEffect(() => {
    const handler = () => setFontSize(readFontSize())
    window.addEventListener(FONT_SIZE_EVENT, handler)
    return () => window.removeEventListener(FONT_SIZE_EVENT, handler)
  }, [])

  const handleChange = (v) => {
    onChange?.(v)
  }

  const handleFormat = () => {
    if (!value) return
    onChange?.(formatSql(value))
  }

  const handleCompact = () => {
    if (!value) return
    onChange?.(compactSql(value))
  }

  // 共享编辑区：工具栏（美化/简化 + 右侧按钮）+ 带行号输入区。
  // 主区与全屏 Modal 显示完全一致，唯一差异是传入的右侧按钮（全屏 / 退出全屏）。
  const renderEditor = (toolbarAction, textareaProps) => (
    <>
      <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-2 py-1">
        <Space size={0}>
          <Button type="text" size="mini" onClick={handleFormat}>
            美化
          </Button>
          <Button type="text" size="mini" onClick={handleCompact}>
            简化
          </Button>
          <span className="mx-1 inline-block h-3 w-px bg-gray-300" />
          <Button
            type="text"
            size="mini"
            icon={<IconMinus />}
            disabled={fontSize <= FONT_SIZE_MIN}
            onClick={() => changeFontSize(-1)}
          />
          <span className="min-w-7 text-center text-xs text-gray-500">{fontSize}</span>
          <Button
            type="text"
            size="mini"
            icon={<IconPlus />}
            disabled={fontSize >= FONT_SIZE_MAX}
            onClick={() => changeFontSize(1)}
          />
        </Space>
        {toolbarAction}
      </div>
      <LineTextarea {...textareaProps} fontSize={fontSize} />
    </>
  )

  return (
    <>
      {/* 输入层文字透明，placeholder 需单独着色保持可见 */}
      <style>{'.sql-editor-input::placeholder { color: #c9cdd4; }'}</style>
      <div className="overflow-hidden rounded border border-gray-200">
        {renderEditor(
          <Button type="text" size="mini" onClick={() => setFullscreen(true)}>
            <IconFullscreen /> 全屏
          </Button>,
          {
            id,
            value,
            onChange: handleChange,
            placeholder,
            maxLength,
            minRows: 10,
            maxRows: 10,
            extraSuggestions,
          },
        )}

        {/* 全屏编辑 */}
        <Modal
          title="SQL编辑器"
          visible={fullscreen}
          footer={null}
          closable={false}
          style={{ width: '100%', height: '100%' }}
          className="[&_.arco-modal-content]:h-[calc(100vh-48px)] [&_.arco-modal-content]:p-0!"
          onCancel={() => setFullscreen(false)}
          unmountOnExit
        >
          {renderEditor(
            <Button type="text" size="mini" onClick={() => setFullscreen(false)}>
              <IconFullscreenExit /> 退出全屏
            </Button>,
            {
              value,
              onChange: handleChange,
              placeholder,
              maxLength,
              full: true,
              extraSuggestions,
            },
          )}
        </Modal>
      </div>
    </>
  )
}
