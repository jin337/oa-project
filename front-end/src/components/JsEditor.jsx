import { Button, Modal, Space } from '@arco-design/web-react'
import {
  IconFullscreen,
  IconFullscreenExit,
  IconMinus,
  IconPlus,
} from '@arco-design/web-react/icon'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'

// ──────────────────────────────── 字号（模块级，localStorage 持久化） ────────────────────────────────
const FONT_SIZE_KEY = 'js-editor:font-size'
const FONT_SIZE_DEFAULT = 14
const FONT_SIZE_MIN = 11
const FONT_SIZE_MAX = 22
const FONT_SIZE_EVENT = 'js-editor:font-size-change'

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

// ──────────────────────────────── JS 美化 / 简化 ────────────────────────────────
// 美化：使用项目已安装的 prettier（babel parser）格式化，K&R 风格、2 空格缩进。
// 片段（如箭头函数体）prettier 也能识别；语法错误时回退到手工缩进版本。
// 简化：去注释、压缩空白为单空格、整体一行。
let _prettierPromise = null
function loadPrettier() {
  if (!_prettierPromise) {
    _prettierPromise = import('prettier/standalone').then((m) =>
      Promise.all([import('prettier/plugins/babel'), m]).then(([babel, core]) => ({
        core,
        parsers: { babel: babel.parsers.babel },
      })),
    )
  }
  return _prettierPromise
}

// 手工回退版：按 { } ; 边界断行（字符串/注释内不切）
const manualBeautifyJs = (src) => {
  if (!src) return ''
  const out = []
  let indent = 0
  let buf = ''
  let inStr = null
  const flushLine = (delta) => {
    const t = buf.trim()
    buf = ''
    if (!t) return
    out.push('  '.repeat(Math.max(0, indent)) + t)
    if (delta) indent = Math.max(0, indent + delta)
  }
  let i = 0
  while (i < src.length) {
    const c = src[i]
    if (inStr) {
      buf += c
      if (c === '\\' && i + 1 < src.length) {
        buf += src[i + 1]
        i += 2
        continue
      }
      if (c === inStr) inStr = null
      i++
      continue
    }
    if (c === "'" || c === '"' || c === '`') {
      inStr = c
      buf += c
      i++
      continue
    }
    if (c === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') {
        buf += src[i]
        i++
      }
      flushLine(0)
      continue
    }
    if (c === '/' && src[i + 1] === '*') {
      buf += '/*'
      i += 2
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) {
        buf += src[i]
        i++
      }
      buf += '*/'
      i += 2
      flushLine(0)
      continue
    }
    if (c === ';') {
      buf += c
      flushLine(0)
      i++
      continue
    }
    if (c === '{') {
      buf += c
      flushLine(1)
      i++
      continue
    }
    if (c === '}') {
      const before = buf.trim()
      if (before && before !== '}') {
        out.push('  '.repeat(Math.max(0, indent)) + before)
      }
      buf = ''
      indent = Math.max(0, indent - 1)
      out.push('  '.repeat(Math.max(0, indent)) + '}')
      i++
      let rest = ''
      while (i < src.length && !'{;}\n'.includes(src[i])) {
        rest += src[i]
        i++
      }
      if (rest.trim()) buf = rest.trim()
      continue
    }
    buf += c
    i++
  }
  if (buf.trim()) flushLine(0)
  return out.join('\n')
}

// prettier 美化：先按完整 Program 试，失败则包成表达式再试；都失败回退手工版
const beautifyJs = async (src) => {
  if (!src || !src.trim()) return src || ''
  try {
    const { core, parsers } = await loadPrettier()
    const tryFormat = (text) =>
      core.format(text, {
        parser: 'babel',
        plugins: [parsers],
        semi: true,
        tabWidth: 2,
        printWidth: 80,
        singleQuote: true,
        trailingComma: 'es5',
      })
    try {
      return (await tryFormat(src)).trim()
    } catch {
      // 片段（如 `(a, b) => { ... }`）不是完整 Program，包成表达式再格式化
      try {
        const wrapped = `async function _f() {\n${src}\n}`
        const formatted = await tryFormat(wrapped)
        // 抽出函数体内容
        const body = formatted
          .replace(/^async function _f\(\) \{\n/, '')
          .replace(/\n\}\s*$/, '')
        return body.trim()
      } catch {
        return manualBeautifyJs(src)
      }
    }
  } catch {
    return manualBeautifyJs(src)
  }
}

const compactJs = (src) => {
  if (!src) return ''
  let out = ''
  let i = 0
  let inStr = null
  while (i < src.length) {
    const c = src[i]
    if (inStr) {
      out += c
      if (c === '\\' && i + 1 < src.length) {
        out += src[i + 1]
        i += 2
        continue
      }
      if (c === inStr) inStr = null
      i++
      continue
    }
    if (c === "'" || c === '"' || c === '`') {
      inStr = c
      out += c
      i++
      continue
    }
    // 行注释整段丢弃
    if (c === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') i++
      continue
    }
    // 块注释丢弃
    if (c === '/' && src[i + 1] === '*') {
      i += 2
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++
      i += 2
      continue
    }
    if (/\s/.test(c)) {
      // 压缩空白为单空格，但保留字符串外的分隔需要；去掉多余空格
      if (out && !/\s$/.test(out)) out += ' '
      i++
      continue
    }
    out += c
    i++
  }
  return out.trim()
}

// ──────────────────────────────── JS 语法高亮 ────────────────────────────────
const JS_KW = new Set([
  'const',
  'let',
  'var',
  'function',
  'return',
  'if',
  'else',
  'for',
  'while',
  'do',
  'switch',
  'case',
  'break',
  'continue',
  'new',
  'typeof',
  'instanceof',
  'in',
  'of',
  'try',
  'catch',
  'finally',
  'throw',
  'async',
  'await',
  'class',
  'extends',
  'this',
  'null',
  'undefined',
  'true',
  'false',
  'import',
  'from',
  'export',
  'default',
])

const escapeHtml = (s) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

// 单行逐字符高亮：字符串红色、关键字蓝色加粗、数字绿色、注释灰色
const highlightLine = (line) => {
  let html = ''
  let i = 0
  const n = line.length
  while (i < n) {
    const c = line[i]
    // 行注释 //：整行灰色
    if (c === '/' && line[i + 1] === '/') {
      html += `<span style="color:#86909c">${escapeHtml(line.slice(i))}</span>`
      break
    }
    // 字符串字面量（单/双/反引号）：整体红色
    if (c === "'" || c === '"' || c === '`') {
      let j = i + 1
      let s = c
      while (j < n) {
        const ch = line[j]
        if (ch === '\\' && j + 1 < n) {
          s += ch + line[j + 1]
          j += 2
          continue
        }
        s += ch
        j++
        if (ch === c) break
      }
      html += `<span style="color:#f53f3f">${escapeHtml(s)}</span>`
      i = j
      continue
    }
    // 标识符 / 关键字
    if (/[A-Za-z_$]/.test(c)) {
      let j = i
      while (j < n && /[A-Za-z0-9_$]/.test(line[j])) j++
      const word = line.slice(i, j)
      html += JS_KW.has(word)
        ? `<span style="color:#3370ff;font-weight:600">${escapeHtml(word)}</span>`
        : escapeHtml(word)
      i = j
      continue
    }
    // 数字
    if (/[0-9]/.test(c)) {
      let j = i
      while (j < n && /[0-9.]/.test(line[j])) j++
      html += `<span style="color:#00b42a">${escapeHtml(line.slice(i, j))}</span>`
      i = j
      continue
    }
    html += escapeHtml(c)
    i++
  }
  return html
}

// ──────────────────────────────── 带行号编辑区 ────────────────────────────────
function LineTextarea({
  value,
  onChange,
  placeholder,
  maxLength,
  minRows,
  maxRows,
  id,
  full,
  fontSize,
}) {
  const gutterRef = useRef(null)
  const highlightRef = useRef(null)
  const taRef = useRef(null)
  const [wrapSegs, setWrapSegs] = useState([])
  const lines = value ? value.split('\n') : ['']
  const ROW_H = Math.max(16, Math.round(fontSize * 1.54))
  const totalLines = wrapSegs.length ? wrapSegs.reduce((a, b) => a + b, 0) : lines.length
  const rows = Math.max(minRows, Math.min(maxRows, totalLines))
  const height = rows * ROW_H + 8
  const fontStyle = {
    fontFamily: 'ui-monospace, SFMono-Regular, Consolas, "Courier New", monospace',
    fontSize,
    lineHeight: `${ROW_H}px`,
  }
  const padStyle = { padding: '4px 8px' }

  useLayoutEffect(() => {
    if (!highlightRef.current) return
    const segs = Array.from(highlightRef.current.children).map((el) =>
      Math.max(1, Math.round(el.offsetHeight / ROW_H)),
    )
    setWrapSegs(segs)
  }, [value, minRows, maxRows, fontSize, ROW_H])

  const syncScroll = (e) => {
    const t = e.target
    if (gutterRef.current) gutterRef.current.scrollTop = t.scrollTop
    if (highlightRef.current) {
      highlightRef.current.scrollTop = t.scrollTop
      highlightRef.current.scrollLeft = t.scrollLeft
    }
  }

  const handleKeyDown = (e) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    const ta = e.target
    const pos = ta.selectionStart
    const end = ta.selectionEnd
    const lineStart = value.lastIndexOf('\n', pos - 1) + 1
    const indent = (value.slice(lineStart, pos).match(/^[ \t]*/) || [''])[0]
    // 行末为 { 或 ( 时多缩进一级
    const extra = /[{(]\s*$/.test(value.slice(lineStart, pos)) ? '  ' : ''
    const next = value.slice(0, pos) + '\n' + indent + extra + value.slice(end)
    onChange?.(next, e)
    requestAnimationFrame(() => {
      const p = pos + 1 + indent.length + extra.length
      ta.focus()
      ta.setSelectionRange(p, p)
    })
  }

  return (
    <div
      className="flex"
      style={{ height, ...fontStyle, ...(full ? { height: 'calc(100% - 34px)' } : {}) }}
    >
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
      <div className="relative h-full flex-1 overflow-hidden bg-gray-50">
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
        <textarea
          id={id}
          ref={taRef}
          value={value}
          onChange={(e) => onChange?.(e.target.value, e)}
          onKeyDown={handleKeyDown}
          onScroll={syncScroll}
          placeholder={placeholder}
          maxLength={maxLength}
          spellCheck={false}
          className="js-editor-input absolute inset-0 resize-none border-none bg-transparent outline-none"
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
      </div>
    </div>
  )
}

// ──────────────────────────────── 组件 ────────────────────────────────

/**
 * JS 脚本编辑器：参考 SqlEditor 的编辑体验（行号、透明输入层、字号缩放 localStorage、全屏）。
 * 受控组件：value / onChange。
 */
export default function JsEditor(props) {
  const {
    value = '',
    onChange,
    id,
    placeholder,
    maxLength = 8000,
    minRows = 6,
    maxRows = 12,
  } = props
  const [fullscreen, setFullscreen] = useState(false)
  const [fontSize, setFontSize] = useState(readFontSize)
  const [beautifying, setBeautifying] = useState(false)

  useEffect(() => {
    const handler = () => setFontSize(readFontSize())
    window.addEventListener(FONT_SIZE_EVENT, handler)
    return () => window.removeEventListener(FONT_SIZE_EVENT, handler)
  }, [])

  const handleBeautify = async () => {
    if (beautifying) return
    setBeautifying(true)
    try {
      const next = await beautifyJs(value)
      onChange?.(next)
    } finally {
      setBeautifying(false)
    }
  }

  const renderEditor = (toolbarAction, textareaProps) => (
    <>
      <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-2 py-1">
        <Space size={0}>
          <Button
            type="text"
            size="mini"
            loading={beautifying}
            onClick={handleBeautify}
          >
            美化
          </Button>
          <Button type="text" size="mini" onClick={() => onChange?.(compactJs(value))}>
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
      <style>{'.js-editor-input::placeholder { color: #c9cdd4; }'}</style>
      <div className="overflow-hidden rounded border border-gray-200">
        {renderEditor(
          <Button type="text" size="mini" onClick={() => setFullscreen(true)}>
            <IconFullscreen /> 全屏
          </Button>,
          { id, value, onChange, placeholder, maxLength, minRows, maxRows },
        )}

        <Modal
          title="JS编辑器"
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
            { value, onChange, placeholder, maxLength, full: true },
          )}
        </Modal>
      </div>
    </>
  )
}
