import { describe, expect, it } from 'vitest'

import { isTabCacheExcluded } from '../config/tab-cache.js'
import { updateSnapshots } from '../pages/layout/keep-alive-outlet.jsx'

// 快照占位（内容无关，仅用于断言键集合与顺序）
const snap = (p) => ({ element: p, ctx: { pathname: p } })

describe('isTabCacheExcluded（页签缓存白名单）', () => {
  it('命中白名单：工作台与申请不缓存', () => {
    expect(isTabCacheExcluded('/')).toBe(true)
    expect(isTabCacheExcluded('/approval/apply')).toBe(true)
  })

  it('未命中白名单：其他页面仍缓存', () => {
    expect(isTabCacheExcluded('/approval/todo')).toBe(false)
    expect(isTabCacheExcluded('/application/10/design')).toBe(false)
    // 精确匹配：首页通配不吞掉子路径
    expect(isTabCacheExcluded('/system/user')).toBe(false)
  })
})

describe('updateSnapshots（白名单不写入快照）', () => {
  it('白名单路径激活时不产生快照', () => {
    const next = updateSnapshots(new Map(), '/', snap('/'), new Set(['/']), 10, isTabCacheExcluded)
    expect(next.has('/')).toBe(false)
    expect(next.size).toBe(0)
  })

  it('白名单外的路径激活时照常产生快照', () => {
    const next = updateSnapshots(
      new Map(),
      '/approval/todo',
      snap('/approval/todo'),
      new Set(['/approval/todo']),
      10,
      isTabCacheExcluded,
    )
    expect([...next.keys()]).toEqual(['/approval/todo'])
  })

  it('已存在的历史快照在路径进入白名单后被清除', () => {
    const prev = new Map([
      ['/', snap('/')],
      ['/approval/todo', snap('/approval/todo')],
    ])
    const alive = new Set(['/', '/approval/todo'])
    const next = updateSnapshots(prev, '/approval/todo', snap('/approval/todo'), alive, 10, isTabCacheExcluded)
    expect([...next.keys()]).toEqual(['/approval/todo'])
  })

  it('白名单页面不占 LRU 名额', () => {
    // 上限 1：白名单首页激活后不写入，原有页签不会被挤掉
    const prev = new Map([['/approval/todo', snap('/approval/todo')]])
    const alive = new Set(['/', '/approval/todo'])
    const next = updateSnapshots(prev, '/', snap('/'), alive, 1, isTabCacheExcluded)
    expect([...next.keys()]).toEqual(['/approval/todo'])
  })

  it('未传排除函数时保持原有行为（向后兼容）', () => {
    const next = updateSnapshots(new Map(), '/', snap('/'), new Set(['/']), 10)
    expect([...next.keys()]).toEqual(['/'])
  })

  it('原 Map 不被修改', () => {
    const prev = new Map([
      ['/', snap('/')],
      ['/approval/todo', snap('/approval/todo')],
    ])
    updateSnapshots(prev, '/approval/todo', snap('/approval/todo'), new Set(['/', '/approval/todo']), 10, isTabCacheExcluded)
    expect([...prev.keys()]).toEqual(['/', '/approval/todo'])
  })
})
