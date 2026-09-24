/**
 * 全量取数：把「假全量」（page: 1 + size: 9999）换成真正的逐页拉全。
 *
 * 背景：后端列表接口统一走 BaseListReq 分页，且 model/base.go 的 normalize()
 * 在 size <= 0 或 size > 10000 时会回落成 10，因此既不能省略 page/size，
 * 也不能用超大 size 冒充全量 —— 超过上限的数据会被静默截断且不报错。
 */

/** 单页拉取条数：配置类数据量很小，绝大多数情况一次请求即可拿全 */
const PAGE_SIZE = 200
/** 兜底上限：防止接口异常时无限翻页（50 × 200 = 10000 条，远超配置类数据量） */
const MAX_PAGES = 50

function readList(res) {
  if (Array.isArray(res?.data)) return res.data
  if (Array.isArray(res?.data?.list)) return res.data.list
  return []
}

function readTotal(res) {
  const total = res?.data?.total
  return typeof total === 'number' ? total : undefined
}

/**
 * 逐页请求直到取完，返回与原接口一致的响应结构（其中 data.list 已合并为全量），
 * 因此调用方后续的 res.data.list / res.data?.list || res.data 取值逻辑无需改动。
 *
 * @param {(params: object) => Promise<any>} requestFn 接受查询参数的 API 函数
 * @param {object} [params] 额外的固定查询参数（如 table_key）
 * @returns {Promise<any>} 最后一次响应的结构，data.list 为合并后的全量数据
 *
 * 用法：
 *   const res = await fetchAll(roleApi.listRoles)
 *   const res = await fetchAll(applicationApi.listApplicationElements, { table_key: key })
 *   const res = await fetchAll((p) => applicationApi.listTableFields(id, p, tableName))
 */
export async function fetchAll(requestFn, params = {}) {
  const all = []
  let last = null
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const res = await requestFn({ ...params, page, size: PAGE_SIZE })
    last = res
    const list = readList(res)
    all.push(...list)
    const total = readTotal(res)
    // 本页不满一页，说明已到末页
    if (list.length < PAGE_SIZE) break
    // 已知总数且已取满，提前结束
    if (typeof total === 'number' && all.length >= total) break
  }
  if (last && Array.isArray(last.data)) {
    last.data = all
  } else if (last && last.data && typeof last.data === 'object') {
    last.data.list = all
  } else {
    last = { code: 0, data: { list: all } }
  }
  return last
}

export default fetchAll
