import { describe, it, expect } from 'vitest'

import { CalculateExpression } from '../pages/application/dynamic/utils/calculateExpression'
import {
  attachSubTableRowContext,
  collectChangedPaths,
  diffFormValues,
} from '../pages/application/dynamic/utils/jsEventContext'

describe('子表列 changed 路径展开', () => {
  it('把 Arco 嵌套 changed 对象展开成子表单元格路径', () => {
    expect(collectChangedPaths({ clfbx_detail: [{ price: 100 }] })).toEqual([
      'clfbx_detail',
      'clfbx_detail[0]',
      'clfbx_detail[0].price',
    ])
  })

  it('保留主表对象字段的父路径与叶子路径', () => {
    expect(collectChangedPaths({ data_source: { type: 'api' } })).toEqual([
      'data_source',
      'data_source.type',
    ])
  })
})

describe('子表当前行上下文', () => {
  it('form.<子表名>.字段 读写当前行，不污染数组对象', () => {
    const form = { clfbx_detail: [{ price: 10, number: 2, fymoney: '' }] }
    attachSubTableRowContext(form, 'clfbx_detail', 0)

    const script =
      'form.clfbx_detail.fymoney=CalculateExpression(form.clfbx_detail.price * form.clfbx_detail.number)'
    const fn = new Function('form', 'CalculateExpression', `"use strict";\n${script}`)
    fn(form, CalculateExpression)

    expect(form.clfbx_detail[0].fymoney).toBe(20)
    // form.clfbx_detail.fymoney 是当前行代理读取值；数组对象本身没有被写入 fymoney 自有属性
    expect(form.clfbx_detail.fymoney).toBe(20)
    expect(Object.prototype.hasOwnProperty.call(form.clfbx_detail, 'fymoney')).toBe(false)
    expect(JSON.parse(JSON.stringify(form.clfbx_detail))).toEqual([
      { price: 10, number: 2, fymoney: 20 },
    ])
    expect(form.clfbx_detail[0].price).toBe(10)
    expect(form.clfbx_detail[0].number).toBe(2)
  })

  it('多行时只改当前行，并保留指定行访问与数组方法', () => {
    const form = {
      clfbx_detail: [
        { price: 10, number: 2, fymoney: '' },
        { price: 8, number: 3, fymoney: '' },
      ],
    }
    attachSubTableRowContext(form, 'clfbx_detail', 1)

    form.clfbx_detail.fymoney = CalculateExpression(
      form.clfbx_detail.price * form.clfbx_detail.number,
    )

    expect(form.clfbx_detail[0].fymoney).toBe('')
    expect(form.clfbx_detail[1].fymoney).toBe(24)
    expect(form.clfbx_detail[0].price).toBe(10)
    expect(form.clfbx_detail.map((row) => row.price)).toEqual([10, 8])
  })

  it('数组长度变化时保留完整数组写入语义', () => {
    const form = { clfbx_detail: [{ price: 10 }] }
    attachSubTableRowContext(form, 'clfbx_detail', 0)
    form.clfbx_detail.push({ price: 5 })

    expect(form.clfbx_detail[1].price).toBe(5)
  })
})

describe('脚本差异定位', () => {
  it('只生成当前行变化字段的精确路径', () => {
    const before = {
      clfbx_detail: [
        { price: 10, number: 2, fymoney: '' },
        { price: 8, number: 3, fymoney: '' },
      ],
    }
    const form = JSON.parse(JSON.stringify(before))
    attachSubTableRowContext(form, 'clfbx_detail', 0)
    form.clfbx_detail.fymoney = CalculateExpression(
      form.clfbx_detail.price * form.clfbx_detail.number,
    )

    expect(diffFormValues(before, form)).toEqual({
      'clfbx_detail[0].fymoney': 20,
    })
  })

  it('主表字段变化仍生成顶层字段路径', () => {
    expect(diffFormValues({ total: 1 }, { total: 2 })).toEqual({ total: 2 })
  })
})
