import { describe, it, expect } from 'vitest'
import { evalDynamicExpr } from '../pages/application/dynamic/utils/evalExpression'

/**
 * 动态状态表达式（visible_if / disabled_if）的回归基线。
 * 这里的期望值来自改造前的浏览器实测，用于保证“去掉 new Function 后语义不变”。
 */

describe('字面量与边界', () => {
  it.each([
    ['1', true],
    ['0', false],
    ['true', true],
    ['false', false],
    ['', false],
    ['   ', false],
    ['1 === 1', true],
    ['"a" === "a"', true],
    ['1+1 === 2', true],
    ["'a' === 'a'", true],
    ['1 > 0 && 2 > 1', true],
    ['1 > 2 || 2 > 1', true],
    ['1 ? true : false', true],
    ['0 ? true : false', false],
    ['!0', true],
    ['!(1 > 2)', true],
    ['-1 + 2 === 1', true],
  ])('%s -> %s', (expr, want) => {
    expect(evalDynamicExpr(expr, {})).toBe(want)
  })

  it('空值输入返回 false', () => {
    expect(evalDynamicExpr(null, {})).toBe(false)
    expect(evalDynamicExpr(undefined, {})).toBe(false)
  })

  it('语法错误的表达式返回 false 且不抛异常', () => {
    for (const expr of ['${form.x} ===', '1 +', '(1', '1)', '1 === === 2', '?']) {
      expect(() => evalDynamicExpr(expr, { x: 1 })).not.toThrow()
      expect(evalDynamicExpr(expr, { x: 1 })).toBe(false)
    }
  })
})

describe('取值与类型语义（与改造前逐格一致）', () => {
  const exprs = ['${form.x}', '${form.x} === "0"', '${form.x} == 0', '!${form.x}']
  it.each([
    ['数字 0', 0, [false, false, true, true]],
    ['字符串 "0"', '0', [true, true, true, false]],
    ['数字 1', 1, [true, false, false, false]],
    ['字符串 "1"', '1', [true, false, false, false]],
    ['空串', '', [false, false, true, true]],
    ['null', null, [false, false, true, true]],
  ])('%s', (_name, value, expected) => {
    exprs.forEach((expr, i) => {
      expect(evalDynamicExpr(expr, { x: value })).toBe(expected[i])
    })
  })
})

describe('常用表达式', () => {
  it.each([
    ['${form.country_id} === "CN"', { country_id: 'CN' }, true],
    ['${form.country_id} === "CN"', { country_id: 'US' }, false],
    ['${form.n} > 5', { n: 6 }, true],
    ['${form.n} >= 5', { n: 5 }, true],
    ['${form.n} + 1 === 6', { n: 5 }, true],
    ['(${form.n} + 1) * 2 === 12', { n: 5 }, true],
    ['${form.n} % 2 === 0', { n: 4 }, true],
    ['${form.a} + "x" === "yx"', { a: 'y' }, true],
    ['${form.a} && ${form.b}', { a: 1, b: 1 }, true],
    ['${form.a} || ${form.b}', { a: 0, b: 0 }, false],
    ['${form.a} ? true : false', { a: 1 }, true],
    ['${form.user.dept.name} === "研发部"', { user: { dept: { name: '研发部' } } }, true],
    ['${form.nope} === ""', {}, true],
    ['${form.obj} === ""', { obj: { a: 1 } }, false],
    ['${form.list} === ""', { list: [1, 2] }, false],
    ['${item.k} === ""', {}, true],
    ['${true}', {}, true],
    ['${100}', {}, true],
  ])('%s', (expr, data, want) => {
    expect(evalDynamicExpr(expr, data)).toBe(want)
  })
})

describe('不执行宿主 JS（安全回归）', () => {
  it.each([
    ['self["constructor"]'],
    ['self["constructor"]("return 40+2")() === 42'],
    ['self["con"+"structor"]["con"+"structor"]("return 40+2")() === 42'],
    ['window.location.href'],
    ['globalThis'],
    ['document.cookie'],
    ['this'],
    ['[].constructor'],
    ['process'],
    ['eval("1")'],
  ])('%s -> false', (expr) => {
    expect(evalDynamicExpr(expr, {})).toBe(false)
  })

  it('对照组：普通字面量仍可求值', () => {
    expect(evalDynamicExpr('1', {})).toBe(true)
    expect(evalDynamicExpr('0', {})).toBe(false)
  })
})
