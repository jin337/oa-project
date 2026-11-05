import { useRef } from 'react'
import {
  UNSAFE_LocationContext as LocationContext,
  useLocation,
  useNavigationType,
  useOutlet,
} from 'react-router-dom'
import { useTabs } from 'src/store/tab-context'

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
 * visibility:hidden + absolute 叠放（不用 display:none），避免隐藏时滚动位置被重置。
 * 无页签路径（/403、被清理的无效页签）不缓存：仅渲染当前容器，切走即卸载（保持原行为）。
 * 从未激活过的历史页签（刷新恢复）无快照 → 暂不挂载，切过去时自动补快照再缓存。
 */
export default function KeepAliveOutlet() {
  const location = useLocation()
  const navigationType = useNavigationType()
  const outlet = useOutlet()
  const { tabs } = useTabs()
  // path → { element, ctx }：元素引用与 context 值引用稳定，是"隐藏即冻结"的关键
  const snapshots = useRef(new Map())

  // 记录当前激活页快照（渲染期幂等写入；location 在同一次导航内引用稳定）
  snapshots.current.set(location.pathname, {
    element: outlet,
    ctx: { location, navigationType },
  })

  // 渲染范围 = 存活页签 ∪ 当前路径；清理范围外快照（页签关闭 / 无效页签被 tab-context 移除）
  const alive = new Set(tabs.map((t) => t.path))
  alive.add(location.pathname)
  snapshots.current.forEach((_, path) => {
    if (!alive.has(path)) snapshots.current.delete(path)
  })
  const renderPaths = tabs.map((t) => t.path)
  if (!renderPaths.includes(location.pathname)) renderPaths.push(location.pathname)

  return (
    <div className="relative h-full w-full">
      {renderPaths.map((path) => {
        const active = path === location.pathname
        const snap = snapshots.current.get(path)
        // 本会话从未激活过的历史页签：先不挂载，激活时补快照再缓存
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
