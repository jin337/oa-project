/**
 * 通用时间格式化：ISO 时间字符串 -> "YYYY-MM-DD HH:mm:ss"
 * 空值/非法值返回 '-'，审批列表/时间线/详情等全站共用，避免各处重复 slice/replace。
 */
export function formatTime(value) {
  if (!value) return '-'
  const s = String(value)
  if (!/^\d{4}-\d{2}-\d{2}/.test(s)) return s
  return s.slice(0, 19).replace('T', ' ')
}
