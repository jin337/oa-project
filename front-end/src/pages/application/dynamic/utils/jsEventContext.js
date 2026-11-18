/**
 * JS 事件运行时上下文工具：
 * 1) changedPaths：把 Arco onValuesChange 的嵌套 changed 对象展开成字段路径；
 * 2) attachSubTableRowContext：子表列事件中把 form.<tableKey> 映射到当前行；
 * 3) diffFormValues：把脚本执行前后的表单快照差异压缩成精确字段路径，避免整表回写触发全列联动。
 */

const isPlainObject = (value) => Object.prototype.toString.call(value) === '[object Object]'

/**
 * 展开 Arco Form 的 changed 对象。
 *
 * Arco 的 onValuesChange 第一个参数不是扁平 key 集合，而是 lodash.set 生成的嵌套对象，
 * 例如子表单元格变化得到 { clfbx_detail: [{ price: 100 }] }。
 * 这里同时保留父路径与叶子路径，兼容主表对象字段与子表列事件。
 *
 * @param {object} changed
 * @returns {string[]} 形如 ['clfbx_detail', 'clfbx_detail[0]', 'clfbx_detail[0].price']
 */
export function collectChangedPaths(changed) {
  const paths = []
  if (!changed || typeof changed !== 'object') return paths

  const walk = (value, prefix) => {
    if (prefix) paths.push(prefix)
    if (Array.isArray(value)) {
      value.forEach((item, index) => walk(item, `${prefix}[${index}]`))
      return
    }
    if (isPlainObject(value)) {
      Object.keys(value).forEach((key) => walk(value[key], prefix ? `${prefix}.${key}` : key))
    }
  }

  walk(changed, '')
  return paths
}

/** 数组自有属性/方法：这些 key 仍按数组本身处理，其余字段名落到当前行 */
const ARRAY_KEYS = new Set([
  'length',
  'constructor',
  'at',
  'concat',
  'copyWithin',
  'entries',
  'every',
  'fill',
  'filter',
  'find',
  'findIndex',
  'findLast',
  'findLastIndex',
  'flat',
  'flatMap',
  'forEach',
  'includes',
  'indexOf',
  'join',
  'keys',
  'lastIndexOf',
  'map',
  'pop',
  'push',
  'reduce',
  'reduceRight',
  'reverse',
  'shift',
  'slice',
  'some',
  'sort',
  'splice',
  'toLocaleString',
  'toReversed',
  'toSorted',
  'toSpliced',
  'toString',
  'unshift',
  'values',
  'with',
])

/**
 * 给子表数组挂当前行代理：form.<tableKey>.字段 读写当前行，form.<tableKey>[i].字段 仍访问指定行。
 *
 * 例：子表第 1 行触发事件时，脚本里的 form.clfbx_detail.fymoney = ... 会写到当前行，
 * 而 form.clfbx_detail[0].price 仍能读取第 1 行；数组方法（map/forEach/reduce 等）也不受影响。
 *
 * @param {object} form 表单快照（会被就地修改）
 * @param {string} tableKey 子表 key，如 clfbx_detail
 * @param {number} index 当前行下标
 * @returns {object} 原 form
 */
export function attachSubTableRowContext(form, tableKey, index) {
  if (!form || typeof form !== 'object' || !tableKey) return form
  const rows = form[tableKey]
  if (!Array.isArray(rows)) return form
  const row = rows[index]
  if (!row || typeof row !== 'object' || Array.isArray(row)) return form

  const isRowField = (key) =>
    typeof key === 'string' && !/^\d+$/.test(key) && !ARRAY_KEYS.has(key)

  form[tableKey] = new Proxy(rows, {
    get(target, key, receiver) {
      if (isRowField(key)) return row[key]
      return Reflect.get(target, key, receiver)
    },
    set(target, key, value, receiver) {
      if (isRowField(key)) {
        row[key] = value
        return true
      }
      return Reflect.set(target, key, value, receiver)
    },
  })
  return form
}

/**
 * 生成两个表单快照的精确差异。
 * 数组长度不变时按下标递归；对象按键递归；其余值变化写成路径 patch。
 * 子表行内字段会得到 clfbx_detail[0].fymoney 这样的路径，可直接交给 form.setFieldsValue，
 * 避免把整个子表数组回写导致所有列都收到一次 onValuesChange。
 *
 * @param {object} before 脚本执行前快照
 * @param {object} after 脚本执行后快照
 * @param {string} prefix 路径前缀
 * @returns {object} 形如 { 'clfbx_detail[0].fymoney': 20 }
 */
export function diffFormValues(before, after, prefix = '') {
  const patch = {}

  const walk = (a, b, path) => {
    if (Object.is(a, b)) return
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) {
        if (path) patch[path] = b
        return
      }
      for (let i = 0; i < a.length; i += 1) {
        walk(a[i], b[i], `${path}[${i}]`)
      }
      return
    }
    if (isPlainObject(a) && isPlainObject(b)) {
      const keys = new Set([...Object.keys(a), ...Object.keys(b)])
      keys.forEach((key) => {
        walk(a[key], b[key], path ? `${path}.${key}` : key)
      })
      return
    }
    if (path) patch[path] = b
  }

  walk(before, after, prefix)
  return patch
}
