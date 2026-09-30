// 宽松 JSON 规范化：为未加引号的键与字符串值补双引号。
// 已加引号的键值、数字、true/false/null 保持不变（幂等，可重复点击）；
// 字符串字面量（含 ${form.xxx} 表达式）内部内容原样保留。
export function formatJsonQuotes(text) {
  if (!text) return text
  const src = String(text)
  const n = src.length
  const out = []
  let i = 0

  const isSpace = (c) => c === ' ' || c === '\t' || c === '\n' || c === '\r'
  const isDigit = (c) => c >= '0' && c <= '9'
  const isWordStart = (c) => /[A-Za-z_$]/.test(c)
  // 裸 token 边界：空白、结构分隔符（: , } ]）与引号
  const isTokenEnd = (c) =>
    isSpace(c) || c === ':' || c === ',' || c === '}' || c === ']' || c === '"' || c === "'"

  while (i < n) {
    const c = src[i]

    // 字符串字面量（双引号 / 单引号）：原样复制并跳过内容（处理反斜杠转义）
    if (c === '"' || c === "'") {
      const quote = c
      out.push(quote)
      i++
      while (i < n) {
        const ch = src[i]
        out.push(ch)
        i++
        if (ch === '\\' && i < n) {
          out.push(src[i])
          i++
          continue
        }
        if (ch === quote) break
      }
      continue
    }

    // 数字字面量（含负数 / 小数 / 科学计数）：原样复制
    if (c === '-' || isDigit(c)) {
      while (i < n && /[-+0-9.eE]/.test(src[i])) {
        out.push(src[i])
        i++
      }
      continue
    }

    // 单词起始：可能是裸 key（后跟冒号）或裸字符串 value
    if (isWordStart(c)) {
      // 扫描 token：普通分隔符结束；但 ${...} 表达式内的大括号不截断（braceDepth 跟踪）
      let j = i
      let depth = 0
      while (j < n) {
        const ch = src[j]
        if (ch === '{') depth++
        if (ch === '}' && depth > 0) {
          depth--
          j++
          continue
        }
        if (depth === 0 && isTokenEnd(ch)) break
        j++
      }
      const token = src.slice(i, j)
      // 跳过空白判断是否 key
      let k = j
      while (k < n && isSpace(src[k])) k++
      if (src[k] === ':') {
        out.push('"' + token + '"') // 裸 key 补引号（冒号由后续循环原样输出，避免重复）
        i = j
        continue
      }
      // true / false / null 为合法裸值，不加引号
      if (token === 'true' || token === 'false' || token === 'null') {
        out.push(token)
        i = j
        continue
      }
      // 其余裸字符串 value 补引号（如 ${form.id}、item.name 拼接表达式）
      out.push('"' + token + '"')
      i = j
      continue
    }

    // 其余字符（{ } [ ] : , 空白等）原样复制
    out.push(c)
    i++
  }
  return out.join('')
}
