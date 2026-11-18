import { useCallback, useEffect, useState } from 'react'

export const FONT_SIZE_DEFAULT = 14
export const FONT_SIZE_MIN = 11
export const FONT_SIZE_MAX = 22

const readFontSize = (storageKey) => {
  try {
    const v = parseInt(localStorage.getItem(storageKey), 10)
    if (Number.isFinite(v) && v >= FONT_SIZE_MIN && v <= FONT_SIZE_MAX) return v
  } catch {
    // 隐私模式等场景读取失败时回退默认值
  }
  return FONT_SIZE_DEFAULT
}

/**
 * 代码编辑器字号：localStorage 持久化，同类型编辑器实例之间通过自定义事件同步。
 *
 * @param {string} storageKey localStorage key（JS / SQL 各自独立）
 * @param {string} eventName 实例间同步事件名
 */
export function useEditorFontSize(storageKey, eventName) {
  const [fontSize, setFontSize] = useState(() => readFontSize(storageKey))

  useEffect(() => {
    const handler = () => setFontSize(readFontSize(storageKey))
    window.addEventListener(eventName, handler)
    return () => window.removeEventListener(eventName, handler)
  }, [storageKey, eventName])

  const changeFontSize = useCallback(
    (delta) => {
      const next = Math.max(
        FONT_SIZE_MIN,
        Math.min(FONT_SIZE_MAX, readFontSize(storageKey) + delta),
      )
      try {
        localStorage.setItem(storageKey, String(next))
      } catch {
        // 写失败不影响本会话使用
      }
      window.dispatchEvent(new CustomEvent(eventName))
    },
    [storageKey, eventName],
  )

  return { fontSize, changeFontSize, min: FONT_SIZE_MIN, max: FONT_SIZE_MAX }
}
