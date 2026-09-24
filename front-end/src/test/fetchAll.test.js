import { describe, it, expect, vi } from 'vitest'
import { fetchAll } from '../api/fetchAll'

/** PAGE_SIZE 在 fetchAll 内部为 200，这里按同口径构造分页数据 */
const PAGE_SIZE = 200

function fullPage(startId) {
  return Array.from({ length: PAGE_SIZE }, (_, i) => ({ id: startId + i }))
}

/** 构造一个可记录调用参数的假接口：pages[i] 为第 i+1 页返回的 { list, total } */
function makeRequest(pages) {
  const calls = []
  const fn = vi.fn(async (params) => {
    calls.push({ ...params })
    const page = pages[params.page - 1] || { list: [] }
    return { code: 0, msg: 'ok', data: { list: page.list, total: page.total } }
  })
  return { fn, calls }
}

describe('fetchAll 全量取数', () => {
  it('首页不满一页时只请求一次', async () => {
    const { fn, calls } = makeRequest([{ list: [{ id: 1 }, { id: 2 }], total: 2 }])
    const res = await fetchAll(fn)
    expect(calls).toHaveLength(1)
    expect(res.data.list).toHaveLength(2)
    expect(res.data.total).toBe(2)
  })

  it('空列表也只请求一次', async () => {
    const { fn, calls } = makeRequest([{ list: [], total: 0 }])
    const res = await fetchAll(fn)
    expect(calls).toHaveLength(1)
    expect(res.data.list).toEqual([])
  })

  it('多页时逐页拉取并合并，保留原响应结构', async () => {
    const { fn, calls } = makeRequest([
      { list: fullPage(1), total: 250 },
      { list: Array.from({ length: 50 }, (_, i) => ({ id: 201 + i })), total: 250 },
    ])
    const res = await fetchAll(fn)
    expect(calls).toHaveLength(2)
    expect(calls[0].page).toBe(1)
    expect(calls[1].page).toBe(2)
    expect(res.data.list).toHaveLength(250)
    expect(res.data.list[249].id).toBe(250)
    expect(res.code).toBe(0)
  })

  it('已知 total 且已取满时提前结束', async () => {
    const { fn, calls } = makeRequest([{ list: fullPage(1), total: PAGE_SIZE }])
    const res = await fetchAll(fn)
    expect(calls).toHaveLength(1)
    expect(res.data.list).toHaveLength(PAGE_SIZE)
  })

  it('固定查询参数被保留，page/size 由内部接管', async () => {
    const { fn, calls } = makeRequest([{ list: [{ id: 1 }], total: 1 }])
    await fetchAll(fn, { table_key: 'cgsq_detail' })
    expect(calls[0]).toMatchObject({ table_key: 'cgsq_detail', page: 1, size: PAGE_SIZE })
  })

  it('支持通过箭头函数透传额外实参', async () => {
    const calls = []
    const api = async (id, params, tableName) => {
      calls.push({ id, ...params, tableName })
      return { code: 0, data: { list: [{ id: 1 }], total: 1 } }
    }
    const res = await fetchAll((p) => api(7, p, 'cgsq'))
    expect(calls[0]).toMatchObject({ id: 7, tableName: 'cgsq', page: 1, size: PAGE_SIZE })
    expect(res.data.list).toHaveLength(1)
  })

  it('data 本身是数组时，合并结果写回 data', async () => {
    const fn = vi.fn(async () => ({ code: 0, data: [{ id: 1 }, { id: 2 }] }))
    const res = await fetchAll(fn)
    expect(Array.isArray(res.data)).toBe(true)
    expect(res.data).toHaveLength(2)
  })

  it('接口一直返回满页时，最多请求 50 页后停止（防死循环）', async () => {
    let n = 0
    const fn = vi.fn(async () => {
      n += 1
      return { code: 0, data: { list: fullPage((n - 1) * PAGE_SIZE + 1) } }
    })
    const res = await fetchAll(fn)
    expect(fn).toHaveBeenCalledTimes(50)
    expect(res.data.list).toHaveLength(50 * PAGE_SIZE)
  })

  it('响应缺失时返回空列表而非抛错', async () => {
    const fn = vi.fn(async () => null)
    const res = await fetchAll(fn)
    expect(res.data.list).toEqual([])
  })
})
