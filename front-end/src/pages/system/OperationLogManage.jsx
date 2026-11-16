import {
  Button,
  Card,
  Checkbox,
  DatePicker,
  Descriptions,
  Dropdown,
  Input,
  Menu,
  Message,
  Popover,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Typography,
} from '@arco-design/web-react'
import {
  IconDown,
  IconList,
  IconRefresh,
  IconRight,
  IconSettings,
} from '@arco-design/web-react/icon'
import { useCallback, useEffect, useRef, useState } from 'react'
import * as operationLogApi from 'src/api/operationLog'
import { SIZE_OPTIONS } from 'src/config/app'
import { formatTime } from 'src/utils/format'

const RangePicker = DatePicker.RangePicker
const MenuItem = Menu.Item

// 可配置列 key（展开行内容不参与列设置）
const ALL_COL_KEYS = ['created_at', 'username', 'method', 'path', 'status', 'ip', 'elapsed_ms']

// 请求方法 -> Tag 颜色（视觉区分写操作类型）
const METHOD_COLOR = { POST: 'arcoblue', PUT: 'orange', DELETE: 'red', PATCH: 'purple' }

const formatBytes = (n) => {
  if (!n) return '-'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

// 代码块：保留 pre 的换行/滚动能力，复制入口使用 Typography.copyable。
// Typography 的 code 是行内样式，直接替代 pre 会丢失多行与滚动，不适合长请求体。
const renderCodeBlock = (text) => {
  if (!text) return '-'
  return (
    <div className="flex">
      <pre className="m-0 flex-1 rounded bg-(--color-fill-1) px-2.5 py-2 text-xs break-all whitespace-pre-wrap">
        {text}
      </pre>
      <Typography.Text copyable={{ text }} />
    </div>
  )
}

export default function OperationLogManage() {
  const [list, setList] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(10)
  const [loading, setLoading] = useState(false)

  // 草稿筛选条件（变化不触发请求）与已生效条件（点击「搜索」后更新）
  const [username, setUsername] = useState('')
  const [method, setMethod] = useState(undefined)
  const [path, setPath] = useState('')
  const [range, setRange] = useState([])
  const [applied, setApplied] = useState({ username: '', method: '', path: '', start: '', end: '' })

  // 表格密度 & 列可见性
  const [tableSize, setTableSize] = useState('default')
  const [visibleCols, setVisibleCols] = useState(ALL_COL_KEYS)

  // 展开行：按需拉取完整请求体，避免列表一次返回所有大字段
  const [expandedKeys, setExpandedKeys] = useState([])
  const [detailMap, setDetailMap] = useState({})
  const [detailLoading, setDetailLoading] = useState({})
  const detailCacheRef = useRef({})
  const detailLoadingRef = useRef({})

  // 生效筛选条件 → 请求参数（列表与导出共用，保证口径一致）
  const buildFilterParams = useCallback((fromApplied) => {
    const params = {}
    if (fromApplied.username) params.username = fromApplied.username
    if (fromApplied.method) params.method = fromApplied.method
    if (fromApplied.path) params.path = fromApplied.path
    if (fromApplied.start) params.start = fromApplied.start
    if (fromApplied.end) params.end = fromApplied.end
    return params
  }, [])

  const fetchList = useCallback(
    async (p = page, s = size) => {
      setLoading(true)
      try {
        const params = { page: p, size: s, ...buildFilterParams(applied) }
        const res = await operationLogApi.listOperationLogs(params)
        setList(res.data.list || [])
        setTotal(res.data.total || 0)
      } catch (e) {
        // 错误已在请求层提示
      } finally {
        setLoading(false)
      }
    },
    [page, size, applied, buildFilterParams],
  )

  // 展开行按需加载详情：列表不返回 body，展开时才拉完整记录；同一行只请求一次。
  const loadDetail = useCallback(async (id) => {
    if (detailCacheRef.current[id] || detailLoadingRef.current[id]) return
    detailLoadingRef.current[id] = true
    setDetailLoading((prev) => ({ ...prev, [id]: true }))
    try {
      const res = await operationLogApi.getOperationLog(id)
      detailCacheRef.current[id] = res.data
      setDetailMap((prev) => ({ ...prev, [id]: res.data }))
    } catch {
      // 错误已在请求层提示；展开行保留列表摘要信息
    } finally {
      detailLoadingRef.current[id] = false
      setDetailLoading((prev) => ({ ...prev, [id]: false }))
    }
  }, [])

  const handleExpand = (record, expanded) => {
    setExpandedKeys((prev) => {
      if (expanded) return prev.includes(record.id) ? prev : [...prev, record.id]
      return prev.filter((id) => id !== record.id)
    })
    if (expanded) loadDetail(record.id)
  }

  // 导出：按已生效筛选条件下载 xlsx。
  // 响应为 blob：type 为 JSON 时说明后端返回的是业务错误（如权限/参数），解析后提示；
  // 正常时从 Content-Disposition 无法直接取（拦截器只回 data），统一用本地时间命名。
  const [exporting, setExporting] = useState(false)
  const handleExport = async () => {
    setExporting(true)
    try {
      const blob = await operationLogApi.exportOperationLogs(buildFilterParams(applied))
      if (blob && blob.type && blob.type.includes('application/json')) {
        const text = await blob.text()
        let msg = '导出失败'
        try {
          msg = JSON.parse(text).msg || msg
        } catch {
          /* 非法 JSON 用默认提示 */
        }
        Message.error(msg)
        return
      }
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      // 本地时间戳命名（formatTime 只接受 ISO 字符串，不适用于 Date.now）
      const now = new Date()
      const pad = (n) => String(n).padStart(2, '0')
      const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
      a.download = `操作日志_${stamp}.xlsx`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      // 后端单次导出上限 5 万行：筛选结果超出时仅导出最新部分，明确告知用户
      if (total > 50000) {
        Message.warning(
          `共 ${total} 条记录，超出单次导出上限，仅导出最近 5 万条；可缩小时间/条件范围分批导出`,
        )
      } else {
        Message.success('导出成功')
      }
    } catch (e) {
      // 网络层错误已在请求拦截器提示
    } finally {
      setExporting(false)
    }
  }

  useEffect(() => {
    fetchList()
  }, [page, size, fetchList])

  // 搜索：生效草稿条件，回到第一页
  const handleSearch = () => {
    setApplied({
      username: username.trim(),
      method: method || '',
      path: path.trim(),
      start: range?.[0] || '',
      end: range?.[1] || '',
    })
    setPage(1)
  }

  // 重置：清空草稿与已生效条件，回到第一页并刷新
  const handleReset = () => {
    setUsername('')
    setMethod(undefined)
    setPath('')
    setRange([])
    setApplied({ username: '', method: '', path: '', start: '', end: '' })
    setPage(1)
  }

  // 表格密度下拉
  const sizeMenu = (
    <Menu onClickMenuItem={(key) => setTableSize(key)}>
      {SIZE_OPTIONS.map((o) => (
        <MenuItem
          key={o.value}
          style={
            o.value === tableSize
              ? { color: 'rgb(var(--arcoblue-6))', backgroundColor: 'rgb(var(--arcoblue-1))' }
              : undefined
          }
        >
          {o.label}
        </MenuItem>
      ))}
    </Menu>
  )

  const columns = [
    {
      key: 'created_at',
      title: '操作时间',
      dataIndex: 'created_at',
      width: 180,
      render: (v) => formatTime(v),
    },
    {
      key: 'username',
      title: '操作人',
      dataIndex: 'username',
      width: 100,
      render: (v, r) => v || (r.user_id ? `#${r.user_id}` : '-'),
    },
    {
      key: 'method',
      title: '方法',
      dataIndex: 'method',
      width: 90,
      align: 'center',
      render: (v) => <Tag color={METHOD_COLOR[v] || 'gray'}>{v}</Tag>,
    },
    {
      key: 'path',
      title: '路径',
      dataIndex: 'path',
      render: (v) => (
        <Typography.Ellipsis showTooltip style={{ maxWidth: 260 }}>
          {v || '-'}
        </Typography.Ellipsis>
      ),
    },
    {
      key: 'status',
      title: '状态',
      dataIndex: 'status',
      width: 70,
      align: 'center',
      render: (v) => (
        <Tag
          color={v >= 200 && v < 400 ? 'green' : v === 403 ? 'orange' : v >= 400 ? 'red' : 'gray'}
        >
          {v}
        </Tag>
      ),
    },
    { key: 'ip', title: 'IP', dataIndex: 'ip', width: 100 },
    {
      key: 'elapsed_ms',
      title: '耗时',
      dataIndex: 'elapsed_ms',
      width: 90,
      render: (v) => `${v} ms`,
    },
  ]

  // 列设置弹层内容
  const colSettingsPopover = (
    <Checkbox.Group value={visibleCols} onChange={setVisibleCols} direction="vertical">
      {ALL_COL_KEYS.map((k) => {
        const col = columns.find((c) => c.key === k)
        return (
          <Checkbox key={k} value={k}>
            {col?.title || k}
          </Checkbox>
        )
      })}
    </Checkbox.Group>
  )

  const visibleColumns = columns.filter((c) => visibleCols.includes(c.key))

  // 展开行：用 Descriptions 承载完整请求上下文；请求体/查询参数用可滚动 pre 展示。
  const renderExpandedRow = (record) => {
    if (detailLoading[record.id]) {
      return (
        <div className="flex justify-center py-6">
          <Spin />
        </div>
      )
    }
    const d = detailMap[record.id] || record
    return (
      <Descriptions
        className="bg-white [&_.arco-descriptions-table]:border-collapse!"
        column={2}
        border
        size={tableSize}
        data={[
          { label: '操作时间', value: formatTime(d.created_at) },
          { label: '操作人', value: d.username || (d.user_id ? `#${d.user_id}` : '-') },
          {
            label: '请求方法',
            value: <Tag color={METHOD_COLOR[d.method] || 'gray'}>{d.method}</Tag>,
          },
          {
            label: '状态',
            value: (
              <Tag
                color={
                  d.status >= 200 && d.status < 400
                    ? 'green'
                    : d.status === 403
                      ? 'orange'
                      : d.status >= 400
                        ? 'red'
                        : 'gray'
                }
              >
                {d.status}
              </Tag>
            ),
          },
          { label: 'IP', value: d.ip || '-' },
          { label: '耗时', value: `${d.elapsed_ms} ms` },
          { label: '请求体大小', value: formatBytes(d.body_bytes) },
          { label: 'Content-Type', value: d.content_type || '-' },
          { label: 'Request ID', value: d.request_id || '-', span: 2 },
          { label: 'User-Agent', value: d.user_agent || '-', span: 2 },
          { label: '路径', value: d.path || '-', span: 2 },
          ...(d.query
            ? [{ label: '查询参数', value: renderCodeBlock(`?${d.query}`), span: 2 }]
            : []),
          { label: '请求体', value: d.body ? renderCodeBlock(d.body) : '-', span: 2 },
        ]}
      />
    )
  }

  return (
    <Card title="操作日志">
      {/* 搜索区域 */}
      <div className="mb-3">
        <Space wrap>
          <Input
            className="w-40!"
            placeholder="按操作人搜索"
            allowClear
            value={username}
            onChange={setUsername}
            onPressEnter={handleSearch}
          />
          <Select
            className="w-32!"
            placeholder="请求方法"
            allowClear
            value={method}
            onChange={setMethod}
            options={[
              { label: 'POST', value: 'POST' },
              { label: 'PUT', value: 'PUT' },
              { label: 'DELETE', value: 'DELETE' },
              { label: 'PATCH', value: 'PATCH' },
            ]}
          />
          <Input
            className="w-48!"
            placeholder="按路径模糊搜索"
            allowClear
            value={path}
            onChange={setPath}
            onPressEnter={handleSearch}
          />
          <RangePicker
            value={range}
            onChange={(dateString) => setRange(dateString || [])}
            style={{ width: 260 }}
          />
          <Button type="primary" onClick={handleSearch}>
            搜索
          </Button>
          <Button onClick={handleReset}>重置</Button>
        </Space>
      </div>

      {/* 表格工具栏 */}
      <div className="mb-3 flex items-center justify-between">
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          仅记录非 GET 请求；展开行查看完整请求上下文，密码与 token 等凭据值已脱敏
        </Typography.Text>
        <Space>
          <Button size="small" type="primary" loading={exporting} onClick={handleExport}>
            导出
          </Button>
          <Button size="small" icon={<IconRefresh />} onClick={() => fetchList()}>
            刷新
          </Button>
          <Dropdown droplist={sizeMenu} trigger="click" position="br">
            <Button size="small" icon={<IconList />}>
              密度
            </Button>
          </Dropdown>
          <Popover content={colSettingsPopover} position="br" trigger="click">
            <Button size="small" icon={<IconSettings />}>
              列设置
            </Button>
          </Popover>
        </Space>
      </div>

      <Table
        rowKey="id"
        columns={visibleColumns}
        data={list}
        loading={loading}
        size={tableSize}
        expandedRowRender={renderExpandedRow}
        expandedRowKeys={expandedKeys}
        onExpand={handleExpand}
        expandProps={{
          expandRowByClick: true,
          icon: ({ expanded, record }) =>
            expanded ? (
              <button>
                <IconDown />
              </button>
            ) : (
              <button>
                <IconRight />
              </button>
            ),
          width: 60,
        }}
        pagination={{
          current: page,
          pageSize: size,
          total,
          showTotal: true,
          sizeCanChange: true,
          onChange: (p, s) => {
            setPage(p)
            setSize(s)
          },
        }}
      />
    </Card>
  )
}
