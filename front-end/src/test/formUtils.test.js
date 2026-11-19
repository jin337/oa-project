import { describe, expect, it } from 'vitest'

import {
  extractApiSourceDeps,
  extractLoadWhenDeps,
  isLoadWhenSatisfied,
  normalizeLoadWhen,
} from '../pages/application/dynamic/utils/formUtils'

describe('extractApiSourceDeps', () => {
  it('提取对象型 params 中的表单依赖', () => {
    const deps = extractApiSourceDeps({
      url: '/application/flow-list',
      params: { code: 'app_6734m0pr_xn81ktrf', deptname: '${form.payer}' },
      label: '${item.bank}（${item.account}）',
    })
    expect([...deps]).toEqual(['payer'])
  })

  it('提取 JSON 字符串型 params 中的表单依赖', () => {
    const deps = extractApiSourceDeps({
      params: '{"code":"app_6734m0pr_xn81ktrf","deptname":"${form.payer}"}',
    })
    expect([...deps]).toEqual(['payer'])
  })

  it('同时提取 url 与 label 中的表单依赖并去重', () => {
    const deps = extractApiSourceDeps({
      url: '/account/${form.payer}/${form.dept}',
      label: '${form.payer}',
    })
    expect([...deps].sort()).toEqual(['dept', 'payer'])
  })

  it('无表单依赖时返回空集合', () => {
    const deps = extractApiSourceDeps({
      url: '/application/flow-list',
      params: { code: 'app_6734m0pr_xn81ktrf' },
      label: '${item.account}',
    })
    expect(deps.size).toBe(0)
  })

  it('load_when 字段也纳入依赖集合', () => {
    const deps = extractApiSourceDeps({
      url: '/application/flow-list',
      params: { code: 'app_6734m0pr_xn81ktrf', deptname: '${form.payer}' },
      load_when: {
        mode: 'all',
        fields: [{ table_name: 'clfbx_detail', field_key: 'amount' }],
      },
    })
    expect([...deps].sort()).toEqual(['amount', 'clfbx_detail.amount', 'payer'])
  })
})

describe('load_when', () => {
  it('规范化配置并过滤空字段', () => {
    expect(
      normalizeLoadWhen({
        mode: 'any',
        fields: [
          { table_name: 'clfbx', field_key: 'payer' },
          { table_name: '', field_key: '' },
          null,
        ],
      }),
    ).toEqual({ mode: 'any', fields: [{ table_name: 'clfbx', field_key: 'payer' }] })
  })

  it('未配置条件时始终加载', () => {
    expect(isLoadWhenSatisfied(undefined, {})).toBe(true)
    expect(isLoadWhenSatisfied({ mode: 'all', fields: [] }, {})).toBe(true)
  })

  it('且模式要求主表依赖字段全部有值', () => {
    const loadWhen = {
      mode: 'all',
      fields: [
        { table_name: 'clfbx', field_key: 'payer' },
        { table_name: 'clfbx', field_key: 'deptname' },
      ],
    }
    expect(isLoadWhenSatisfied(loadWhen, { payer: '南京昇祥', deptname: '财务部' })).toBe(true)
    expect(isLoadWhenSatisfied(loadWhen, { payer: '南京昇祥', deptname: '' })).toBe(false)
    expect(isLoadWhenSatisfied(loadWhen, { payer: 0, deptname: false })).toBe(true)
  })

  it('或模式任一依赖字段有值即可加载', () => {
    const loadWhen = {
      mode: 'any',
      fields: [{ table_name: 'clfbx', field_key: 'payer' }, { table_name: 'clfbx', field_key: 'deptname' }],
    }
    expect(isLoadWhenSatisfied(loadWhen, { payer: '', deptname: '财务部' })).toBe(true)
    expect(isLoadWhenSatisfied(loadWhen, { payer: '', deptname: '' })).toBe(false)
  })

  it('子表字段按任意一行有值判断，空数组视为空', () => {
    const loadWhen = {
      mode: 'all',
      fields: [{ table_name: 'clfbx_detail', field_key: 'amount' }],
    }
    expect(
      isLoadWhenSatisfied(loadWhen, { clfbx_detail: [{ amount: '' }, { amount: 100 }] }),
    ).toBe(true)
    expect(isLoadWhenSatisfied(loadWhen, { clfbx_detail: [{ amount: '' }] })).toBe(false)
    expect(isLoadWhenSatisfied(loadWhen, { clfbx_detail: [] })).toBe(false)
  })

  it('提取主表与子表条件依赖', () => {
    const deps = extractLoadWhenDeps({
      mode: 'all',
      fields: [
        { table_name: 'clfbx', field_key: 'payer' },
        { table_name: 'clfbx_detail', field_key: 'amount' },
      ],
    })
    expect([...deps].sort()).toEqual([
      'amount',
      'clfbx.payer',
      'clfbx_detail.amount',
      'payer',
    ])
  })
})
