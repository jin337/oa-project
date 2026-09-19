import { SIZE_OPTIONS } from 'src/config/app'
import { useCallback, useEffect, useState } from 'react'
import { Menu } from '@arco-design/web-react'
import { useLocation } from 'react-router-dom'
import * as approvalApi from 'src/api/approval'
import { useTabs } from 'src/store/tab-context'
/**
 * 审批列表页通用 Hook：
 * 统一管理「列表数据 + 分页 + 加载 + 搜索 + 表格密度 + 列设置 + 详情 Drawer」状态与拉取逻辑，
 * 我的待办 / 我的发起 / 我审批的 / 抄送我的 / 草稿箱 共用，避免各页重复骨架。
 *
 * @param {string} scope        列表作用域：todo | initiated | approved | cc | drafts
 * @param {object} options
 * @param {string} options.title   页面标题（用于注册标签页）
 * @param {boolean} options.withTask 是否跟踪当前待办任务（仅待办列表需要，用于详情审批）
 * @param {string[]} options.colKeys 可配置列 key 列表（列设置默认全部可见；操作列不参与）
 */
export function useApprovalList(scope, { title = '', withTask = false, colKeys = [] } = {}) {
  const location = useLocation()
  const { addTab } = useTabs()
  const [list, setList] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(10)
  const [loading, setLoading] = useState(false)
  const [detailRecord, setDetailRecord] = useState(null)
  const [currentTask, setCurrentTask] = useState(null)

  // 搜索：草稿值（绑定输入，变化不触发请求）与生效值（点击搜索后驱动列表）
  const [keyword, setKeyword] = useState('')
  const [appliedKeyword, setAppliedKeyword] = useState('')

  // 表格密度 & 列可见性
  const [tableSize, setTableSize] = useState('default')
  const [visibleCols, setVisibleCols] = useState(colKeys)

  // 注册标签页
  useEffect(() => {
    addTab({ path: location.pathname, title })
  }, [location.pathname, addTab, title])

  // 拉取列表（依赖分页 / 作用域 / 生效关键词）
  const fetchList = useCallback(async () => {
    setLoading(true)
    try {
      const params = { page, size, scope }
      if (appliedKeyword) params.keyword = appliedKeyword
      const res = await approvalApi.getApprovalList(params)
      setList(res.data?.list || [])
      setTotal(res.data?.total || 0)
    } catch (e) {
      // 错误已在请求层提示
    } finally {
      setLoading(false)
    }
  }, [page, size, scope, appliedKeyword])

  useEffect(() => {
    fetchList()
  }, [fetchList])

  // 搜索：生效当前关键词，回到第一页
  const handleSearch = () => {
    setAppliedKeyword(keyword.trim())
    setPage(1)
  }

  // 重置：清空关键词并回到第一页
  const handleReset = () => {
    setKeyword('')
    setAppliedKeyword('')
    setPage(1)
  }

  // 表格密度下拉菜单
  const sizeMenu = (
    <Menu onClickMenuItem={(key) => setTableSize(key)}>
      {SIZE_OPTIONS.map((o) => (
        <Menu.Item
          key={o.value}
          style={
            o.value === tableSize
              ? { color: 'rgb(var(--arcoblue-6))', backgroundColor: 'rgb(var(--arcoblue-1))' }
              : undefined
          }
        >
          {o.label}
        </Menu.Item>
      ))}
    </Menu>
  )

  // 打开详情（待办列表额外携带当前任务，用于 Drawer 内审批）
  const openDetail = (record, task) => {
    setDetailRecord(record)
    setCurrentTask(task || null)
  }

  // 关闭详情
  const closeDetail = () => {
    setDetailRecord(null)
    setCurrentTask(null)
  }

  return {
    list,
    total,
    page,
    size,
    loading,
    setPage,
    setSize,
    fetchList,
    detailRecord,
    currentTask,
    openDetail,
    closeDetail,
    // 搜索
    keyword,
    setKeyword,
    appliedKeyword,
    handleSearch,
    handleReset,
    // 密度 & 列设置
    tableSize,
    setTableSize,
    visibleCols,
    setVisibleCols,
    sizeMenu,
  }
}

export default useApprovalList
