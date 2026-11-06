import { describe, expect, it } from 'vitest'

import { updateSnapshots } from '../pages/layout/keep-alive-outlet.jsx'

// 快照占位（仅用于断言键顺序，内容无关）
const snap = (p) => ({ element: p, ctx: { pathname: p } })

describe('updateSnapshots（页签缓存 LRU）', () => {
  it('激活项移到队尾且幂等', () => {
    const prev = new Map([
      ['a', snap('a')],
      ['b', snap('b')],
    ])
    const alive = new Set(['a', 'b'])
    const once = updateSnapshots(prev, 'a', snap('a'), alive, 10)
    expect([...once.keys()]).toEqual(['b', 'a'])
    // 重复激活同一路径不改变顺序、不新增条目
    const twice = updateSnapshots(once, 'a', snap('a'), alive, 10)
    expect([...twice.keys()]).toEqual(['b', 'a'])
    expect(twice.size).toBe(2)
  })

  it('不修改传入的原 Map', () => {
    const prev = new Map([
      ['a', snap('a')],
      ['b', snap('b')],
    ])
    updateSnapshots(prev, 'a', snap('a'), new Set(['a', 'b']), 10)
    expect([...prev.keys()]).toEqual(['a', 'b'])
  })

  it('清理已不存活的页签快照', () => {
    const prev = new Map([
      ['a', snap('a')],
      ['gone', snap('gone')],
    ])
    const next = updateSnapshots(prev, 'a', snap('a'), new Set(['a']), 10)
    expect([...next.keys()]).toEqual(['a'])
  })

  it('超出上限时淘汰最久未激活项，且必然保留当前激活项', () => {
    const prev = new Map([
      ['oldest', snap('oldest')],
      ['mid', snap('mid')],
    ])
    const alive = new Set(['oldest', 'mid', 'new'])
    const next = updateSnapshots(prev, 'new', snap('new'), alive, 2)
    // 上限 2：队首 oldest 被淘汰，保留 mid 与激活的 new
    expect([...next.keys()]).toEqual(['mid', 'new'])
    expect(next.has('new')).toBe(true)
  })

  it('大量积压时一次性收缩到上限', () => {
    const prev = new Map(['p1', 'p2', 'p3', 'p4', 'p5'].map((p) => [p, snap(p)]))
    const alive = new Set([...prev.keys(), 'cur'])
    const next = updateSnapshots(prev, 'cur', snap('cur'), alive, 3)
    expect(next.size).toBe(3)
    // 保留最后激活的两个 + 当前
    expect([...next.keys()]).toEqual(['p4', 'p5', 'cur'])
  })

  it('上限为 1 时只保留当前激活页', () => {
    const prev = new Map([['a', snap('a')]])
    const next = updateSnapshots(prev, 'b', snap('b'), new Set(['a', 'b']), 1)
    expect([...next.keys()]).toEqual(['b'])
  })

  it('快照内容被更新为本次传入的 entry', () => {
    const prev = new Map([['a', { element: 'OLD', ctx: {} }]])
    const entry = { element: 'NEW', ctx: { pathname: 'a' } }
    const next = updateSnapshots(prev, 'a', entry, new Set(['a']), 10)
    expect(next.get('a')).toBe(entry)
  })
})
