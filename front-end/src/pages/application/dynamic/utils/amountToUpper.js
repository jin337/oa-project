/**
 * 数字转人民币大写金额。
 *
 * 供 JS 事件脚本（action_type='js_event'）作为工具函数注入：
 *   TransNumberToUpper(120)      -> '壹佰贰拾元整'
 *   TransNumberToUpper(320)      -> '叁佰贰拾元整'
 *   TransNumberToUpper(100000)   -> '壹拾万元整'
 *   TransNumberToUpper(12.34)    -> '壹拾贰元叁角肆分'
 *   TransNumberToUpper(-5.6)     -> '负伍元陆角'
 *
 * 与后端 /utils/calculate 的 number_to_upper 语义一致（整数 + 角/分，无角无分补「整」），
 * 前端同步可用，便于 JS 事件脚本直接调用。
 */

const CN_NUM = ['零', '壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖']
const CN_UNIT = ['', '拾', '佰', '仟']
const CN_GROUP = ['', '万', '亿', '万亿']

/** 四位一组转换整数部分；返回不含「零」结尾的连续大写串 */
const groupToCn = (n) => {
  const s = String(n)
  const groups = []
  for (let i = s.length; i > 0; i -= 4) groups.push(s.slice(Math.max(0, i - 4), i))
  let out = ''
  for (let g = groups.length - 1; g >= 0; g -= 1) {
    const grp = groups[g]
    const grpNum = Number(grp)
    if (grpNum === 0) {
      // 整组为 0（如 1,0000,0005 的万组）：已有输出时补一个「零」
      if (out && !/零$/.test(out)) out += '零'
      continue
    }
    // 组首为 0（本组不足四位或前导 0，如 10005 的 0005 组）：跨组补「零」
    if (out && g < groups.length - 1 && grp[0] === '0' && !/零$/.test(out)) out += '零'
    let part = ''
    let pendingZero = false
    for (let k = 0; k < grp.length; k += 1) {
      const d = Number(grp[k])
      if (d === 0) {
        pendingZero = true
      } else {
        if (pendingZero && part) part += '零'
        part += CN_NUM[d] + CN_UNIT[grp.length - 1 - k]
        pendingZero = false
      }
    }
    out += part + CN_GROUP[g]
  }
  return out.replace(/零+$/, '')
}

/**
 * 数字转大写金额字符串。
 * 非法输入（null/undefined/空串/NaN/Infinity）返回 ''。
 * 0 返回「零元整」；负数加「负」前缀；整数部分四位分组，角/分位按实际输出。
 */
export function TransNumberToUpper(num) {
  const n = Number(num)
  if (num === null || num === undefined || num === '' || !Number.isFinite(n)) return ''
  const abs = Math.abs(n)
  if (abs === 0) return '零元整'
  const prefix = n < 0 ? '负' : ''
  const intPart = Math.floor(abs)
  const dec = Math.round((abs - intPart) * 100)
  const jiao = Math.floor(dec / 10)
  const fen = dec % 10
  const intStr = intPart === 0 ? '零' : groupToCn(intPart)
  let out = prefix + intStr + '元'
  if (jiao === 0 && fen === 0) {
    out += '整'
  } else {
    if (jiao > 0) out += CN_NUM[jiao] + '角'
    if (fen > 0) out += CN_NUM[fen] + '分'
  }
  return out
}

export default TransNumberToUpper
