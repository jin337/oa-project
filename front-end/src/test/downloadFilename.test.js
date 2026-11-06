import { describe, expect, it } from 'vitest'

import { parseDownloadFilename } from '../utils/download'

// 数据导出等下载场景的文件名解析（后端 Content-Disposition 可能带中文，
// 按 RFC 5987 的 filename* 百分号编码传递，需优先于普通 filename 解析）
describe('parseDownloadFilename（下载文件名解析）', () => {
  const CN = '差旅费报销_20261106180907.xlsx'
  const ENC = encodeURIComponent(CN)

  it('优先解析 filename*（UTF-8 百分号编码，中文无损）', () => {
    expect(
      parseDownloadFilename(`attachment; filename=export.xlsx; filename*=UTF-8''${ENC}`, 'x.xlsx'),
    ).toBe(CN)
  })

  it('charset 小写同样识别', () => {
    expect(parseDownloadFilename(`attachment; filename*=utf-8''${ENC}`, 'x.xlsx')).toBe(CN)
  })

  it('无 filename* 时回退普通 filename（含带引号写法）', () => {
    expect(parseDownloadFilename('attachment; filename="report.xlsx"', 'x.xlsx')).toBe('report.xlsx')
    expect(parseDownloadFilename('attachment; filename=report.xlsx', 'x.xlsx')).toBe('report.xlsx')
  })

  it('非法百分号编码不抛错，回退普通 filename', () => {
    expect(parseDownloadFilename("attachment; filename=a.xlsx; filename*=UTF-8''%E4%B", 'x.xlsx')).toBe('a.xlsx')
  })

  it('响应头缺失或无 filename 时用兜底名（跨域未暴露该头的场景）', () => {
    expect(parseDownloadFilename(undefined, 'fallback.xlsx')).toBe('fallback.xlsx')
    expect(parseDownloadFilename('', 'fallback.xlsx')).toBe('fallback.xlsx')
    expect(parseDownloadFilename('attachment', 'fallback.xlsx')).toBe('fallback.xlsx')
  })

  it('识别导出超限范围标记（前端据此提示分批导出）', () => {
    const name = parseDownloadFilename(`filename*=UTF-8''${encodeURIComponent('报销_前10000条_共20000条.xlsx')}`, 'x.xlsx')
    expect(/_前\d+条_共\d+条/.test(name)).toBe(true)
    expect(/_前\d+条_共\d+条/.test('报销_20261106.xlsx')).toBe(false)
  })
})
