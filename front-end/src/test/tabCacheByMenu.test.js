import { describe, expect, it } from 'vitest'

import { isTabCacheExcluded } from '../config/tab-cache.js'
import { updateSnapshots } from '../pages/layout/keep-alive-outlet.jsx'

// 菜单树样例：cache=0 的页面菜单表示「不缓存」，cache=1 表示「缓存」；
// 目录（type=1）与按钮（type=3）不参与页签缓存判定
const MENUS = [
  {
    id: 1,
    name: '审批管理',
    type: 1,
    path: '/approval',
    status: 1,
    cache: 1,
    children: [
      { id: 2, name: '申请', type: 2, path: '/approval/apply', status: 1, cache: 0 },
      { id: 3, name: '我的待办', type: 2, path: '/approval/todo', status: 1, cache: 1 },
      { id: 4, name: '新增按钮', type: 3, perm: 'approval:apply:add', status: 1, cache: 0 },
    ],
  },
  {
    id: 5,
    name: '流程配置',
    type: 2,
    path: '/application',
    status: 1,
    cache: 1,
    children: [
      { id: 6, name: '表单设计', type: 2, path: '/application/:id/design', status: 1, cache: 0 },
      { id: 7, name: '表字段管理', type: 2, path: '/application/:id/tables', status: 1, cache: 1 },
    ],
  },
  // 隐藏菜单同样参与判定
  { id: 8, name: '用户设置', type: 2, path: '/profile', status: 1, hidden: 1, cache: 1 },
]

// 快照占位（内容无关，仅用于断言键集合与顺序）
const snap = (p) => ({ element: p, ctx: { pathname: p } })
const excludedBy = (menus) => (path) => isTabCacheExcluded(menus, path)

describe('isTabCacheExcluded（菜单勾选是否缓存）', () => {
  it('菜单取消勾选（cache=0）的页面不缓存', () => {
    expect(isTabCacheExcluded(MENUS, '/approval/apply')).toBe(true)
    expect(isTabCacheExcluded(MENUS, '/application/10/design')).toBe(true)
  })

  it('菜单勾选缓存（cache=1）的页面照常缓存', () => {
    expect(isTabCacheExcluded(MENUS, '/approval/todo')).toBe(false)
    expect(isTabCacheExcluded(MENUS, '/application')).toBe(false)
    expect(isTabCacheExcluded(MENUS, '/application/10/tables')).toBe(false)
  })

  it('隐藏菜单同样按勾选结果判定', () => {
    expect(isTabCacheExcluded(MENUS, '/profile')).toBe(false)
  })

  it('不在菜单中的路径默认不缓存（工作台、通知中心等固定路由）', () => {
    expect(isTabCacheExcluded(MENUS, '/')).toBe(true)
    expect(isTabCacheExcluded(MENUS, '/notification')).toBe(true)
    expect(isTabCacheExcluded(MENUS, '/403')).toBe(true)
  })

  it('目录与按钮不参与判定：目录路径不会被当作可缓存页面', () => {
    expect(isTabCacheExcluded(MENUS, '/approval')).toBe(true)
  })

  it('菜单缺失 cache 字段（历史数据）按缓存处理', () => {
    const legacy = [{ id: 9, name: '我的发起', type: 2, path: '/approval/initiated', status: 1 }]
    expect(isTabCacheExcluded(legacy, '/approval/initiated')).toBe(false)
  })

  it('菜单为空（未加载完成）时不缓存', () => {
    expect(isTabCacheExcluded([], '/approval/todo')).toBe(true)
    expect(isTabCacheExcluded(undefined, '/')).toBe(true)
  })
})

describe('updateSnapshots（不缓存页面不写入快照）', () => {
  it('菜单未收录的工作台激活时不产生快照', () => {
    const next = updateSnapshots(
      new Map(),
      '/',
      snap('/'),
      new Set(['/']),
      10,
      excludedBy(MENUS),
    )
    expect(next.has('/')).toBe(false)
    expect(next.size).toBe(0)
  })

  it('菜单勾选缓存的页面激活时照常产生快照', () => {
    const next = updateSnapshots(
      new Map(),
      '/approval/todo',
      snap('/approval/todo'),
      new Set(['/approval/todo']),
      10,
      excludedBy(MENUS),
    )
    expect([...next.keys()]).toEqual(['/approval/todo'])
  })

  it('已存在的历史快照在菜单改为不缓存后被清除', () => {
    const prev = new Map([
      ['/approval/apply', snap('/approval/apply')],
      ['/approval/todo', snap('/approval/todo')],
    ])
    const alive = new Set(['/approval/apply', '/approval/todo'])
    const next = updateSnapshots(
      prev,
      '/approval/todo',
      snap('/approval/todo'),
      alive,
      10,
      excludedBy(MENUS),
    )
    expect([...next.keys()]).toEqual(['/approval/todo'])
  })

  it('不缓存页面不占 LRU 名额', () => {
    // 上限 1：不缓存首页激活后不写入，原有页签不会被挤掉
    const prev = new Map([['/approval/todo', snap('/approval/todo')]])
    const alive = new Set(['/', '/approval/todo'])
    const next = updateSnapshots(prev, '/', snap('/'), alive, 1, excludedBy(MENUS))
    expect([...next.keys()]).toEqual(['/approval/todo'])
  })

  it('未传排除函数时保持原有行为（向后兼容）', () => {
    const next = updateSnapshots(new Map(), '/', snap('/'), new Set(['/']), 10)
    expect([...next.keys()]).toEqual(['/'])
  })

  it('原 Map 不被修改', () => {
    const prev = new Map([
      ['/approval/apply', snap('/approval/apply')],
      ['/approval/todo', snap('/approval/todo')],
    ])
    updateSnapshots(
      prev,
      '/approval/todo',
      snap('/approval/todo'),
      new Set(['/approval/apply', '/approval/todo']),
      10,
      excludedBy(MENUS),
    )
    expect([...prev.keys()]).toEqual(['/approval/apply', '/approval/todo'])
  })
})
