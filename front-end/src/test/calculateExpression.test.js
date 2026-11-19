import { beforeEach, describe, it, expect } from 'vitest'
import {
  CalculateExpression,
  resetDateDiffContext,
  toFormDateValue,
  wrapDateFields,
} from '../pages/application/dynamic/utils/calculateExpression'

/**
 * CalculateExpression（JS 事件工具）回归基线：
 * 数学表达式求值 + 日期(时间)差值，语义与历史后端 /utils/calculate 的 calc 类型一致。
 * 非法输入（含非法日期）一律返回 NaN。
 */

describe('数学表达式', () => {
  beforeEach(() => resetDateDiffContext())
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
  beforeEach(() => resetDateDiffContext())
  it.each([
    ['2026-10-13-2026-10-12', 2],
    ['2026-10-13 - 2026-10-12', 2],
    ['2026-10-12-2026-10-13', 2],
    ['2026-10-13 - 2026-10-13', 1],
    ['2026-10-31 - 2026-10-01', 31],
    ['2027-01-01 - 2026-12-31', 2],
    ['2028-03-01 - 2028-02-28', 3],
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

  it('未命中日期差值形式时按普通数学表达式处理', () => {
    expect(CalculateExpression('1+2')).toBe(3)
    expect(CalculateExpression('2026-10-13 - 5')).toBe(1998)
  })

  it('单个日期不是数学表达式，返回 NaN（不把 2026-10-13 算成 2003）', () => {
    expect(CalculateExpression('2026-10-13')).toBeNaN()
    expect(CalculateExpression('2026-10-13 12:00:00')).toBeNaN()
  })

  it('双参数：两个日期字符串按首尾都计入的天数，数字按算术差', () => {
    expect(CalculateExpression('2026-11-27', '2026-11-19')).toBe(9)
    expect(CalculateExpression('2026-11-19', '2026-11-27')).toBe(9)
    expect(CalculateExpression(200, 100)).toBe(100)
    expect(CalculateExpression('200', '100')).toBe(100)
    expect(CalculateExpression('2026-11-27', 100)).toBeNaN()
  })

  it('日期字段包装后直接相减，CalculateExpression 能识别并按首尾计数', () => {
    const begin = toFormDateValue('2026-11-19')
    const end = toFormDateValue('2026-11-27')
    expect(end - begin).toBe(8)
    // 原脚本 form.days=CalculateExpression(form.enddt-form.begindt) 无需再 +1
    expect(CalculateExpression(end - begin)).toBe(9)
    expect(String(end)).toBe('2026-11-27')
    expect(`${end} ~ ${begin}`).toBe('2026-11-27 ~ 2026-11-19')
  })

  it('包装日期时间字段后相减，按真实时长折算', () => {
    const begin = toFormDateValue('2026-10-12 06:00:00')
    const end = toFormDateValue('2026-10-13 12:00:00')
    // 30 小时 = 1.25 天，不再额外加 1
    expect(end - begin).toBe(1.25)
    expect(CalculateExpression(end - begin)).toBe(1.25)
    expect(String(end)).toBe('2026-10-13 12:00:00')
  })

  it.each([
    ['2026-10-13 07:00:00 - 2026-10-12 06:00:00', 1.04], // 25 小时
    ['2026-10-13 12:00:00 - 2026-10-13 06:00:00', 0.25], // 同一天 6 小时
    ['2026-10-13 12:00:00 - 2026-10-12 12:00:00', 1], // 正好 24 小时
    ['2026-10-13 12:00:30 - 2026-10-12 06:00:00', 1.25], // 30.5 小时，保留两位
    ['2026-10-13 12:00:00 - 2026-10-13 12:00:00', 0], // 同一时刻为 0
  ])('%s -> %s（含时分秒）', (expr, want) => {
    expect(CalculateExpression(expr)).toBe(want)
  })

  it('datetime 元素也会被包装，跨天时间差按真实时长计算', () => {
    const values = { begindt: '2026-10-12 06:00:00', enddt: '2026-10-13 12:00:00' }
    wrapDateFields(values, [
      { field_key: 'begindt', element_type: 'datetime' },
      { field_key: 'enddt', element_type: 'datetime' },
    ])
    expect(values.enddt - values.begindt).toBe(1.25)
    expect(CalculateExpression(values.enddt - values.begindt)).toBe(1.25)
  })

  it('包装空日期相减得到 NaN', () => {
    const begin = toFormDateValue('')
    const end = toFormDateValue('2026-11-27')
    expect(Number.isNaN(end - begin)).toBe(true)
    expect(CalculateExpression(end - begin)).toBeNaN()
  })

  it('wrapDateFields 只包装日期元素，数字字段保持原样', () => {
    const values = { begindt: '2026-11-19', enddt: '2026-11-27', days: '0' }
    const elements = [
      { field_key: 'begindt', element_type: 'datepicker' },
      { field_key: 'enddt', element_type: 'datepicker' },
      { field_key: 'days', element_type: 'number' },
    ]
    wrapDateFields(values, elements)
    expect(values.days).toBe('0')
    expect(values.enddt - values.begindt).toBe(8)
  })
})
