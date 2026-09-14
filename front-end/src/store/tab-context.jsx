import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { findChildBySegments, findMenuChain } from 'src/hooks/useMenuMeta'
import { useAuth } from 'src/store/auth-context'

const HOME_PATH = '/'
// 固定首页页签：禁止关闭，元信息以此为唯一数据源
const HOME_TAB = { path: HOME_PATH, title: '工作台', breadcrumbs: ['工作台'], closable: false }

// 不生成页签的系统路径（如无权限错误页，仅作临时提示，无需页签切换）
const NO_TAB_PATHS = new Set(['/403'])

const TabContext = createContext(null)

// 扁平化后端菜单树 -> Map<path, { title }>
function buildMetaMap(menus) {
  const map = new Map()
  const walk = (list) => {
    for (const m of list || []) {
      if (m?.path && m.type !== 3) {
        map.set(m.path, { title: m.name})
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

  // 解析路由对应的页签元信息：标题 + 面包屑层级（title 取层级末项）。
  // 数据源统一为后端菜单树：
  // - 精确匹配：breadcrumbs = 菜单链（非 '/' 节点）名称数组，如 /system/user → ['系统管理','用户管理']
  // - 动态子路由（前缀匹配）：父级链名称 + 段级匹配的子项名称，如 /application/10/tables → ['应用配置','表管理']
  // - 完全未命中：回退为路径段
  const resolveTabMeta = useCallback(
    (path) => {
      if (path === HOME_PATH) return { title: HOME_TAB.title, breadcrumbs: [HOME_TAB.title] }
      const chain = findMenuChain(menus, path) || []
      const parentMenu = chain[chain.length - 1]
      let crumbs
      if (parentMenu?.path === path) {
        // 精确匹配：目录/页面链名称
        crumbs = chain.filter((m) => m.path !== '/').map((m) => m.name)
      } else if (parentMenu) {
        // 前缀匹配（动态子路由）：父级链名称 + 段级匹配子项名称
        crumbs = chain.filter((m) => m.path !== '/').map((m) => m.name)
        const sub =
          findChildBySegments(parentMenu.children, parentMenu.path, path) ||
          findChildBySegments(menus, '/', path)
        // 全树回退可能仅命中父级自身（与父级同 path），此时视为未命中
        if (sub && sub.path !== parentMenu.path) crumbs.push(sub.name)
      } else {
        crumbs = [path]
      }
      return { title: crumbs[crumbs.length - 1] || path, breadcrumbs: crumbs.length ? crumbs : [path] }
    },
    [menus],
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
      const meta = resolveTabMeta(path)
      return [...prev, { path, title: meta.title, breadcrumbs: meta.breadcrumbs, closable: true }]
    })
  }, [location.pathname, resolveTabMeta, isPathAccessible])

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
        // 手动添加的页签（如动态子页面）不参与权限清理
        if (t.manual) {
          next.push(t)
          continue
        }
        // 无权限路径的页签：清理
        if (!isPathAccessible(t.path)) {
          changed = true
          continue
        }
        // 标题回退为路径的页签：菜单就绪后从菜单树修正标题与面包屑
        if (t.title === t.path) {
          const meta = resolveTabMeta(t.path)
          if (meta.title !== t.path) {
            changed = true
            next.push({ ...t, title: meta.title, breadcrumbs: meta.breadcrumbs })
            continue
          }
        }
        next.push(t)
      }
      return changed ? next : prev
    })
  }, [metaMap, isPathAccessible, resolveTabMeta])

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

  // 关闭指定页签左侧的所有可关闭页签（固定首页始终保留）；
  // 若当前激活页签被关闭，跳转到目标页签
  const closeLeft = useCallback(
    (path) => {
      const prev = tabsRef.current
      const index = prev.findIndex((t) => t.path === path)
      if (index === -1) return
      const next = prev.filter((t, i) => t.path === HOME_PATH || !t.closable || i >= index)
      setTabs(next)
      if (!next.some((t) => t.path === location.pathname)) navigate(path, { replace: true })
    },
    [location.pathname, navigate],
  )

  // 关闭指定页签右侧的所有可关闭页签（固定首页始终保留）；
  // 若当前激活页签被关闭，跳转到目标页签
  const closeRight = useCallback(
    (path) => {
      const prev = tabsRef.current
      const index = prev.findIndex((t) => t.path === path)
      if (index === -1) return
      const next = prev.filter((t, i) => t.path === HOME_PATH || !t.closable || i <= index)
      setTabs(next)
      if (!next.some((t) => t.path === location.pathname)) navigate(path, { replace: true })
    },
    [location.pathname, navigate],
  )

  // 手动添加页签（用于动态路由等不在菜单树中的页面，已存在则跳过）；
  // 未显式传入 title/breadcrumbs 时，由 resolveTabMeta 按菜单树自动解析
  const addTab = useCallback((tab) => {
    setTabs((prev) => {
      if (prev.some((t) => t.path === tab.path)) return prev
      const meta = resolveTabMeta(tab.path)
      return [
        ...prev,
        { closable: true, manual: true, title: meta.title, breadcrumbs: meta.breadcrumbs, ...tab },
      ]
    })
  }, [resolveTabMeta])

  // 更新指定页签的属性（标题、图标等）
  const updateTab = useCallback((path, updates) => {
    setTabs((prev) => prev.map((t) => (t.path === path ? { ...t, ...updates } : t)))
  }, [])

  // Context value 稳定引用：仅在各状态/回调实际变化时更新，避免无关重渲染波及所有消费者
  const contextValue = useMemo(
    () => ({
      tabs,
      activeTab: location.pathname,
      addTab,
      updateTab,
      closeTab,
      closeOthers,
      closeAll,
      closeLeft,
      closeRight,
    }),
    [
      tabs,
      location.pathname,
      addTab,
      updateTab,
      closeTab,
      closeOthers,
      closeAll,
      closeLeft,
      closeRight,
    ],
  )

  return (
    <TabContext.Provider value={contextValue}>
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
