import { useMemo } from 'react'
import { useAuth } from '../store/auth-context'

/**
 * 菜单树路径解析公共模块：
 * 统一"路径 → 菜单层级链 / 单点元信息"的解析逻辑，供面包屑（消费 chain）、
 * 页签（消费 title）、菜单高亮（消费 chain 末节点）等场景复用。
 * 所有匹配一律基于菜单配置的原始 path。
 */

// 在菜单树中查找当前路径对应的层级链（目录 → 页面），用于面包屑和菜单高亮
// 支持动态子路由：精确匹配优先，未命中时回退到最长前缀匹配（如 /application/1/tables → /application）
export function findMenuChain(menus, pathname) {
  let prefixMatch = null
  const walk = (list, chain) => {
    for (const m of list || []) {
      if (m.status !== 1 || m.type === 3) continue
      const nextChain = [...chain, m]
      // 实际导航路径：菜单配置的原始 path
      const navPath = m.path
      if (navPath === pathname) return nextChain
      // 记录最长前缀匹配，供动态子路由回退
      if (navPath && pathname.startsWith(navPath + '/')) {
        if (!prefixMatch || navPath.length > (prefixMatch[prefixMatch.length - 1].path || '').length) {
          prefixMatch = nextChain
        }
      }
      if (m.children?.length) {
        const found = walk(m.children, nextChain)
        if (found) return found
      }
    }
    return null
  }
  return walk(menus, []) || prefixMatch
}

// 按路径段动态匹配子路由菜单项：
// 将候选菜单 path 与 pathname 做段级有序匹配（允许 pathname 中穿插动态参数段，如 :id），
// 且候选路径需深于父级路径（排除父级自身）；命中返回菜单项，未命中返回 null。
// 用于动态子路由（如 /application/1/tables）从菜单树 children 中提取子项真实名称。
export function findChildBySegments(candidates, parentPath, pathname) {
  const parentSegs = (parentPath || '').split('/').filter(Boolean)
  const pathSegs = pathname.split('/').filter(Boolean)
  for (const m of candidates || []) {
    if (m.status !== 1 || m.type === 3) continue
    const childSegs = (m.path || '').split('/').filter(Boolean)
    // 候选路径需比父级更深，且段数不超过当前 URL，才可能是更具体的子路由
    if (childSegs.length <= parentSegs.length || childSegs.length > pathSegs.length) {
      const found = findChildBySegments(m.children, m.path, pathname)
      if (found) return found
      continue
    }
    // 有序子序列匹配：childSegs 需按顺序出现在 pathSegs 中（动态参数段可被跳过）
    let i = 0
    for (const seg of pathSegs) {
      if (i < childSegs.length && (seg === childSegs[i] || childSegs[i]?.startsWith(':'))) i++
    }
    if (i === childSegs.length) return m
    const found = findChildBySegments(m.children, m.path, pathname)
    if (found) return found
  }
  return null
}

/**
 * 解析路径对应的单点菜单元信息：
 * 返回 { chain, menu, title, icon }——chain 供面包屑层级渲染，
 * menu 为链末节点（当前页面菜单项），title/icon 为其名称/图标（供页签等单点消费）。
 */
export function resolveMenuMeta(menus, pathname) {
  const chain = findMenuChain(menus, pathname)
  const menu = chain?.[chain.length - 1] || null
  return {
    chain,
    menu,
    title: menu?.name || null,
    icon: menu?.icon || null,
  }
}

/**
 * 组件内便捷 Hook：基于当前登录菜单树，解析指定路径的菜单元信息。
 * @param {string} pathname 当前路由路径（如 location.pathname）
 */
export function useMenuMeta(pathname) {
  const { menus } = useAuth()
  return useMemo(() => resolveMenuMeta(menus, pathname), [menus, pathname])
}
