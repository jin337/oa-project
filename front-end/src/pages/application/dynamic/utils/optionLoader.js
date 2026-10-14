/**
 * 动态表单引擎 · 选项数据源加载器
 *
 * 负责把元素的 data_source（type='api'）解析成真实请求并取回原始数据，
 * 同时提供「并发去重」：同一时刻针对同一份请求（method + url + params 完全相同）
 * 只发起一次网络往返，其余调用方共用同一个 Promise。
 *
 * 触发场景：详情（detail）等 rt 不可用的场景下，各元素组件自行加载选项；
 * 子表 N 行会实例化 N 个同列单元格、多个字段可能引用同一接口，
 * 若不做去重就会对同一份数据连发多次请求。
 *
 * 注意：去重只在请求「进行中」有效，请求结束即从表中移除，
 * 因此不缓存结果、不会返回过期数据，后续刷新仍会重新拉取。
 */

import request from 'src/api/request'
import { API_PREFIX } from 'src/utils/constants'

// 进行中的请求：key -> Promise。请求 settle 后立即删除，仅用于同一时刻的合并。
const inflight = new Map()

/**
 * 并发去重原语：key 相同且仍在进行中的请求共用同一个 Promise。
 *
 * 只做「同一时刻」的合并，请求结束（无论成败）即从表中移除，
 * 因此不缓存结果、不会返回过期数据，后续刷新仍会重新拉取。
 * 失败时返回 null（不抛出），调用方无需再包 try/catch。
 */
export const dedupRequest = (key, fn) => {
  const pending = inflight.get(key)
  if (pending) return pending

  const promise = Promise.resolve()
    .then(fn)
    .catch(() => null)
    .finally(() => {
      // 仅当表里还是自己时移除，避免误删后来者
      if (inflight.get(key) === promise) inflight.delete(key)
    })

  inflight.set(key, promise)
  return promise
}

/** 由 data_source 推导出实际请求参数（统一分发 /interfaces 前缀与 API_PREFIX 处理） */
export const resolveDataSourceRequest = (ds) => {
  // 引用接口管理（api_ref=1）→ 走统一分发端点 /interfaces{path}
  const isRef = ds?.api_ref === 1 || ds?.api_ref === '1'
  let rawUrl = ds?.url || ''
  if (isRef) rawUrl = '/interfaces' + rawUrl
  const url = rawUrl.startsWith(API_PREFIX) ? rawUrl.slice(API_PREFIX.length) : rawUrl
  const method = (ds?.method || 'GET').toUpperCase()
  const params = ds?.params && typeof ds?.params === 'object' ? ds.params : {}
  return { url, method, params }
}

/** data_source 的静态请求特征（不含运行期解析的模板值），用作并发去重的 key */
export const dataSourceRequestKey = (ds) => {
  const { url, method, params } = resolveDataSourceRequest(ds)
  return `${method}|${url}|${JSON.stringify(params)}`
}

/**
 * 加载 data_source 指向的选项数据，返回接口原始响应体（res.data）。
 *
 * 并发去重：相同的 method + url + params 在请求进行期间共用同一个 Promise。
 * 失败时返回 null（不抛出），调用方无需再包 try/catch —— 加载失败保留空选项、不打断表单。
 */
export const loadDataSourceOptions = (ds) => {
  if (ds?.type !== 'api' || !ds?.url) return Promise.resolve(null)

  const { url, method, params } = resolveDataSourceRequest(ds)
  return dedupRequest(dataSourceRequestKey(ds), () =>
    request({
      url,
      method,
      params: method === 'GET' ? params : undefined,
      data: method === 'GET' ? undefined : params,
    }).then((res) => res?.data ?? res),
  )
}
