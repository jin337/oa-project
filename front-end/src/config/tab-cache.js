// 页签缓存开关：由「菜单管理」里每个页面菜单的「是否缓存」决定
//
// 语义：命中的页面照常生成页签、照常可切换；区别只在状态保留——
// 不缓存的页面切走即卸载（状态、滚动位置、已加载数据全部释放），
// 切回时重新挂载并重新请求接口，适合「每次进入都要拿最新数据」的页面。
//
// 判定规则：
// 1) 菜单已收录当前路径 → 按菜单的 cache 字段：1 缓存，0 不缓存；
// 2) 菜单未收录（工作台首页、通知中心等固定路由不在菜单中）→ 默认不缓存。
//
// 菜单 path 支持动态段（如 /application/:id/design），按 React Router 规则与实际路径匹配。
import { matchPath } from 'react-router-dom'

/**
 * 在菜单树中查找与 pathname 匹配的页面菜单项（含隐藏菜单）。
 * 只认「页面菜单」（type=2）：目录（type=1）与按钮（type=3）不是页面，不参与缓存判定。
 * @param {Array} menus 当前用户菜单树（auth-context 提供）
 * @param {string} pathname 实际路由路径
 * @returns {object|null}
 */
export function findPageMenu(menus, pathname) {
  let found = null
  const walk = (list) => {
    for (const m of list || []) {
      if (found) return
      if (m && m.type === 2 && m.path && matchPath(m.path, pathname)) {
        found = m
        return
      }
      if (m?.children?.length) walk(m.children)
    }
  }
  walk(menus)
  return found
}

/**
 * 该路径是否不缓存页签（true = 不缓存）。
 * @param {Array} menus 当前用户菜单树
 * @param {string} pathname 实际路由路径
 * @returns {boolean}
 */
export function isTabCacheExcluded(menus, pathname) {
  const menu = findPageMenu(menus, pathname)
  // 未收录：工作台等不在菜单里的固定路由，默认不缓存
  if (!menu) return true
  // 只有菜单显式关掉「是否缓存」才不缓存；历史数据缺字段按缓存处理
  return Number(menu.cache) === 0
}
