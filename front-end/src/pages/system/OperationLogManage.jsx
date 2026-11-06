import {
  Button,
  Card,
  Checkbox,
  DatePicker,
  Dropdown,
  Input,
  Menu,
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

  const fetchList = useCallback(
    async (p = page, s = size) => {
      setLoading(true)
      try {
        const params = { page: p, size: s }
        if (applied.username) params.username = applied.username
        if (applied.method) params.method = applied.method
        if (applied.path) params.path = applied.path
        if (applied.start) params.start = applied.start
        if (applied.end) params.end = applied.end
        const res = await operationLogApi.listOperationLogs(params)
        setList(res.data.list || [])
        setTotal(res.data.total || 0)
      } catch (e) {
        // 错误已在请求层提示
      } finally {
        setLoading(false)
      }
    },
    [page, size, applied],
  )

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
      width: 140,
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
      width: 260,
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
    {
      key: 'detail',
      title: '请求参数',
      dataIndex: 'query',
      width: 320,
      render: (_, r) => {
        // 登录/密码等凭据类接口请求体已脱敏，仅展示 URL 查询参数
        const text = [r.query && `?${r.query}`, r.body && `body: ${r.body}`]
          .filter(Boolean)
          .join(' ')
        // 表格 auto 布局下最后一列会被拉伸，列 width 不生效；
        // 必须用 style.maxWidth 给 Ellipsis 一个受限宽度，才会出现省略号并启用内置 tooltip
        return (
          <Typography.Ellipsis showTooltip style={{ maxWidth: 320 }}>
            {text || '-'}
          </Typography.Ellipsis>
        )
      },
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
