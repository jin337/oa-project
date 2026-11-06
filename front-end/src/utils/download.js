/**
 * 浏览器端文件下载工具（后端返回二进制流的场景，如数据导出 xlsx）：
 * - parseDownloadFilename：从 Content-Disposition 解析后端给出的文件名；
 * - saveBlob：用临时 <a download> 触发下载并回收 ObjectURL。
 * 跨域部署要求后端设置 Access-Control-Expose-Headers: Content-Disposition，
 * 否则前端读不到该响应头，只能走兜底文件名。
 */

/**
 * 解析下载响应头中的文件名。
 * 优先级：RFC 5987 的 filename*（UTF-8 百分号编码，中文无损）→ 普通 filename= → 兜底名。
 * @param {string} disposition Content-Disposition 响应头原文
 * @param {string} fallback 解析失败时的兜底文件名
 * @returns {string} 文件名
 */
export function parseDownloadFilename(disposition, fallback) {
  if (disposition) {
    const star = /filename\*=(?:UTF-8|utf-8)''([^;]+)/i.exec(disposition)
    if (star) {
      try {
        return decodeURIComponent(star[1].trim())
      } catch {
        // 非法百分号编码，继续回退普通 filename
      }
    }
    const plain = /filename="?([^";]+)"?/i.exec(disposition)
    if (plain) return plain[1].trim()
  }
  return fallback
}

/**
 * 触发浏览器保存二进制内容。
 * @param {Blob} blob 文件内容
 * @param {string} filename 保存的文件名
 */
export function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
