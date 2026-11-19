/**
 * 动态数据源「加载后事件」：接口返回后、转换为选项前，对原始数据做纯数据处理。
 *
 * 约束：
 * - 脚本只接收 `data`，不注入 form / item / request 等任何表单或请求上下文；
 * - 脚本内引用 window / document / fetch / XMLHttpRequest / localStorage 等宿主能力时，
 *   会命中同名参数绑定（undefined），无法直接触达；
 * - 脚本属于管理员在元素配置中填写的可信脚本，异常时保留原始数据，不阻断表单。
 */

// 与 JS 事件共用同一套敏感全局遮蔽策略；这里额外遮蔽表单/请求上下文与常见副作用入口。
const AFTER_LOAD_BLOCKED_GLOBALS = [
  'window',
  'document',
  'globalThis',
  'self',
  'top',
  'parent',
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'EventSource',
  'localStorage',
  'sessionStorage',
  'indexedDB',
  'Function',
  'setTimeout',
  'setInterval',
  'requestAnimationFrame',
  'process',
  'require',
  'module',
  'navigator',
  'location',
  'history',
  // 数据源加载后事件不提供任何表单/请求/联动上下文
  'form',
  'item',
  'request',
  'TransNumberToUpper',
  'CalculateExpression',
  // 常见副作用入口
  'alert',
  'confirm',
  'prompt',
  'open',
  'print',
  'Worker',
  'SharedWorker',
  'crypto',
  'performance',
  'postMessage',
  'opener',
  'frames',
  'screen',
]

const cloneData = (data) => {
  if (data == null || typeof data !== 'object') return data
  try {
    if (typeof structuredClone === 'function') return structuredClone(data)
  } catch (e) {
    // 含函数等不可克隆值时回退 JSON 序列化
  }
  try {
    return JSON.parse(JSON.stringify(data))
  } catch (e) {
    return data
  }
}

/**
 * 执行数据源加载后事件。
 *
 * 脚本以函数体形式执行，例如：
 *   const seen = new Set()
 *   return data.filter((item) => {
 *     const key = item.deptname
 *     if (seen.has(key)) return false
 *     seen.add(key)
 *     return true
 *   })
 *
 * - 返回值不为 undefined：作为处理后的数据；
 * - 返回 undefined：视为脚本直接修改了 data，沿用修改后的对象；
 * - 未配置、执行异常：返回原始数据。
 *
 * @param {object} ds data_source 配置，读取 after_load
 * @param {*} data 接口原始响应数据
 * @returns {*} 处理后的数据
 */
export const applyDataSourceAfterLoad = (ds, data) => {
  const script = typeof ds?.after_load === 'string' ? ds.after_load : ''
  if (!script.trim()) return data

  const input = cloneData(data)
  try {
    const params = ['data', ...AFTER_LOAD_BLOCKED_GLOBALS]
    const undefArgs = AFTER_LOAD_BLOCKED_GLOBALS.map(() => undefined)
    const fn = new Function(...params, `"use strict";\n${script}`)
    const result = fn(input, ...undefArgs)
    return result === undefined ? input : result
  } catch (e) {
    console.warn('[data_source.after_load] 脚本执行失败，已保留原始数据:', e)
    return data
  }
}
