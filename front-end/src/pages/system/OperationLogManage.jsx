import {
  Button,
  Card,
  Checkbox,
  DatePicker,
  Dropdown,
  Input,
  Menu,
  Message,
  Popover,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from '@arco-design/web-react'
import { IconList, IconRefresh, IconSettings } from '@arco-design/web-react/icon'
import { useCallback, useEffect, useState } from 'react'
import * as operationLogApi from 'src/api/operationLog'
import { SIZE_OPTIONS } from 'src/config/app'
import { formatTime } from 'src/utils/format'

const RangePicker = DatePicker.RangePicker
const MenuItem = Menu.Item

// 可配置列 key（操作内容列固定展示，不参与列设置）
const ALL_COL_KEYS = [
  'created_at',
  'username',
  'method',
  'path',
  'status',
  'ip',
  'elapsed_ms',
  'detail',
]

// 请求方法 -> Tag 颜色（视觉区分写操作类型）
const METHOD_COLOR = { POST: 'arcoblue', PUT: 'orange', DELETE: 'red', PATCH: 'purple' }

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
      key: 'detail',
      title: '请求参数',
      dataIndex: 'query',
      width: 300,
      render: (_, r) => {
        // 登录/密码等凭据类接口请求体已脱敏，仅展示 URL 查询参数
        const text = [r.query && `?${r.query}`, r.body && `body: ${r.body}`]
          .filter(Boolean)
          .join(' ')
        // 表格 auto 布局下最后一列会被拉伸，列 width 不生效；
        // 必须用 style.maxWidth 给 Ellipsis 一个受限宽度，才会出现省略号并启用内置 tooltip
        return (
          <Typography.Ellipsis
            showTooltip={{
              content: <div className="max-h-60 overflow-auto px-2 py-3">{text}</div>,
              className: '[&_.arco-tooltip-content]:p-0!',
            }}
            style={{ maxWidth: 300 }}
          >
            {text || '-'}
          </Typography.Ellipsis>
        )
      },
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
          仅记录写操作（新增/修改/删除/登录等）；凭据类接口请求体已脱敏
        </Typography.Text>
        <Space>
          <Button size="small" loading={exporting} onClick={handleExport}>
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
