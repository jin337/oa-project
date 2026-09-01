import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from './auth-context'

const HOME_PATH = '/'
// 固定首页页签：禁止关闭，元信息以此为唯一数据源
const HOME_TAB = { path: HOME_PATH, title: '工作台', icon: 'home', closable: false }

// 不生成页签的系统路径（如无权限错误页，仅作临时提示，无需页签切换）
const NO_TAB_PATHS = new Set(['/403'])

const TabContext = createContext(null)

// 扁平化后端菜单树 -> Map<path, { title, icon }>
function buildMetaMap(menus) {
  const map = new Map()
  const walk = (list) => {
    for (const m of list || []) {
      if (m?.path && m.type !== 3) {
        map.set(m.path, { title: m.name, icon: m.icon })
      }
      if (m?.children) {
        walk(m.children)
      }
    }
  }
  walk(menus)
  return map
}

export function TabProvider({ children }) {
  const location = useLocation()
  const navigate = useNavigate()
  // 唯一数据源：登录后从后端获取的菜单树
  const { menus } = useAuth()
  const [tabs, setTabs] = useState([HOME_TAB])

  // 保持最新 tabs 供回调读取，避免闭包拿到过期值
  const tabsRef = useRef(tabs)
  tabsRef.current = tabs

  // 菜单树 -> 路由元信息映射
  const metaMap = useMemo(() => buildMetaMap(menus), [menus])

  // 解析路由对应的标题与图标：固定首页 > 菜单树 > 路径回退
  const resolveMeta = useCallback(
    (path) => {
      if (path === HOME_PATH) return { title: HOME_TAB.title, icon: HOME_TAB.icon }
      return metaMap.get(path) || { title: path, icon: 'apps' }
    },
    [metaMap]
  )

  // 判断路径是否可访问：首页 / 用户菜单树中存在的路径
  // 用于过滤被 RequirePermission 拦截的无权限路由，避免生成无效页签
  const isPathAccessible = useCallback(
    (path) => path === HOME_PATH || metaMap.has(path),
    [metaMap]
  )

  // 自动捕获：路由变化时，可访问的新页面自动加入页签（已存在则跳过）
  useEffect(() => {
    const path = location.pathname
    // 无权限路径不生成页签（RequirePermission 会将其重定向到 /403）
    if (!isPathAccessible(path)) return
    // 错误提示页（如 /403）不生成页签
    if (NO_TAB_PATHS.has(path)) return
    setTabs((prev) => {
      if (prev.some((t) => t.path === path)) return prev
      const meta = resolveMeta(path)
      return [...prev, { path, title: meta.title, icon: meta.icon, closable: true }]
    })
  }, [location.pathname, resolveMeta, isPathAccessible])

  // 菜单树变化时统一处理：
  // 1) 清理无权限路径的无效页签（防止 RequirePermission 重定向前被误添加）
  // 2) 修正刷新时因菜单未就绪而回退为路径的页签标题
  useEffect(() => {
    setTabs((prev) => {
      let changed = false
      const next = []
      for (const t of prev) {
        // 固定首页始终保留
        if (t.path === HOME_PATH) {
          next.push(t)
          continue
        }
        // 无权限路径的页签：清理
        if (!isPathAccessible(t.path)) {
          changed = true
          continue
        }
        // 标题回退为路径的页签：尝试从菜单树修正
        if (t.title === t.path) {
          const meta = metaMap.get(t.path)
          if (meta) {
            changed = true
            next.push({ ...t, title: meta.title, icon: meta.icon })
            continue
          }
        }
        next.push(t)
      }
      return changed ? next : prev
    })
  }, [metaMap, isPathAccessible])

  // 关闭单个页签；若关闭的是当前激活页签，跳转到相邻页签或首页
  const closeTab = useCallback(
    (path) => {
      const prev = tabsRef.current
      const index = prev.findIndex((t) => t.path === path)
      if (index === -1 || !prev[index].closable) return
      const next = prev.filter((t) => t.path !== path)
      setTabs(next)
      if (path === location.pathname) {
        const fallback = next[Math.min(index, next.length - 1)]
        navigate(fallback ? fallback.path : HOME_PATH, { replace: true })
      }
    },
    [location.pathname, navigate]
  )

  // 关闭其他页签：保留固定首页与当前激活页签
  const closeOthers = useCallback(() => {
    const active = location.pathname
    setTabs((prev) => prev.filter((t) => t.path === HOME_PATH || t.path === active))
  }, [location.pathname])

  // 关闭所有页签：仅保留固定首页并跳回首页
  const closeAll = useCallback(() => {
    setTabs([HOME_TAB])
    navigate(HOME_PATH, { replace: true })
  }, [navigate])

  return (
    <TabContext.Provider
      value={{ tabs, activeTab: location.pathname, closeTab, closeOthers, closeAll }}
    >
      {children}
    </TabContext.Provider>
  )
}

export function useTabs() {
  const ctx = useContext(TabContext)
  if (!ctx) {
    throw new Error('useTabs 必须在 AuthProvider 内使用')
  }
  return ctx
}
