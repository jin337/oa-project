/**
 * 应用版本管理共用常量与日期工具。
 *
 * ApplicationManage（应用列表中的版本弹窗）与 DesignManage（设计页版本弹窗）
 * 使用同一套版本状态和生效时间编辑规则，避免两处各维护一份。
 */

export const VERSION_STATUS = {
  0: { label: '待生效', color: 'orange' },
  1: { label: '已生效', color: 'green' },
  2: { label: '已失效', color: 'gray' },
  3: { label: '设计中', color: 'blue' },
}

/** 格式化时间：空值 '-'，非法值原样返回 */
export const formatTime = (v) => {
  if (!v) return '-'
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return v
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Arco DatePicker 的 Dayjs / Date / 字符串统一转 Date */
export const toJsDate = (v) => {
  if (!v) return null
  if (v instanceof Date) return v
  if (typeof v.toDate === 'function') return v.toDate()
  return new Date(v)
}

/** 禁止选择今天之前的日期 */
export const disablePastDate = (current) => {
  const d = toJsDate(current)
  if (!d) return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return d < today
}

/** 禁止选择当前时刻之前的时间（仅当选中日期为今天时生效） */
export const disablePastTime = (current) => {
  const empty = { disabledHours: () => [], disabledMinutes: () => [], disabledSeconds: () => [] }
  const d = toJsDate(current)
  if (!d) return empty
  const now = new Date()
  const isToday =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  if (!isToday) return empty
  return {
    disabledHours: () => Array.from({ length: now.getHours() }, (_, i) => i),
    disabledMinutes: (h) =>
      h === now.getHours() ? Array.from({ length: now.getMinutes() }, (_, i) => i) : [],
    disabledSeconds: (h, m) =>
      h === now.getHours() && m === now.getMinutes()
        ? Array.from({ length: now.getSeconds() }, (_, i) => i)
        : [],
  }
}
