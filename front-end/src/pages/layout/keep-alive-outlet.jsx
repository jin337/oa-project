import { useRef } from 'react'
import {
  UNSAFE_LocationContext as LocationContext,
  useLocation,
  useNavigationType,
  useOutlet,
} from 'react-router-dom'
import { useTabs } from 'src/store/tab-context'
import { isTabCacheExcluded } from 'src/config/tab-cache'

/**
 * 同时缓存的页面实例上限（含当前激活页）。
 * 每个缓存实例是一棵完整页面组件树（表格数据、表单、子表行），约数 MB 量级；
 * 不设上限时「页签开多少常驻多少」，重度使用会让隐藏页面持续吃内存。
 * 超限后最久未激活的页面被卸载（页签仍保留，点回去时重新加载，只是不再保留状态）。
 */
const MAX_KEEP_ALIVE = 10

/**
 * 更新快照表（纯函数，Map 迭代顺序即「激活先后」，队首=最久未激活）：
 * 1) 激活项移到队尾（delete + set 保证顺序；重复调用幂等）；
 * 2) 白名单路径（isExcluded 为真）不保留快照，且已有的旧快照一并清除；
 * 3) 删除已不存活的页签（关闭页签 / 被 tab-context 清理的无效页签）；
 * 4) 超出 max 时从队首逐个淘汰，直到满足上限——刚移到队尾的激活项必然保留。
 *
 * @param {Map}   prev       上一次渲染的快照表
 * @param {string} active    本次激活路径
 * @param {object} entry     激活页快照 { element, ctx }
 * @param {Set}   alive      存活路径集合（含 active）
 * @param {number} max       缓存上限
 * @param {(path:string)=>boolean} isExcluded 是否命中「不缓存」白名单
 * @returns {Map} 新快照表（不修改 prev）
 */
export function updateSnapshots(prev, active, entry, alive, max, isExcluded = () => false) {
  const next = new Map(prev)
  next.delete(active)
  // 白名单页面不留快照：切走时无可渲染快照 → 容器卸载，切回重新挂载
  if (!isExcluded(active)) next.set(active, entry)
  for (const path of [...next.keys()]) {
    if (!alive.has(path) || isExcluded(path)) next.delete(path)
  }
  while (next.size > max) {
    const oldest = next.keys().next().value
    next.delete(oldest)
  }
  return next
}

/**
 * 页签 keep-alive 出口：为每个存活页签挂载独立容器（div，key=path，绝对定位叠放），
 * 激活页签可见，其余 visibility:hidden——组件实例不卸载，切换页签保留页面状态
 * （表格数据、表单填写、筛选/分页、滚动位置），切回时不重复请求接口。
 *
 * 冻结原理：
 * - 结构恒定：容器始终是 div > LocationContext.Provider > outlet 元素，
 *   激活/隐藏切换只变 Provider value 与 children 引用，不改变元素类型层级
 *   （类型变化会导致卸载重挂，破坏缓存）。
 * - 页面切走时，其最后激活渲染的 outlet 元素与 location context 值存入快照；
 *   隐藏期间渲染快照——元素引用不变 + Provider value 引用不变 →
 *   React bail-out，整棵子树冻结不重渲染。
 *   快照同时钉住该页激活时的 location：即便隐藏子树被全局 context 变化
 *   强制重渲染，useLocation 仍读到自己的地址，不漂移到当前页。
 *   （route matches/params 固化在元素 props 中，useParams 天然不漂移。）
 * - 切回时容器 key 不变 → 同组件实例恢复渲染，children 换为最新 outlet 元素
 *   （同类型 → 复用实例，非重挂），并更新快照供下次隐藏。
 *
 * 注意：LocationContext 的 value 形状是 { location, navigationType }（库源码
 * useContext(LocationContext).location 即依赖此包装），直接传 location 对象会
 * 让页面 useLocation() 得到 undefined 而崩溃白屏。
 *
 * 缓存生命周期与页签一致：关闭页签 → 容器移出列表 → 卸载释放内存；
 * 另受 MAX_KEEP_ALIVE 上限约束（LRU 淘汰最久未激活页，见 updateSnapshots）——
 * 被淘汰页的容器因取不到快照而不渲染，等价于卸载，页签本身不受影响。
 * 不缓存白名单（src/config/tab-cache.js）：命中路径当次激活不写快照，
 * 切走时无快照可渲染 → 容器卸载，切回重新挂载并重新请求数据；页签本身照常保留。
 * visibility:hidden + absolute 叠放（不用 display:none），避免隐藏时滚动位置被重置。
 * 无页签路径（/403、被清理的无效页签）不缓存：仅渲染当前容器，切走即卸载（保持原行为）。
 * 从未激活过的历史页签（刷新恢复）无快照 → 暂不挂载，切过去时自动补快照再缓存。
 */
export default function KeepAliveOutlet() {
  const location = useLocation()
  const navigationType = useNavigationType()
  const outlet = useOutlet()
  const { tabs } = useTabs()
  // path → { element, ctx }：元素引用与 context 值引用稳定，是"隐藏即冻结"的关键；
  // Map 插入顺序同时承载 LRU 激活先后
  const snapshots = useRef(new Map())

  // 渲染范围 = 存活页签 ∪ 当前路径；alive 同时用于快照清理（页签关闭/无效页签）
  const alive = new Set(tabs.map((t) => t.path))
  alive.add(location.pathname)

  // 更新快照表：激活项移到队尾 + 清理失效页签 + LRU 淘汰超上限的最久未激活项
  snapshots.current = updateSnapshots(
    snapshots.current,
    location.pathname,
    { element: outlet, ctx: { location, navigationType } },
    alive,
    MAX_KEEP_ALIVE,
    isTabCacheExcluded,
  )

  const renderPaths = tabs.map((t) => t.path)
  if (!renderPaths.includes(location.pathname)) renderPaths.push(location.pathname)

  return (
    <div className="relative h-full w-full">
      {renderPaths.map((path) => {
        const active = path === location.pathname
        // 白名单路径不查快照：非激活时取不到快照 → 容器不挂载，等价于卸载；
        // 激活时照常渲染最新 outlet，只是切走时不留快照
        const snap = isTabCacheExcluded(path) ? null : snapshots.current.get(path)
        // 未激活过的历史页签、被 LRU 淘汰的页签、不缓存白名单页签：不挂载
        if (!active && !snap) return null
        const node = active ? outlet : snap.element
        const ctx = active ? { location, navigationType } : snap.ctx
        return (
          <div
            key={path}
            className="absolute inset-0 overflow-auto px-4"
            style={active ? undefined : { visibility: 'hidden', pointerEvents: 'none' }}
            aria-hidden={!active}
          >
            <LocationContext.Provider value={ctx}>{node}</LocationContext.Provider>
          </div>
        )
      })}
    </div>
  )
}
