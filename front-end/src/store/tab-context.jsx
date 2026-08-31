import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from './auth-context'

const HOME_PATH = '/'
// 固定首页页签：禁止关闭
const HOME_TAB = { path: HOME_PATH, title: '工作台', icon: 'home', closable: false }

// localStorage 缓存键：后端菜单树扁平化后的路由元信息
const META_CACHE_KEY = 'rbac_route_meta_cache'

// 非菜单路由（前端静态页面，不在后端菜单树中）的种子元信息，
// 会与后端菜单数据合并后写入 localStorage，作为缓存的一部分
const STATIC_ROUTES = {
  '/': { title: '工作台', icon: 'home' },
}

const TabContext = createContext(null)

// 扁平化后端菜单树 -> Map<path, { title, icon }>（运行时内存查询）
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

// 扁平化菜单树 + 静态路由 -> 普通对象，用于写入 localStorage
function buildCacheObject(menus) {
  const cache = { ...STATIC_ROUTES }
  const walk = (list) => {
    for (const m of list || []) {
      if (m?.path && m.type !== 3) {
        cache[m.path] = { title: m.name, icon: m.icon }
      }
      if (m?.children) {
        walk(m.children)
      }
    }
  }
  walk(menus)
  return cache
}

// 从 localStorage 读取路由元信息缓存
function readMetaCache() {
  try {
    const raw = localStorage.getItem(META_CACHE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch (e) {
    return {}
  }
}

export function TabProvider({ children }) {
  const location = useLocation()
  const navigate = useNavigate()
  const { menus } = useAuth()
  const [tabs, setTabs] = useState([HOME_TAB])

  // 保持最新 tabs 供回调读取，避免闭包拿到过期值
  const tabsRef = useRef(tabs)
  tabsRef.current = tabs

  // 菜单树（后端为准）-> 路由元信息映射（内存，当前会话最新）
  const metaMap = useMemo(() => buildMetaMap(menus), [menus])

  // 菜单数据变化时，将路由元信息持久化到 localStorage
  useEffect(() => {
    try {
      localStorage.setItem(META_CACHE_KEY, JSON.stringify(buildCacheObject(menus)))
    } catch (e) {
      // localStorage 不可用时静默忽略
    }
  }, [menus])

  // 解析路由对应的标题与图标：内存菜单树 > localStorage 缓存 > 路径本身
  const resolveMeta = useCallback(
    (path) => {
      if (path === HOME_PATH) return STATIC_ROUTES[HOME_PATH]
      // 1. 当前会话已加载的菜单树（最权威）
      const fromMenu = metaMap.get(path)
      if (fromMenu) return fromMenu
      // 2. localStorage 持久化缓存（刷新后菜单未加载时的兜底）
      const cached = readMetaCache()
      if (cached[path]) return cached[path]
      // 3. 最终回退
      return { title: path, icon: 'apps' }
    },
    [metaMap]
  )

  // 自动捕获：路由变化时，新页面自动加入页签（已存在则跳过）
  useEffect(() => {
    const path = location.pathname
    setTabs((prev) => {
      if (prev.some((t) => t.path === path)) return prev
      const meta = resolveMeta(path)
      return [...prev, { path, title: meta.title, icon: meta.icon, closable: true }]
    })
  }, [location.pathname, resolveMeta])

  // 菜单树加载完成后，修正刷新时因缓存未就绪而回退为路径的页签标题
  useEffect(() => {
    setTabs((prev) => {
      let changed = false
      const next = prev.map((t) => {
        // 仅修正标题等于路径（最终回退态）的页签，且跳过固定首页
        if (t.path === HOME_PATH || t.title !== t.path) return t
        const meta = metaMap.get(t.path)
        if (meta) {
          changed = true
          return { ...t, title: meta.title, icon: meta.icon }
        }
        return t
      })
      return changed ? next : prev
    })
  }, [metaMap])

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
