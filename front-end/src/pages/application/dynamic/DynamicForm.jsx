import {
  Button,
  Form,
  Grid,
  Input,
} from '@arco-design/web-react'
import { IconDelete, IconDragArrow } from '@arco-design/web-react/icon'
import {
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import request from 'src/api/request'
import { useAuth } from 'src/store/auth-context'
import { API_PREFIX } from 'src/utils/constants'

import { evalDynamicExpr } from './utils/evalExpression'
import {
  DEFAULT_FORM_CONFIG,
  OPTION_ELEMENT_TYPES,
  buildValidationRules,
  extractFormDeps,
  findOptionByValue,
  getByPath,
  parseDefaultValue,
  parseLayoutJson,
  resolveExpr,
  resolvePath,
} from './utils/formUtils'
import { dataSourceRequestKey, dedupRequest } from './utils/optionLoader'

// 元素渲染配置中心（基础/常规元素渲染 + 详情只读组件）独立维护于 ./elements/elementConfig.jsx
import {
  ELEMENT_RENDER_CONFIG,
  ReadonlyValue,
  TableElementField,
  getBaseElementConfig,
  isNoLabelElement,
  isSelfRenderElement,
  renderCommonSettings,
  renderPreviewConfig,
} from './elements/elementConfig'
import { RuntimeFormContext } from './elements/runtimeContext'

// 元素渲染配置中心符号由 ./elements/elementConfig.jsx 定义，此处原样再导出以保持既有调用方不变
export {
  BASE_ELEMENT_CONFIGS,
  BASE_LAYOUT_ELEMENTS,
  ELEMENT_RENDER_CONFIG,
  NO_LABEL_TYPES,
  RuntimeFormContext,
  addColumn,
  genColumn,
  getBaseElementConfig,
  isBaseElement,
  isNoLabelElement,
  isSelfRenderElement,
  removeColumn,
  renderCommonSettings,
  renderPreviewConfig,
  updateColumn
} from './elements/elementConfig'
// 纯函数实现已迁移到 ./utils/formUtils，此处原样再导出以保持既有调用方不变
export {
  DEFAULT_FORM_CONFIG,
  TIME_ELEMENT_TYPES,
  evaluateDynamicStates,
  formatTimeValue,
  getStaticOptions,
  parseLayoutJson,
  serializeTimeFields
} from './utils/formUtils'

const FormItem = Form.Item
const Col = Grid.Col
// ==================== 动态表单运行时：数据源(api) + 事件联动(actions) ====================

/** 提取选项型元素的 api 数据源依赖字段（params/label 中的 ${form.xxx}）；非 api 数据源返回 null */
const apiOptionDeps = (el) => {
  if (!OPTION_ELEMENT_TYPES.has(el?.element_type) || el?.data_source?.type !== 'api') return null
  const ds = el.data_source
  return extractFormDeps([ds.params, ds.label].filter(Boolean).join(' '))
}

/**
 * 收集全部字段定义：顶层元素 + 各表（table）的列。
 * 列与元素同结构解析（element_type/data_source/actions/default_value/dynamic_states），
 * 运行时统一按字段定义加载动态选项，保证子表列与主表元素能力一致。
 */
const collectFieldDefs = (elements) => {
  const defs = []
  ;(elements || []).forEach((el) => {
    defs.push({ ...el, __isColumn: false })
    if (el.element_type === 'table' && Array.isArray(el.columns)) {
      el.columns.forEach((col) => {
        defs.push({
          ...col,
          __isColumn: true,
          __tableKey: el.table_key || el.id || '',
          field_key: col.dataIndex || col.field_key,
        })
      })
    }
  })
  return defs
}

/** 规范化动态接口地址：绝对 URL 原样保留；API_PREFIX 前缀去掉（request 实例 baseURL 已含）；其余作为相对路径 */
const normalizeApiUrl = (url) => {
  if (!url) return ''
  if (/^https?:\/\//.test(url)) return url
  return url.startsWith(API_PREFIX) ? url.slice(API_PREFIX.length) : url
}

/**
 * 动态接口请求构造：解析 url 模板（${form.xxx} / ${item.xxx}）与 params 表达式后发起请求。
 * cfg.url / cfg.api_url 均可（数据源用 url，联动动作用 api_url）。
 * api_ref=1 表示引用接口管理：改走统一分发端点 /interfaces{path}（request baseURL 已含 API_PREFIX）。
 */
const requestDynamicApi = async (cfg, vars) => {
  const isRef = cfg?.api_ref === 1 || cfg?.api_ref === '1'
  let rawUrl = resolveExpr(cfg?.url || cfg?.api_url, vars)
  if (isRef) rawUrl = '/interfaces' + rawUrl
  const url = normalizeApiUrl(rawUrl)
  const params = resolveParams(cfg?.params, vars)
  const method = (cfg?.method || 'GET').toUpperCase()
  return request({
    url,
    method,
    params: method === 'GET' ? params : undefined,
    data: method === 'GET' ? undefined : params,
  })
}

// 联动链路最大跳数：超过即停止继续触发 on_change，防止 A→B→A 这类联动回环无限执行
const MAX_LINK_DEPTH = 5

// 子表汇总写入的来源标记：刻意与任何 field_key 都不相等，
// 使目标字段自身的 on_change 照常继续执行（如 number_to_upper 生成大写金额）
const SUM_TABLE_SOURCE = '__sum_table__'

/** 给联动写入的字段打标记：记录写入值、触发字段与链路深度（onValuesChange 据此判断是否继续下一跳） */
const stampWrites = (patch, fromKey, depth) => {
  const out = {}
  Object.keys(patch).forEach((k) => {
    out[k] = { value: patch[k], from: fromKey, depth: (depth || 0) + 1 }
  })
  return out
}

/** 匹配联动写入标记：命中返回该条标记（含 from / depth），未命中返回 null */
const matchLinkWrite = (lw, key, val) => {
  if (!lw || !Object.prototype.hasOwnProperty.call(lw, key)) return null
  const entry = lw[key]
  if (!entry || typeof entry !== 'object') return null
  try {
    return JSON.stringify(entry.value) === JSON.stringify(val) ? entry : null
  } catch {
    return entry.value === val ? entry : null
  }
}

/** 解析请求参数：JSON 字符串（含表达式）或对象（值含表达式）统一转为普通对象 */
const resolveParams = (params, vars) => {
  if (!params) return {}
  if (typeof params === 'string') {
    const str = resolveExpr(params, vars)
    if (!String(str).trim()) return {}
    try {
      return JSON.parse(str)
    } catch (e) {
      return {}
    }
  }
  if (typeof params === 'object') {
    const out = {}
    for (const [k, v] of Object.entries(params)) {
      out[k] = typeof v === 'string' ? resolveExpr(v, vars) : v
    }
    return out
  }
  return {}
}

/**
 * 递归提取动态接口响应中的选项数组：
 * - 直接数组：[...]
 * - 常见包裹：{ data: [...] } / { data: { list: [...] } } / { list: [...] } / { records: [...] } / { rows: [...] }
 * - 分页结构：{ data: { list: [...], page, size, total } }
 * - 递归深度上限 3，避免意外深层循环
 */
const findListData = (obj, depth = 0) => {
  if (depth > 3) return undefined
  if (Array.isArray(obj)) return obj
  if (obj && typeof obj === 'object') {
    // 优先常见列表字段名
    for (const key of ['list', 'records', 'rows', 'items', 'data', 'content', 'recordsList']) {
      if (Array.isArray(obj[key])) return obj[key]
    }
    // 无命中时递归深入对象值（如 data = { list: [...] } / data = { data: [...] }）
    for (const v of Object.values(obj)) {
      const found = findListData(v, depth + 1)
      if (found) return found
    }
  }
  return undefined
}

/**
 * 将动态接口响应转为选项数组：
 * - 数组提取见 findListData（兼容多级/分页包裹）
 * - 元素可为 {label,value} 或 {name,id,title,code} 或原始值
 * - data_source.label 支持 ${item.xxx} 表达式（动态接口的"显示标签"，item 为列表元素，支持点路径如 ${item.dept.name}）
 */
const extractOptions = (resp, ds, vars) => {
  const list = findListData(resp)
  if (!Array.isArray(list)) return []
  // 单个数据项 → 选项节点：label/title 双字段（Select 用 label，TreeSelect 用 title），
  // 树形结构（treeselect）递归保留 children，避免拍平后树节点丢失
  const mapItem = (item) => {
    if (item == null) return null
    if (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') {
      return { label: String(item), title: String(item), value: String(item) }
    }
    const labelExpr = ds?.label
    let label
    if (labelExpr) {
      const r = resolvePath(labelExpr, { form: vars?.form, item })
      // 拼接/前缀命中取解析值；纯文本（无 ${} 无前缀）原样显示
      label = r.matched ? r.value : String(labelExpr)
    } else {
      label = item.label ?? item.name ?? item.title ?? ''
    }
    if (label === undefined || label === null) label = ''
    // 对应值 value_field：显式指定选项 value 取哪个字段（支持表达式 ${item.id}），
    // 例：接口数据项字段为 id、而当前表单字段（field_key）为 user_id 时，配置 value_field=id，
    // 选项 value 即取 item.id；留空默认按 value / id / key / code 顺序兜底
    const vf = ds?.value_field
    let value
    if (vf && String(vf).trim()) {
      const vfStr = String(vf).trim()
      const r = resolvePath(vfStr, { form: vars?.form, item })
      // 表达式/前缀命中取解析值；无前缀按选项项字段取（如 id）
      value = r.matched ? r.value : item?.[vfStr]
      if (value === undefined || value === null || value === '') value = ''
    } else {
      value = item.value ?? item.id ?? item.key ?? item.code
    }
    const node = {
      label: String(label ?? ''),
      title: String(label ?? ''),
      // 保留原始类型（数字/字符串）：接口字段与表单值同源，字符串化会导致
      // 回填（如 user_id=1 数字）与选项 value（"1" 字符串）严格匹配失败，Select 显示 raw value
      value: value === undefined || value === null ? '' : value,
      raw: item,
    }
    if (Array.isArray(item.children) && item.children.length) {
      node.children = item.children.map(mapItem).filter(Boolean)
    }
    return node
  }
  return list.map(mapItem).filter((o) => o && o.label)
}

// RuntimeFormContext 已迁移至 ./elements/runtimeContext.js（DynamicForm 顶部 import + 再导出）

/**
 * 运行时交互 Hook：动态数据源(api)加载 + 事件驱动联动(actions)执行。
 * 仅在 pageType='form'（实际填写）时启用；画布/详情只读不触发。
 */
export const useRuntimeForm = ({ elements, form, pageType, app }) => {
  const [apiOptions, setApiOptions] = useState({})
  const isRuntime = pageType === 'form'
  // 当前登录用户（/auth/profile）：供默认值中的 ${user.xxx} 表达式求值
  const { user } = useAuth()
  const formRef = useRef(null)
  // 联动写入标记：set_value/fetch_and_fill 写入的字段值 + 触发字段 + 链路深度，
  // onValuesChange 据此判断该写入是否要继续触发目标字段的 on_change（写回触发字段自身时跳过）
  const linkWrittenRef = useRef({})
  formRef.current = form
  // 最新动态选项（联动 set_value 需按选中项 raw 取值）
  const apiOptionsRef = useRef({})
  apiOptionsRef.current = apiOptions
  const elementsRef = useRef([])
  elementsRef.current = elements

  /** 加载某元素动态接口选项（data_source.type='api'） */
  const loadOptions = useCallback(async (el, allValues) => {
    const ds = el.data_source
    if (!ds?.url) return
    const vars = { form: allValues || {} }
    // 先解析 URL 中的 ${form.xxx} / ${item.xxx} 路径模板，避免 ${} 被请求层整体编码
    try {
      // 多个字段可能引用同一接口（如付款单位 / 付款账号）：参数不含运行期模板时，
      // 同一时刻的相同请求合并为一次网络往返；各字段仍各自拿到结果并写入自己的选项。
      const paramsText = JSON.stringify(ds?.params || {})
      const res = paramsText.includes('${')
        ? await requestDynamicApi(ds, vars)
        : await dedupRequest(dataSourceRequestKey(ds), () => requestDynamicApi(ds, vars))
      // 请求失败（去重层返回 null）→ 保留空选项，不打断表单
      if (res == null) return
      const options = extractOptions(res?.data ?? res, ds, vars)
      // 先同步更新 ref，保证紧随其后的补联动能取到刚加载的选项（state 提交是异步的）
      apiOptionsRef.current = { ...apiOptionsRef.current, [el.id]: options }
      setApiOptions((prev) => ({ ...prev, [el.id]: options }))
      // 选项加载完成：若该元素当前已有值（默认值/回填）且配置了 on_change，
      // 补跑一次联动以按选中项填充字段（默认值设置时机早于选项加载，正常联动取不到选中项数据）
      const cur = formRef.current?.getFieldValue?.(el.field_key)
      if (
        (el.actions?.on_change?.length || 0) > 0 &&
        cur !== undefined &&
        cur !== null &&
        cur !== ''
      ) {
        runActionsRef.current?.('on_change', el, formRef.current?.getFieldsValue?.() || {})
      }
    } catch (e) {
      // 动态接口请求失败：保留空选项，不打断表单
    }
  }, [])

  /** 执行 fetch_and_fill 动作：请求接口并按 target_mapping 填充目标字段（fromKey/depth 用于联动链路标记） */
  const runFetchFill = useCallback(async (action, allValues, currentObj, fromKey, depth) => {
    // vars：form = 表单值；item = 选中项数据（api_url 中显式写 ${item.xxx} 引用）
    const vars = { form: allValues || {}, item: currentObj }
    // 先解析 URL 中的 ${form.xxx} / ${item.xxx} 路径模板，避免 ${} 被请求层整体编码
    try {
      const res = await requestDynamicApi(action, vars)
      const data = res?.data ?? res
      const mapping = Array.isArray(action.target_mapping) ? action.target_mapping : []
      const patch = {}
      for (const m of mapping) {
        if (m?.target) {
          // source 为响应数据字段路径（点路径，如 profile.nickname）
          const v = getByPath(data, String(m.source || ''))
          if (v !== undefined) patch[m.target] = v
        }
      }
      if (Object.keys(patch).length) {
        linkWrittenRef.current = stampWrites(patch, fromKey, depth)
        formRef.current?.setFieldsValue?.(patch)
      }
    } catch (e) {
      // 填充失败不打断流程
    }
  }, [])

  /** 执行某元素指定触发时机的全部动作（set_value / fetch_and_fill）；colCtx 为子表列上下文（tableKey/index/fieldKey） */
  const runActions = useCallback(
    (trigger, el, allValues, colCtx, depth = 0) => {
      const actions = Array.isArray(el.actions?.[trigger]) ? el.actions[trigger] : []
      for (const action of actions) {
        if (!action?.action_type) continue
        // 触发字段当前值 + 选中项完整数据（set_value / fetch_and_fill 共用）：
        // 触发字段值读 tableKey[index].colKey（列场景）或 field_key（普通场景）
        const currentVal = colCtx
          ? formRef.current?.getFieldValue?.([colCtx.tableKey, colCtx.index, colCtx.fieldKey])
          : el?.field_key
            ? formRef.current?.getFieldValue?.(el.field_key)
            : undefined
        // 选中项完整数据：优先从该元素动态选项 raw 中匹配，回退为 { 字段: 值 }
        const opts = apiOptionsRef.current[el?.id] || []
        const sel = findOptionByValue(opts, currentVal)
        const currentObj = sel?.raw || { [colCtx?.fieldKey || el?.field_key]: currentVal }
        if (action.action_type === 'set_value') {
          const list = Array.isArray(action.value) ? action.value : []
          const patch = {}
          for (const m of list) {
            if (m?.target) {
              // 保护：目标字段等于触发字段自身时跳过写入。
              // 选项型字段（select/radio/treeselect 等）的值应为选项 value（如 id），
              // 若把选中项文本（如 username）覆盖到自身，值将不再匹配任何选项，
              // 导致 label 无法渲染、校验误报"不能为空"。
              const selfTarget = colCtx ? colCtx.fieldKey === m.target : m.target === el.field_key
              if (selfTarget) continue
              const src = m.source
              let v
              if (typeof src === 'string' && src.includes('${')) {
                // 拼接表达式：form = 表单值；item = 触发元素选中项数据
                v = resolveExpr(src, { form: allValues, item: currentObj })
              } else if (src != null) {
                // 独立路径：item.xxx 取选中项字段 / form.xxx 取表单字段；无前缀按选中项字段取
                const r = resolvePath(src, { form: allValues, item: currentObj })
                v = r.matched ? r.value : getByPath(currentObj, src)
                if (v === undefined || v === null) v = ''
              }
              // 目标字段：列场景为同行 target（tableKey[索引].target，与 Arco Form.List 字段路径一致）
              const targetKey = colCtx
                ? `${colCtx.tableKey}[${colCtx.index}].${m.target}`
                : m.target
              // 与当前值相同则跳过，避免无效写入反复触发 onValuesChange 造成循环
              if (v !== undefined && v !== formRef.current?.getFieldValue?.(targetKey)) {
                patch[targetKey] = v
              }
            }
          }
          if (Object.keys(patch).length) {
            // 触发字段 key：列场景为同行 tableKey[索引].列，普通场景为 field_key
            const fromKey = colCtx
              ? `${colCtx.tableKey}[${colCtx.index}].${colCtx.fieldKey}`
              : el?.field_key
            linkWrittenRef.current = stampWrites(patch, fromKey, depth)
            formRef.current?.setFieldsValue?.(patch)
          }
        } else if (action.action_type === 'fetch_and_fill') {
          // 传入选中项完整数据：api_url 中的 ${item.xxx} / ${form.xxx} 均可解析
          runFetchFill(
            action,
            allValues,
            currentObj,
            colCtx ? `${colCtx.tableKey}[${colCtx.index}].${colCtx.fieldKey}` : el?.field_key,
            depth,
          )
        }
      }
    },
    [runFetchFill],
  )

  // 用 ref 持有最新回调，避免 useEffect 依赖链（on_mount 仅随 elements 变化执行一次）
  const runActionsRef = useRef(null)
  runActionsRef.current = runActions
  const loadOptionsRef = useRef(null)
  loadOptionsRef.current = loadOptions

  // 流程默认值 default_value：仅字段当前为空时填充（输入框->内容，选择型->默认选中）
  // 独立为单独 effect：${user.xxx} 依赖异步加载的当前用户资料，user 就绪后需重新解析补填
  useEffect(() => {
    if (!isRuntime || !elements?.length) return
    const defPatch = {}
    elements.forEach((el) => {
      if (el.default_value === undefined || el.default_value === '') return
      const current = formRef.current?.getFieldValue?.(el.field_key)
      if (current === undefined || current === null || current === '') {
        const def = parseDefaultValue(el.default_value, el.element_type, { user })
        if (def !== undefined) defPatch[el.field_key] = def
      }
    })
    if (Object.keys(defPatch).length) formRef.current?.setFieldsValue?.(defPatch)
  }, [elements, isRuntime, user])

  // 挂载：执行 on_mount 动作 + 初始加载全部 api 动态选项
  useEffect(() => {
    if (!isRuntime || !elements?.length) return
    const vals = formRef.current?.getFieldsValue?.() || {}
    // 顶层元素：on_mount 动作（列级 on_mount 无行上下文，由列默认值/初始化承担）
    elements.forEach((el) => {
      runActionsRef.current?.('on_mount', el, vals)
    })
    // 全部字段定义（主表元素 + 子表列）：加载 api 动态选项（列与元素同结构解析）
    collectFieldDefs(elements).forEach((el) => {
      if (OPTION_ELEMENT_TYPES.has(el.element_type) && el.data_source?.type === 'api') {
        loadOptionsRef.current?.(el, vals)
      }
    })
  }, [elements, isRuntime])

  /** 值变化：执行 on_change 动作；依赖字段变化的 api 选项刷新 */
  const handleValuesChange = useCallback(
    (changed, allValues) => {
      // 仅填写场景（pageType='form'）启用联动：detail 展示/审批场景无填写交互，
      // 且 Arco setFieldsValue 回填也会触发 onValuesChange——若此处执行 on_change，
      // 无选中项上下文时 set_value 会把目标字段清空（如 user_id 联动清空 phone/email）
      if (!isRuntime) return
      const changedKeys = Object.keys(changed || {})
      elementsRef.current.forEach((el) => {
        const actions = el.actions?.on_change
        // on_change 语义：仅当该元素自身字段值发生变化时触发。
        // 联动写入（set_value/fetch_and_fill 的目标）分两种处理：
        //   ① 写回触发字段自身 → 跳过，避免二次联动；
        //   ② 写入其它字段 → 照常执行目标字段的 on_change（如明细求和写入 totalmoney 后，
        //      继续用 number_to_upper 生成大写金额），链路深度超过 MAX_LINK_DEPTH 即停防回环。
        if (Array.isArray(actions) && actions.length && changedKeys.includes(el.field_key)) {
          const lw = linkWrittenRef.current
          const val = changed[el.field_key]
          const entry = matchLinkWrite(lw, el.field_key, val)
          if (entry) {
            delete lw[el.field_key]
            const selfWrite = entry.from === el.field_key
            const depth = entry.depth || 0
            if (!selfWrite && depth <= MAX_LINK_DEPTH) {
              runActionsRef.current?.('on_change', el, allValues, undefined, depth)
            }
          } else {
            runActionsRef.current?.('on_change', el, allValues)
          }
        }
        const deps = apiOptionDeps(el)
        if (deps && changedKeys.some((k) => deps.has(k))) {
          loadOptionsRef.current?.(el, allValues)
        }
        // 子表列：与元素同结构解析——on_change（同行联动）与 api 选项刷新
        if (el.element_type === 'table' && Array.isArray(el.columns)) {
          const tableKey = el.table_key || el.id || ''
          el.columns.forEach((col) => {
            const colKey = col.dataIndex || col.field_key
            if (!colKey) return
            // 命中 tableKey[索引].colKey（Arco Form.List 实际格式）或 tableKey.索引.colKey 变化：触发该列 on_change（同行联动）
            // 用字符串前缀+后缀匹配替代每次 new RegExp，高频字段变更下避免反复编译正则
            const suffix = `.${colKey}`
            const rowHit = changedKeys.find((k) => k.startsWith(tableKey) && k.endsWith(suffix))
            if (rowHit) {
              // 提取索引：tableKey[3].colKey -> 3；tableKey.3.colKey -> 3
              const idxMatch = rowHit.match(/\[(\d+)\]|\.(\d+)\./)
              const idx = Number(idxMatch ? idxMatch[1] || idxMatch[2] : 0)
              const colActions = col.actions?.on_change
              if (Array.isArray(colActions) && colActions.length) {
                runActionsRef.current?.('on_change', col, allValues, {
                  tableKey,
                  index: idx,
                  fieldKey: colKey,
                })
              }
            }
            // 列 api 选项刷新：依赖字段变化（顶层字段或同行字段）时重新加载
            const colDeps = apiOptionDeps(col)
            if (
              colDeps &&
              [...colDeps].some(
                (d) => changedKeys.includes(d) || changedKeys.some((k) => k.endsWith(`.${d}`)),
              )
            ) {
              loadOptionsRef.current?.(col, allValues)
            }
          })
        }
      })

      // 子表汇总（action_type='sum_table'）：目标字段 = 配置该动作的元素自身，
      // 值 = 来源子表 table_key 中 source_field 列的合计。
      // 不挂在某个触发时机下，而是只要表单值变化就重算——这样改金额、添加行、删除行都能覆盖；
      // 新值等于当前值时跳过写入，保证幂等，避免写入后再次触发 onValuesChange 造成循环。
      const sumPatch = {}
      elementsRef.current.forEach((el) => {
        if (!el?.field_key || !el.actions || typeof el.actions !== 'object') return
        Object.values(el.actions).forEach((list) => {
          if (!Array.isArray(list)) return
          list.forEach((a) => {
            if (a?.action_type !== 'sum_table' || !a.table_key || !a.source_field) return
            const rows = allValues?.[a.table_key]
            const sum = (Array.isArray(rows) ? rows : []).reduce(
              (acc, row) => acc + (Number(row?.[a.source_field]) || 0),
              0,
            )
            if (sum !== formRef.current?.getFieldValue?.(el.field_key)) {
              sumPatch[el.field_key] = sum
            }
          })
        })
      })
      if (Object.keys(sumPatch).length) {
        linkWrittenRef.current = stampWrites(sumPatch, SUM_TABLE_SOURCE, 0)
        formRef.current?.setFieldsValue?.(sumPatch)
      }
    },
    [isRuntime],
  )

  /** 元素失焦：执行 on_blur 动作 */
  const handleElementBlur = useCallback(
    (el) => {
      if (!isRuntime) return
      const vals = formRef.current?.getFieldsValue?.() || {}
      runActionsRef.current?.('on_blur', el, vals)
    },
    [isRuntime],
  )

  // getOptions 依赖 apiOptions 变化重建；getFormValues 经 ref 读取可稳定引用
  const getOptions = useCallback(
    (el) => apiOptionsRef.current?.[el.id] || apiOptions[el.id],
    [apiOptions],
  )
  const getFormValues = useCallback(() => formRef.current?.getFieldsValue?.() || {}, [])

  const contextValue = useMemo(
    () => ({
      getOptions,
      handleElementBlur,
      getFormValues,
      appCode: app?.code || '',
      // 运行时（form 模式）由本 Hook 统一按 collectFieldDefs 加载全部选项型元素的动态选项，
      // 元素组件据此不再自行请求，避免同一字段被两条路径各加载一次（重复请求）。
      // detail 等 rt 不可用的场景不设置该标记，元素组件按原逻辑自加载。
      managesOptions: true,
    }),
    [getOptions, handleElementBlur, getFormValues, app?.code],
  )

  return { contextValue, handleValuesChange }
}

/** 元素容器：仅对配置了 on_blur 动作的元素包一层 blur 捕获（focusout 冒泡），触发联动 */
export const RuntimeFieldWrap = ({ el, children }) => {
  const rt = useContext(RuntimeFormContext)
  const hasBlur = Array.isArray(el.actions?.on_blur) && el.actions.on_blur.length > 0
  if (!hasBlur) return <>{children}</>
  return <div onBlurCapture={() => rt?.handleElementBlur?.(el)}>{children}</div>
}

/**
 * 元素属性面板总分发：基础组件 → 专属 renderSettings；常规控件 → 通用属性面板
 * LayoutManage 右侧"元素属性"Tab 统一调用此函数，无需再关心具体类型。
 */
export const renderElementSettings = (el, ctx) => {
  // 基础元素（divider/table）走 BASE_ELEMENT_CONFIGS 的专属面板（无通用配置，不组合）；
  // 常规元素：自定义 renderSettings 仅声明追加项，与通用配置（renderCommonSettings）组合渲染；
  // 都没有自定义时回退通用配置。
  const baseCfg = getBaseElementConfig(el.element_type)
  if (baseCfg?.renderSettings) return baseCfg.renderSettings(ctx)
  const runtimeCfg = ELEMENT_RENDER_CONFIG[el.element_type]
  if (runtimeCfg?.renderSettings) {
    return (
      <>
        {renderCommonSettings(ctx)}
        {runtimeCfg.renderSettings(ctx)}
      </>
    )
  }
  return renderCommonSettings(ctx)
}

// ==================== 画布/常规表单渲染辅助 ====================

// labelOfValue / ReadonlyValue（详情只读展示）已迁移至 ./elements/elementConfig.jsx
// （DynamicForm 顶部 import ReadonlyValue 使用）

/**
 * 渲染单个表单控件项（标签 / 栅格 / 校验规则 / 控件），画布与常规模式共用。
 * @param {object} el   布局元素
 * @param {object} ctx  渲染上下文 { isHorizontal, formConfig, pageType, isMoveMode }
 */
export const renderFormItemElement = (el, ctx) => {
  const { isHorizontal, formConfig, pageType, isMoveMode, fieldPerms, editable } = ctx
  const noLabel = isNoLabelElement(el.element_type)
  const isTableElement = el.element_type === 'table'
  const isFormMode = pageType === 'form'
  const isDetailMode = pageType === 'detail'
  // 审批节点字段权限：仅待办审批（editable）详情（detail）场景下 perm=2（可编辑）的字段渲染可编辑控件
  const permEditable =
    editable &&
    pageType === 'detail' &&
    (fieldPerms || []).find((p) => p && p.field === el.field_key)?.perm === 2

  // 仅在水平模式下计算栅格/Flex 布局（无标签元素按宽度分配，常规元素按全局标签宽度）
  let labelCol
  let wrapperCol
  if (isHorizontal) {
    if (noLabel) {
      labelCol = { span: 24 - el.width }
      wrapperCol = { span: el.width }
    } else {
      labelCol = { style: { flexBasis: formConfig.labelWidth } }
      wrapperCol = { style: { flexBasis: `calc(100% - ${formConfig.labelWidth}px)` } }
    }
  }

  // 校验规则：表格元素校验移交给内部 Form.List；详情只读不校验；
  // 常规元素由 rules 统一承载（required 必填 + validation_rule 正则/表达式），
  // Arco 依据 rules 中的 required 自动渲染必填星号，表达式校验经 ctx.runtime.getFormValues 求值
  const rules =
    isTableElement || isDetailMode
      ? undefined
      : buildValidationRules(el, () => ctx.runtime?.getFormValues?.() || {}, false, false)

  // 控件渲染分发：
  // - 详情只读（pageType='detail' / 'move-detail'）：常规控件与字段型组件（如 upload）渲染为纯文本
  //   （空值显示 '-'；move-detail 为 MoveDetailMode 注入的模拟数据），
  //   无字段标签的展示型组件（divider / description）保持自身渲染
  // - 其余模式：基础组件走专属配置（传原始 pageType，表格据此区分 form/move-form 可编辑、
  //   detail/move-detail 纯文本）；常规控件走统一渲染配置中心
  const renderControl = () => {
    if (el.element_type === 'table') {
      // 表格（子表）：透传字段权限，支持 detail 下按列 perm=2 渲染可编辑控件；
      // move-detail（画布详情预览）内部渲染模拟数据表格
      return (
        <TableElementField
          el={el}
          pageType={pageType}
          fieldPerms={fieldPerms}
          editable={editable}
          renderPreviewConfig={renderPreviewConfig}
          ReadonlyValue={ReadonlyValue}
        />
      )
    }
    // detail / move-detail 只读：统一经 ReadonlyValue 回显（upload/deptselect/userselect 由内部自动分派），
    // value 由 FormItem 注入（move-detail 为 MoveDetailMode 注入的模拟数据）
    if (
      (pageType === 'detail' || pageType === 'move-detail') &&
      !isSelfRenderElement(el.element_type) &&
      !permEditable
    ) {
      return (
        <ReadonlyValue
          elementType={el.element_type}
          dataSource={el.data_source}
          el={el}
          rt={ctx.runtime}
        />
      )
    }
    const baseCfg = getBaseElementConfig(el.element_type)
    if (baseCfg?.renderPreview) return baseCfg.renderPreview(el, pageType)
    const render = renderPreviewConfig[el.element_type]
    if (render) return render(el, pageType, ctx.runtime)
    return (
      <Input disabled={!isFormMode && !permEditable} placeholder={el.placeholder || undefined} />
    )
  }

  // 内部 FormItem 渲染（extra 可覆盖 hidden/disabled 等属性）
  const renderItem = (extra) => (
    <FormItem
      field={isTableElement ? undefined : el.field_key || el.name || undefined}
      label={noLabel ? '' : el.label}
      labelCol={labelCol}
      wrapperCol={wrapperCol}
      rules={rules}
      noStyle={noLabel}
      {...extra}
    >
      {renderControl()}
    </FormItem>
  )

  // 动态状态（visible_if / disabled_if）：通过 Form.Item shouldUpdate 监听依赖字段变化并重新渲染
  // - hidden 关联 visible_if：表达式不成立时隐藏该字段
  // - disabled 关联 disabled_if：表达式成立时禁用/只读该字段
  // - 画布（isMoveMode）不应用动态状态，设计时始终完整展示
  const ds = el.dynamic_states
  if ((ds?.visible_if || ds?.disabled_if) && !isMoveMode) {
    // detail 只读（字段级不可编辑）：使用父组件按完整业务数据预计算的静态映射，
    // 无需响应式监听，同时绕开 Arco setFieldsValue 同批写入依赖/目标字段时的快照覆盖问题
    if (isDetailMode && !permEditable && ctx.detailDynamicStates) {
      const st = ctx.detailDynamicStates[el.field_key]
      if (st) return renderItem({ hidden: !st.visible, disabled: st.disabled })
    }
    const deps = extractFormDeps([ds.visible_if, ds.disabled_if].filter(Boolean).join(' '))
    // 自身字段也纳入依赖：setFieldsValue 回填/联动写入该字段时 shouldUpdate 需感知变化并重新渲染，
    // 否则 store 值已更新但 UI 仍停留在旧值（如详情回填 phone 后显示空）
    if (el.field_key) deps.add(el.field_key)
    return (
      <Form.Item
        shouldUpdate={deps.size ? (prev, cur) => [...deps].some((d) => prev[d] !== cur[d]) : true}
        noStyle
      >
        {(formData) => {
          const values = formData || {}
          const visible = ds.visible_if ? evalDynamicExpr(ds.visible_if, values) : true
          const disabled = ds.disabled_if ? evalDynamicExpr(ds.disabled_if, values) : false
          return renderItem({ hidden: !visible, disabled })
        }}
      </Form.Item>
    )
  }

  return renderItem()
}

/**
 * 画布模式元素容器（memo 化）：拖拽/选中/悬停等高频状态变化时，
 * 仅目标元素的 isSelected / isDragOver 变化触发自身重渲染，其余元素跳过组件树更新。
 */
export const CanvasElement = memo(function CanvasElement({
  el,
  index,
  isSelected,
  isDragOver,
  ctx,
  onSelectElement,
  onRemoveElement,
  onElementDragStart,
  onElementDragOver,
  onElementDrop,
  onDragEnd,
}) {
  return (
    <Col span={el.width}>
      <div
        draggable
        onClick={(e) => {
          e.stopPropagation()
          onSelectElement?.(el)
        }}
        onDragStart={(e) => onElementDragStart?.(e, el)}
        onDragOver={(e) => onElementDragOver?.(e, index)}
        onDrop={(e) => onElementDrop?.(e, index)}
        onDragEnd={onDragEnd}
        className={`group relative h-full cursor-pointer ${
          isSelected
            ? 'bg-[rgb(var(--arcoblue-1))]'
            : isDragOver
              ? 'bg-[rgb(var(--arcoblue-1))]'
              : 'bg-white'
        }`}
      >
        {renderFormItemElement(el, ctx)}
        {/* 透明蒙层阻止触发表单控件原生交互（置于容器内，避免 FormItem children 成数组导致字段注入失效） */}
        <div
          className={`absolute inset-0 z-1 border transition-colors ${
            isSelected
              ? 'border-[rgb(var(--arcoblue-6))] '
              : isDragOver
                ? 'border-dashed border-[rgb(var(--arcoblue-6))] '
                : 'border-transparent hover:border-[rgb(var(--arcoblue-6))]'
          }`}
        ></div>
        {isSelected && (
          <>
            {/* 拖拽图标：绝对定位左下角 */}
            <span className="absolute bottom-0 left-0 bg-[rgb(var(--arcoblue-6))] px-1">
              <IconDragArrow className="cursor-grab text-white!" />
            </span>
            {/* 删除按钮：绝对定位右上角（悬浮于边框上） */}
            <Button
              size="mini"
              status="danger"
              shape="circle"
              icon={<IconDelete />}
              title="删除元素"
              className="absolute! -top-2 -right-2 z-2 shadow"
              onClick={(e) => {
                e.stopPropagation()
                onRemoveElement?.(el.id)
              }}
            />
          </>
        )}
      </div>
    </Col>
  )
})

// ==================== 核心组件：DynamicForm（路由分发器） ====================

import DetailMode from './modes/DetailMode'
import FormMode from './modes/FormMode'
import MoveDetailMode from './modes/MoveDetailMode'
import MoveFormMode from './modes/MoveFormMode'

/**
 * 动态表单路由分发器（Dispatcher）：
 * 解析布局配置后，根据 pageType 分发至对应的模式组件。
 *
 * @param {object} app         流程配置对象（含 form_layout_json 等字段）
 * @param {object} form        Arco Form 实例（可由调用方通过 Form.useForm() 创建）
 * @param {string} pageType    展示模式：
 *   - 'form'        常规可填写动态表单
 *   - 'detail'      详情只读模式（所有控件禁用态，仅数据展示）
 *   - 'move-form'   设计器画布模式（表单页）：支持拖拽排序/新增、选中高亮、删除、蒙层
 *   - 'move-detail' 设计器画布模式（详情页）：同上，表格组件按只读（editable=false）渲染
 * @param {string|null} selectedId        画布模式：当前选中元素 id
 * @param {number|null} dragOverIndex     画布模式：当前拖拽悬停元素索引
 * @param {Function} onSelectElement      画布模式：(el) 点击元素选中
 * @param {Function} onRemoveElement      画布模式：(elId) 删除元素
 * @param {Function} onElementDragStart   画布模式：(e, el) 元素拖拽开始
 * @param {Function} onElementDragOver    画布模式：(e, index) 元素上拖拽悬停
 * @param {Function} onElementDrop        画布模式：(e, index) 元素上放置
 * @param {Function} onDragEnd            画布模式：拖拽结束清理
 * @param {Function} onCanvasDragOver     画布模式：画布空白区拖拽悬停
 * @param {Function} onCanvasDrop         画布模式：画布空白区放置
 * @param {Function} onCanvasClick        画布模式：画布空白区点击（取消选中）
 * @param {Array}    fieldPerms           字段权限 [{field, perm}]：perm=1 隐藏（不渲染）、perm=2 可编辑（正常渲染）；
 *                                        未配置权限的字段默认渲染。审批详情场景由实例详情接口返回当前节点 field_perms。
 */
export default function DynamicForm({
  app,
  form,
  pageType = 'form',
  selectedId = null,
  dragOverIndex = null,
  onValuesChange,
  onSelectElement,
  onRemoveElement,
  onElementDragStart,
  onElementDragOver,
  onElementDrop,
  onDragEnd,
  onCanvasDragOver,
  onCanvasDrop,
  onCanvasClick,
  fieldPerms,
  editable = false,
  detailDynamicStates,
}) {
  // 布局解析缓存：仅当布局 JSON 变化时重新解析，拖拽/选中等状态更新不触发重复解析
  const layout = useMemo(() => parseLayoutJson(app?.form_layout_json), [app?.form_layout_json])
  const elements = layout?.elements || []
  const formConfig = layout?.formConfig || DEFAULT_FORM_CONFIG

  // 根据 pageType 分发对应的模式组件
  switch (pageType) {
    case 'form':
      return (
        <FormMode
          app={app}
          form={form}
          elements={elements}
          formConfig={formConfig}
          onValuesChange={onValuesChange}
          fieldPerms={fieldPerms}
        />
      )
    case 'detail':
      return (
        <DetailMode
          form={form}
          elements={elements}
          formConfig={formConfig}
          onValuesChange={onValuesChange}
          fieldPerms={fieldPerms}
          editable={editable}
          detailDynamicStates={detailDynamicStates}
        />
      )
    case 'move-form':
      return (
        <MoveFormMode
          form={form}
          elements={elements}
          formConfig={formConfig}
          selectedId={selectedId}
          dragOverIndex={dragOverIndex}
          onSelectElement={onSelectElement}
          onRemoveElement={onRemoveElement}
          onElementDragStart={onElementDragStart}
          onElementDragOver={onElementDragOver}
          onElementDrop={onElementDrop}
          onDragEnd={onDragEnd}
          onCanvasDragOver={onCanvasDragOver}
          onCanvasDrop={onCanvasDrop}
          onCanvasClick={onCanvasClick}
        />
      )
    case 'move-detail':
      return (
        <MoveDetailMode
          form={form}
          elements={elements}
          formConfig={formConfig}
          selectedId={selectedId}
          dragOverIndex={dragOverIndex}
          onSelectElement={onSelectElement}
          onRemoveElement={onRemoveElement}
          onElementDragStart={onElementDragStart}
          onElementDragOver={onElementDragOver}
          onElementDrop={onElementDrop}
          onDragEnd={onDragEnd}
          onCanvasDragOver={onCanvasDragOver}
          onCanvasDrop={onCanvasDrop}
          onCanvasClick={onCanvasClick}
        />
      )
    default:
      return null
  }
}
