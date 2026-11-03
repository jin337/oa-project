import { describe, it, expect } from 'vitest'
import { CalculateExpression } from '../pages/application/dynamic/utils/calculateExpression'

/**
 * CalculateExpression（JS 事件工具）回归基线：
 * 数学表达式求值 + 日期(时间)差值，语义与历史后端 /utils/calculate 的 calc 类型一致。
 * 非法输入（含非法日期）一律返回 NaN。
 */

describe('数学表达式', () => {
  it.each([
    ['(1+2)*3', 9],
    ['1+2*3', 7],
    ['10/4', 2.5],
    ['2.5 * 4', 10],
    [' 1 +  2 ', 3],
    ['-5 + 3', -2],
    ['2 * -3', -6],
    ['-(1+2)', -3],
    ['1 ++ 2', 3],
    ['1 +- 2', -1],
    ['--2', 2],
    ['((1+2)*(3+4))', 21],
  ])('%s -> %s', (expr, want) => {
    expect(CalculateExpression(expr)).toBe(want)
  })

  it('number 与数字字符串直通', () => {
    expect(CalculateExpression(5)).toBe(5)
    expect(CalculateExpression('100')).toBe(100)
  })

  it('非法表达式返回 NaN 且不抛异常', () => {
    for (const expr of ['abc', '1 +', '(1+2', '1+2)', '1%2']) {
      expect(() => CalculateExpression(expr)).not.toThrow()
      expect(CalculateExpression(expr)).toBeNaN()
    }
  })

  it('空值输入返回 NaN', () => {
    expect(CalculateExpression('')).toBeNaN()
    expect(CalculateExpression('   ')).toBeNaN()
    expect(CalculateExpression(null)).toBeNaN()
    expect(CalculateExpression(undefined)).toBeNaN()
  })
})

describe('日期(时间)差值', () => {
  it.each([
    ['2026-10-13-2026-10-12', 1],
    ['2026-10-13 - 2026-10-12', 1],
    ['2026-10-12-2026-10-13', -1],
    ['2026-10-13 - 2026-10-13', 0],
    ['2026-10-31 - 2026-10-01', 30],
    ['2027-01-01 - 2026-12-31', 1],
    ['2028-03-01 - 2028-02-28', 2],
    ['2026-10-13 12:00:00 - 2026-10-12 06:00:00', 1.25],
    ['2026-10-12 06:00:00 - 2026-10-13 12:00:00', -1.25],
    ['2026-10-13 12:00 - 2026-10-13 00:00', 0.5],
    ['2026-10-13 - 2026-10-12 06:00:00', 0.75],
    ['2026-10-13T12:00:00 - 2026-10-13T00:00:00', 0.5],
    ['2026-10-13 08:00:00 - 2026-10-12 00:00:00', 1.33],
  ])('%s -> %s', (expr, want) => {
    expect(CalculateExpression(expr)).toBe(want)
  })

  it('任一侧为空视为空值参与相减，返回 0', () => {
    expect(CalculateExpression('2026-10-13-')).toBe(0)
    expect(CalculateExpression('2026-10-13 - ')).toBe(0)
    expect(CalculateExpression('-2026-10-13')).toBe(0)
    expect(CalculateExpression('2026-10-13 12:00:00-')).toBe(0)
    expect(CalculateExpression('- 2026-10-13 12:00:00')).toBe(0)
    expect(CalculateExpression('-')).toBe(0)
  })

  it('命中日期形式但日期非法返回 NaN（不静默算错）', () => {
    expect(CalculateExpression('2026-13-45-2026-10-12')).toBeNaN()
    expect(CalculateExpression('2026-13-45-')).toBeNaN()
    expect(CalculateExpression('2026-02-30-2026-02-28')).toBeNaN()
    expect(CalculateExpression('2026-10-13 25:00:00 - 2026-10-12 06:00:00')).toBeNaN()
  })

  it('未命中日期形式时按普通数学表达式处理', () => {
    expect(CalculateExpression('1+2')).toBe(3)
    expect(CalculateExpression('2026-10-13')).toBe(2003)
    expect(CalculateExpression('2026-10-13 - 5')).toBe(1998)
  })
})
