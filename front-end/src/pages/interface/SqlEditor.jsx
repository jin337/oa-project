import { Button, Modal, Space } from '@arco-design/web-react'
import { IconFullscreen, IconFullscreenExit } from '@arco-design/web-react/icon'
import { useRef, useState } from 'react'

// ──────────────────────────────── SQL 工具 ────────────────────────────────
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

// 常用 SQL 关键字：输入时按前缀匹配提示，点击补全到光标处
const SQL_KEYWORDS = [
  'SELECT',
  'FROM',
  'WHERE',
  'AND',
  'OR',
  'ORDER BY',
  'GROUP BY',
  'LEFT JOIN',
  'INNER JOIN',
  'RIGHT JOIN',
  'ON',
  'AS',
  'DISTINCT',
  'LIMIT',
  'OFFSET',
  'INSERT INTO',
  'UPDATE',
  'DELETE FROM',
  'SET',
  'VALUES',
  'UNION ALL',
  'CASE WHEN',
  'THEN',
  'ELSE',
  'END',
  'JSON_OBJECT',
  'COUNT',
  'SUM',
  'MAX',
  'MIN',
  'AVG',
  'IFNULL',
  'CONCAT',
]

// ──────────────────────────────── 组件 ────────────────────────────────

// 带行号的等宽编辑区：底层行号列（pre）+ 透明原生 textarea 叠加。
// 不使用组件库 TextArea，行高/字号/内边距全部显式控制（20px 紧凑行高），
// white-space: pre 不自动换行，行号严格对应逻辑行，滚动时行号列同步。
function LineTextarea({ value, onChange, onFocus, placeholder, maxLength, minRows, maxRows, id }) {
  const gutterRef = useRef(null)
  const lineCount = value ? value.split('\n').length : 1
  const ROW_H = 20
  const rows = Math.max(minRows, Math.min(maxRows, lineCount))
  const height = rows * ROW_H + 8
  const fontStyle = {
    fontFamily: 'ui-monospace, SFMono-Regular, Consolas, "Courier New", monospace',
    fontSize: 13,
    lineHeight: `${ROW_H}px`,
  }

  const syncScroll = (e) => {
    if (gutterRef.current) gutterRef.current.scrollTop = e.target.scrollTop
  }

  // 原生 textarea 的 onChange 传事件对象，需转为 (value, event) 以匹配外层受控接口
  const handleNativeChange = (e) => onChange?.(e.target.value, e)

  return (
    <div className="flex" style={{ height, ...fontStyle }}>
      <pre
        ref={gutterRef}
        className="m-0 select-none overflow-hidden border-r border-gray-200 bg-gray-50 py-1 pr-2 text-right text-gray-400"
        style={{ ...fontStyle, width: 44, paddingLeft: 4, flexShrink: 0 }}
      >
        {Array.from({ length: lineCount }, (_, i) => i + 1).join('\n')}
      </pre>
      <textarea
        id={id}
        value={value}
        onChange={handleNativeChange}
        onFocus={onFocus}
        onScroll={syncScroll}
        placeholder={placeholder}
        maxLength={maxLength}
        spellCheck={false}
        className="h-full flex-1 resize-none border-none outline-none bg-gray-50"
        style={{
          ...fontStyle,
          padding: '4px 8px',
          color: '#1d2129',
          whiteSpace: 'pre',
          overflowWrap: 'normal',
          overflow: 'auto',
        }}
      />
    </div>
  )
}

/**
 * SQL 模板编辑器：顶部功能按钮区（美化 / 全屏）+ 输入区 + 输入关键字前缀提示。
 * 受控组件，可直接作为 Arco FormItem 的 children（透传 value/onChange/id）。
 */
export default function SqlEditor(props) {
  const { value = '', onChange, id, placeholder, maxLength = 8000 } = props
  const [fullscreen, setFullscreen] = useState(false)
  const [suggestions, setSuggestions] = useState([])
  // 最近一次聚焦/输入的原生 textarea，用于读取光标位置
  const lastTarget = useRef(null)

  // 根据光标前的最后一个词计算前缀匹配的关键字候选
  const collectSuggestions = (v, el) => {
    if (!el) return
    const pos = el.selectionStart ?? v.length
    const before = v.slice(0, pos)
    const m = before.match(/([A-Za-z_][A-Za-z0-9_]*)$/)
    if (!m) return
    const word = m[1]
    const hit = SQL_KEYWORDS.filter((kw) => {
      const head = kw.split(' ')[0].toUpperCase()
      return head.startsWith(word.toUpperCase()) && head !== word.toUpperCase()
    })
    setSuggestions(hit.slice(0, 8))
  }

  const handleChange = (v, e) => {
    onChange?.(v)
    lastTarget.current = e?.target
    collectSuggestions(v, e?.target)
  }

  const handleFocus = (e) => {
    lastTarget.current = e.target
  }

  // 在光标处插入文本；replaceWord 为 true 时替换光标前的部分词（补全场景）
  const insertText = (text, replaceWord = false) => {
    const el = lastTarget.current
    if (!el) return
    const pos = el.selectionStart ?? value.length
    let start = pos
    if (replaceWord) {
      const m = value.slice(0, pos).match(/([A-Za-z_][A-Za-z0-9_]*)$/)
      if (m) start = pos - m[1].length
    }
    const next = value.slice(0, start) + text + value.slice(pos)
    onChange?.(next)
    requestAnimationFrame(() => {
      el.focus()
      const p = start + text.length
      el.setSelectionRange(p, p)
    })
    setSuggestions([])
  }

  const handleFormat = () => {
    if (!value) return
    onChange?.(formatSql(value))
  }

  const handleCompact = () => {
    if (!value) return
    onChange?.(compactSql(value))
  }

  // 候选提示条（主区 / 全屏共用渲染）
  const renderSuggestions = () =>
    suggestions.length > 0 && (
      <div className="flex flex-wrap gap-1 border-t border-gray-200 bg-gray-50 px-2 py-1">
        {suggestions.map((kw) => (
          <button
            key={kw}
            type="button"
            className="rounded border border-gray-300 bg-white px-1.5 py-0.5 text-xs text-gray-600 hover:border-blue-400 hover:text-blue-500"
            onClick={() => insertText(kw, true)}
          >
            {kw}
          </button>
        ))}
      </div>
    )

  return (
    <div className="overflow-hidden rounded border border-gray-200">
      {/* 功能按钮区 */}
      <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-2 py-1">
        <Space>
          <Button type="text" size="mini" onClick={handleFormat}>
            美化
          </Button>
          <Button type="text" size="mini" onClick={handleCompact}>
            简化
          </Button>
        </Space>
        <Button type="text" size="mini" onClick={() => setFullscreen(true)}>
          <IconFullscreen /> 全屏
        </Button>
      </div>
      {/* 输入区（带行号） */}
      <LineTextarea
        id={id}
        value={value}
        onChange={handleChange}
        onFocus={handleFocus}
        placeholder={placeholder}
        maxLength={maxLength}
        minRows={4}
        maxRows={10}
      />
      {renderSuggestions()}

      {/* 全屏编辑 */}
      <Modal
        title="SQL编辑器"
        visible={fullscreen}
        footer={null}
        style={{ width: '92vw', maxWidth: 1400 }}
        onCancel={() => setFullscreen(false)}
        unmountOnExit
      >
        <div className="mb-2 flex items-center justify-between">
          <Space>
            <Button size="mini" onClick={handleFormat}>
              美化
            </Button>
            <Button size="mini" onClick={handleCompact}>
              简化
            </Button>
          </Space>
          <Button size="mini" onClick={() => setFullscreen(false)}>
            <IconFullscreenExit /> 退出全屏
          </Button>
        </div>
        <div className="border border-gray-200">
          <LineTextarea
            value={value}
            onChange={handleChange}
            onFocus={handleFocus}
            placeholder={placeholder}
            maxLength={maxLength}
            minRows={16}
            maxRows={40}
          />
        </div>
        {renderSuggestions()}
        <span className="text-xs text-gray-400">输入时按前缀提示关键字，点击补全</span>
      </Modal>
    </div>
  )
}
