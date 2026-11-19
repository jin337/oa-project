import { describe, expect, it, vi } from 'vitest'

import { applyDataSourceAfterLoad } from '../pages/application/dynamic/utils/dataSourceAfterLoad'

describe('data_source.after_load', () => {
  it('未配置脚本时原样返回数据', () => {
    const data = [{ deptname: '南京昇祥' }]
    expect(applyDataSourceAfterLoad({}, data)).toBe(data)
  })

  it('按 deptname 去重并返回处理后的数组', () => {
    const ds = {
      after_load: `
        const seen = new Set()
        return data.filter((item) => {
          const key = item.deptname
          if (seen.has(key)) return false
          seen.add(key)
          return true
        })
      `,
    }
    const data = [
      { deptname: '南京昇祥', account: 'A' },
      { deptname: '南京昇祥', account: 'B' },
      { deptname: '华盛技术', account: 'C' },
    ]
    expect(applyDataSourceAfterLoad(ds, data)).toEqual([
      { deptname: '南京昇祥', account: 'A' },
      { deptname: '华盛技术', account: 'C' },
    ])
  })

  it('脚本原地修改 data 且不 return 时沿用修改后的数据', () => {
    const ds = { after_load: 'data.sort((a, b) => a.id - b.id)' }
    expect(applyDataSourceAfterLoad(ds, [{ id: 2 }, { id: 1 }])).toEqual([{ id: 1 }, { id: 2 }])
  })

  it('脚本执行异常时保留原始数据', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const data = [{ id: 1 }]
    expect(applyDataSourceAfterLoad({ after_load: 'throw new Error("bad")' }, data)).toBe(data)
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('只提供 data，不注入 form / request 等上下文', () => {
    const ds = {
      after_load: 'return [{ hasForm: typeof form !== "undefined", hasRequest: typeof request !== "undefined" }]',
    }
    expect(applyDataSourceAfterLoad(ds, [])).toEqual([
      { hasForm: false, hasRequest: false },
    ])
  })

  it('不修改调用方传入的原始数据', () => {
    const data = [{ id: 2 }, { id: 1 }]
    applyDataSourceAfterLoad({ after_load: 'data.sort((a, b) => a.id - b.id)' }, data)
    expect(data).toEqual([{ id: 2 }, { id: 1 }])
  })
})
