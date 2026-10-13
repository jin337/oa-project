/**
 * 弹窗滚动位置保护。
 *
 * 背景：Arco Modal 在开合时会改写 document.body 的 overflow（并补偿滚动条宽度），
 * 滚动位置可能在这一过程中被重置；关闭弹窗后 overflow 虽已恢复，滚动位置却不会
 * 自动回来，表现为「关闭弹窗后页面滚动条跳回顶部」。
 *
 * 页面实际的滚动容器不一定是 window：Arco Layout 的 Content、子表容器等都可能
 * 是内层 overflow:auto 的元素。因此 markScroll 会把「当前所有正处于滚动状态的
 * 元素」连同 window/document/body 一起记下来，applyScroll 再逐一还原。
 *
 * 用法：打开弹窗前调用 markScroll()，关闭弹窗时调用 applyScroll()。
 * 同一时刻只会有一个选择类弹窗打开，因此这里用模块级变量保存快照，组件无需持有 ref。
 */

let saved = null

/** 记录当前所有滚动容器的位置（打开弹窗前调用） */
export function markScroll() {
  const nodes = []
  if (typeof window !== 'undefined') {
    nodes.push({ kind: 'window', top: window.scrollY })
  }
  const doc = document.scrollingElement || document.documentElement
  if (doc && doc !== document.body) nodes.push({ el: doc, top: doc.scrollTop })
  if (document.body) nodes.push({ el: document.body, top: document.body.scrollTop })
  // 内层可滚动容器：只记当前确实滚动过的，避免整页元素都进快照
  document.querySelectorAll('*').forEach((el) => {
    if (el.scrollTop > 0 && el.scrollHeight > el.clientHeight) {
      nodes.push({ el, top: el.scrollTop })
    }
  })
  saved = nodes.length ? nodes : null
}

/**
 * 还原 markScroll 记录的位置（关闭弹窗时调用）。
 * 只在仍停留在顶部时才还原，避免覆盖用户在弹窗关闭后的主动滚动。
 * rAF 负责关闭瞬间的快速还原；两次 setTimeout 兜底 Arco 在关闭动画前后对 overflow 的再处理。
 */
export function applyScroll() {
  const nodes = saved
  if (!nodes || !nodes.length) return
  const run = () => {
    nodes.forEach((n) => {
      if (n.kind === 'window') {
        if (window.scrollY === 0 && n.top > 0) window.scrollTo(0, n.top)
        return
      }
      if (n.el && n.el.scrollTop === 0 && n.top > 0) n.el.scrollTop = n.top
    })
  }
  requestAnimationFrame(run)
  setTimeout(run, 350)
  setTimeout(run, 700)
}
