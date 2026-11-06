/**
 * 详情内容打印与 PDF 导出（纯前端，无后端依赖）：
 * - 打印：隐藏 iframe 承载内容克隆 + 复制主文档样式表，iframe.print() 出纸，
 *   不改动当前页面布局、无 visibility 方案的空白页问题；
 * - 导出 PDF：html2canvas-pro 快照内容区（支持 Tailwind v4 的 oklch/oklab 色彩，
 *   原版 html2canvas 遇 oklch 会抛错），jsPDF 按 A4 纵向等宽分页拼接；
 * - 两种模式均剔除带 data-print-hide 标记的节点（折叠开关、审批操作区等交互件）；
 * - 均先解除抽屉内滚动/高度约束（左表单列/右时间轴列各自 overflow-y-auto），
 *   并强制两列纵排，保证 A4 竖版下内容完整、不被截断。
 */
import html2canvas from 'html2canvas-pro'
import { jsPDF } from 'jspdf'

const HIDE_SELECTOR = '[data-print-hide]'

const escapeHtml = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  )

/**
 * 临时展开内容树的滚动与高度约束（向上滚动祖先链 + 内容根与直接子列），
 * 返回恢复函数。PDF 快照前调用，让 html2canvas 能拍到完整内容而非视口高度。
 */
function expandLayout(root) {
  const restore = []
  const openNode = (node, css) => {
    const old = {}
    Object.keys(css).forEach((k) => {
      old[k] = node.style[k]
      node.style[k] = css[k]
    })
    restore.push({ node, old })
  }

  // 祖先链：抽屉 body/content 等滚动容器与高度约束
  let node = root.parentElement
  while (node && node !== document.body) {
    const cs = window.getComputedStyle(node)
    if (/(auto|scroll|hidden|clip)/.test(cs.overflowY) || cs.maxHeight !== 'none') {
      openNode(node, { overflow: 'visible', maxHeight: 'none', height: 'auto' })
    }
    node = node.parentElement
  }

  // 内容根：两列横排改单列纵排（A4 竖版宽度只容得下一列）
  openNode(root, { display: 'block', height: 'auto', maxHeight: 'none', overflow: 'visible' })
  // 直接子列（表单列/时间轴列）：解除独立滚动与固定宽度；
  // 两列纵排后列间 border-l 分隔线（如右侧时间轴列）失去意义且影响观感，输出一律去除
  Array.from(root.children).forEach((child) => {
    openNode(child, {
      height: 'auto',
      maxHeight: 'none',
      overflow: 'visible',
      width: 'auto',
      maxWidth: 'none',
      borderLeft: 'none',
    })
  })
  // 交互件：快照期间隐藏
  root.querySelectorAll(HIDE_SELECTOR).forEach((n) => openNode(n, { display: 'none' }))
  // 子表补右/下外框（与打印链路同口径：只画 .arco-table 根节点一层，
  // 容器/表体边缘与其重合，双层绘制会叠成 2px 双线；快照结束由 restore 恢复）
  root.querySelectorAll('.arco-table').forEach((t) => {
    openNode(t, {
      borderRight: '1px solid var(--color-neutral-3)',
      borderBottom: '1px solid var(--color-neutral-3)',
    })
  })

  return () => {
    restore.forEach(({ node: n, old }) => {
      Object.keys(old).forEach((k) => {
        if (old[k]) n.style[k] = old[k]
        else n.style.removeProperty(k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`))
      })
    })
  }
}

/**
 * 打印内容元素：隐藏 iframe 克隆 + 主文档样式复制。
 * @param {HTMLElement} el        打印目标（内容容器）
 * @param {string} docTitle       打印文档标题（浏览器打印预览页签名）
 */
export function printElement(el, docTitle = '打印') {
  if (!el) return
  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.style.cssText =
    'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden'
  document.body.appendChild(iframe)

  const win = iframe.contentWindow
  const doc = win.document
  doc.open()
  doc.write(
    `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(docTitle)}</title></head><body></body></html>`,
  )
  doc.close()

  // 复制主文档全部样式（dev 内联 style / 构建产物 link，同源可二次加载）
  document.querySelectorAll('style, link[rel="stylesheet"]').forEach((n) => {
    doc.head.appendChild(doc.importNode(n, true))
  })
  // 打印覆盖样式：解除滚动/高度约束、两列纵排、去除列间分隔边框、剔除交互件、页边距
  const override = doc.createElement('style')
  override.textContent = `
    @page { margin: 10mm; }
    html, body { background: #fff; margin: 0; }
    [data-print-root], [data-print-root] * { max-height: none !important; height: auto !important; overflow: visible !important; }
    [data-print-root] { display: block !important; width: auto !important; }
    [data-print-root] > * { width: auto !important; max-width: none !important; border-left: none !important; }
    [data-print-hide] { display: none !important; }
    /* 打印页可印宽约 190mm，抽屉内 min-w-*（如左列 min-w-188=752px）会超宽把表格右边框裁到版面外 */
    [data-print-root] * { min-width: 0 !important; }
    /* 子表补下外框（Arco 默认表体仅单元格底部线，容器/根节点不带下边框） */
    [data-print-root] .arco-table {
      border-bottom: 1px solid var(--color-neutral-3) !important;
    }
  `
  doc.head.appendChild(override)

  const clone = el.cloneNode(true)
  clone.setAttribute('data-print-root', '1')
  clone.querySelectorAll(HIDE_SELECTOR).forEach((n) => n.remove())
  doc.body.appendChild(clone)

  let printed = false
  const run = () => {
    if (printed) return
    printed = true
    win.focus()
    win.print()
    // print() 返回后留足对话框交互时间再回收 iframe（期间保留样式重开也有效）
    setTimeout(() => iframe.remove(), 2000)
  }
  // 双通道触发：onload 覆盖异步加载；定时器兜底 doc.close() 后 load 已同步完成的场景
  iframe.onload = () => setTimeout(run, 350)
  setTimeout(run, 1200)
}

/**
 * 导出内容元素为 A4 纵向 PDF（图片快照分页，所见即所得）。
 * @param {HTMLElement} el       导出目标（内容容器）
 * @param {string} fileName      文件名（不含 .pdf 后缀自动补全）
 */
export async function exportElementPdf(el, fileName = '导出.pdf') {
  if (!el) return
  const restore = expandLayout(el)
  try {
    if (document.fonts?.ready) {
      try {
        await document.fonts.ready
      } catch {
        /* 字体就绪等待失败不阻断快照 */
      }
    }
    const canvas = await html2canvas(el, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
    })
    const imgData = canvas.toDataURL('image/jpeg', 0.92)
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const pageH = 297
    const imgW = 210
    const imgH = (canvas.height * imgW) / canvas.width
    pdf.addImage(imgData, 'JPEG', 0, 0, imgW, imgH)
    let offset = pageH
    while (offset < imgH) {
      pdf.addPage()
      pdf.addImage(imgData, 'JPEG', 0, -offset, imgW, imgH)
      offset += pageH
    }
    pdf.save(fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`)
  } finally {
    restore()
  }
}
