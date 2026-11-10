// 页签缓存白名单：命中的路径不参与 keep-alive 缓存
//
// 语义：页面照常生成页签、照常可切换；区别只在状态保留——
// 白名单页面切走即卸载（状态、滚动位置、已加载数据全部释放），
// 切回时重新挂载并重新请求接口，适合「每次进入都要拿最新数据」的页面。
//
// 维护方式：改下面的路径数组即可。支持 React Router 路径模式（动态段），
// 例如 '/application/:id/design' 会命中 '/application/10/design'；
// 普通字符串按完整路径精确匹配（'/' 只命中首页，不含其子路径）。
import { matchPath } from 'react-router-dom'

export const NO_CACHE_TAB_PATHS = [
  // 工作台：切回时重新拉取待办/通知等概览数据
  '/',
  // 申请：进入时按最新流程配置渲染可发起项
  '/approval/apply',
]

/**
 * 该路径是否命中页签缓存白名单（命中 = 不缓存）。
 * @param {string} pathname 当前路由路径（location.pathname）
 * @returns {boolean}
 */
export function isTabCacheExcluded(pathname) {
  return NO_CACHE_TAB_PATHS.some((pattern) => matchPath(pattern, pathname) != null)
}
