import {
  Button,
  Card,
  Checkbox,
  Drawer,
  Dropdown,
  Form,
  Input,
  Menu,
  Message,
  Popover,
  Space,
  Spin,
  Table,
} from '@arco-design/web-react'
import { IconList, IconRefresh, IconSearch, IconSettings } from '@arco-design/web-react/icon'
import { useCallback, useEffect, useMemo, useState } from 'react'
import * as applicationApi from '../../api/application'
import DynamicDetail from './DynamicDetail'
import DynamicForm from './DynamicForm'
import { getStaticOptions } from './DynamicForm'
import { useApplicationDetailData } from './useApplicationDetailData'

const FormItem = Form.Item
const MenuItem = Menu.Item

// 表格密度选项（与系统管理页面统一）
const SIZE_OPTIONS = [
  { label: '默认', value: 'default' },
  { label: '中等', value: 'middle' },
  { label: '紧凑', value: 'small' },
  { label: '迷你', value: 'mini' },
]

// 时间/日期相关元素类型（含 datepicker/timepicker 别名）
const TIME_ELEMENT_TYPES = ['date', 'datepicker', 'datetime', 'time', 'timepicker']

// 数值补零
const pad2 = (n) => String(n).padStart(2, '0')

/**
 * 将时间值格式化为标准可读格式（按元素类型决定粒度）：
 * - date / datepicker → YYYY-MM-DD
 * - time / timepicker → HH:mm:ss
 * - datetime         → YYYY-MM-DD HH:mm:ss
 * 兼容三种输入形态：ISO/带格式字符串、13 位毫秒时间戳、10 位秒时间戳；
 * 已是标准日期开头（YYYY-MM-DD）的字符串直接截取，避免二次解析引发的时区偏移；
 * 无法解析的值原样返回。
 */
function formatTimeValue(value, elementType) {
  if (value == null || value === '') return '-'
  const raw = String(value)
  // 已是标准日期开头（YYYY-MM-DD）：按需截取，避免 new Date 按 UTC 解析导致日期偏移一天
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    if (elementType === 'date' || elementType === 'datepicker') return raw.slice(0, 10)
    return raw.slice(0, 19).replace('T', ' ')
  }
  // 数字时间戳：13 位毫秒 / 10 位秒
  let date
  if (typeof value === 'number' || /^\d+$/.test(raw)) {
    const num = Number(value)
    date = new Date(num > 1e12 ? num : num * 1000)
  } else {
    date = new Date(value)
  }
  if (Number.isNaN(date.getTime())) return raw
  const y = date.getFullYear()
  const mo = pad2(date.getMonth() + 1)
  const d = pad2(date.getDate())
  if (elementType === 'date' || elementType === 'datepicker') return `${y}-${mo}-${d}`
  const h = pad2(date.getHours())
  const mi = pad2(date.getMinutes())
  const s = pad2(date.getSeconds())
  if (elementType === 'time' || elementType === 'timepicker') return `${h}:${mi}:${s}`
  return `${y}-${mo}-${d} ${h}:${mi}:${s}`
}

/**
 * 根据元素类型获取单元格的展示文本：
 * 时间/日期类型（date/datetime/time 等）格式化为标准可读格式；
 * 选择类控件（select/radio/checkbox）从 data_source 静态选项中查找 label；其余类型直接返回原始值
 */
function getDisplayValue(col, value) {
  if (value == null || value === '') return '-'
  if (TIME_ELEMENT_TYPES.includes(col.element_type)) {
    return formatTimeValue(value, col.element_type)
  }
  if (['select', 'radio', 'checkbox'].includes(col.element_type)) {
    const options = getStaticOptions(col)
    if (options.length) {
      const vals = Array.isArray(value) ? value : [value]
      return vals
        .map((v) => {
          const opt = options.find((o) => String(o.value) === String(v))
          return opt?.label ?? v
        })
        .join(', ')
    }
  }
  return String(value)
}

/**
 * 动态列表还原组件：根据应用配置（state=list）动态生成数据列表页面。
 * UI 结构与交互模式与系统管理页面（UserManage/RoleManage 等）保持一致：
 * - 搜索区域：由 search_fields 渲染（手动触发搜索/重置）
 * - 表格工具栏：刷新 / 密度下拉 / 列设置（操作列固定显示）
 * - 数据表格：分页集成于 Table.pagination（showTotal + sizeCanChange），支持密度与列显隐
 *
 * @param {object} app   应用配置对象（含 search_fields / columns / list / total 等）
 * @param {string} code  页面编码（由 DynamicPage 解析后传入，用于列表分页请求与详情跳转）
 */
export default function DynamicList({ app, code }) {
  const searchFields = app?.search_fields || []
  const columns = app?.columns || []

  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(app?.size || 10)
  const [total, setTotal] = useState(app?.total || 0)
  const [data, setData] = useState(app?.list || [])
  const [loading, setLoading] = useState(false)
  const [searchValues, setSearchValues] = useState({})
  const [searchForm] = Form.useForm()

  // 表格密度 & 列可见性
  const [tableSize, setTableSize] = useState('default')
  // 可配置列 key：序号列 + 动态字段列（操作列固定显示，不参与列设置）
  const ALL_COL_KEYS = useMemo(
    () => ['index', ...columns.map((c) => c.field_key).filter(Boolean)],
    [columns],
  )
  const [visibleCols, setVisibleCols] = useState(ALL_COL_KEYS)

  // 编辑/查看 Drawer 状态：drawerState 区分 'form'（编辑）/ 'detail'（查看）
  const [drawerVisible, setDrawerVisible] = useState(false)
  const [drawerState, setDrawerState] = useState('detail')
  const [drawerLoading, setDrawerLoading] = useState(false)
  const [drawerSubmitting, setDrawerSubmitting] = useState(false)
  const [drawerApp, setDrawerApp] = useState(null)
  const [drawerRecord, setDrawerRecord] = useState(null)
  const [drawerForm] = Form.useForm()

  // 详情数据加载 Hook：编辑模式回填复用（手动触发，回填由 hook 内部 effect 完成）
  const { fetchDetail: fetchRecordDetail } = useApplicationDetailData(
    null,
    null,
    drawerForm,
    { autoFetch: false },
  )

  // 打开编辑/查看 Drawer：按 state 预请求应用配置（form → 编辑表单，detail → 只读详情）
  // 编辑模式额外加载完整数据（含子表 Form.List 数组）回填，与"查看"模式行为一致
  const openDrawer = async (record, state) => {
    setDrawerVisible(true)
    setDrawerState(state)
    setDrawerRecord(record)
    setDrawerApp(null)
    setDrawerLoading(true)
    drawerForm.resetFields()
    try {
      const res = await applicationApi.getApplicationByCode(code, state)
      setDrawerApp(res.data)
      if (state === 'form') {
        // 列表行 record 仅含主表字段；调用详情接口获取完整数据（含子表），由 hook 回填到表单
        await fetchRecordDetail(res.data.id, record.id)
      }
    } catch (e) {
      Message.error('应用配置加载失败，请稍后重试')
      setDrawerVisible(false)
    } finally {
      setDrawerLoading(false)
    }
  }

  // 编辑模式提交：校验动态表单，调用数据更新接口，成功后关闭 Drawer 并刷新列表
  const handleDrawerSubmit = async () => {
    if (!drawerApp || !drawerRecord) return
    let values
    try {
      values = await drawerForm.validate()
    } catch (e) {
      return
    }
    setDrawerSubmitting(true)
    try {
      await applicationApi.updateApplicationData(drawerApp.id, drawerRecord.id, values)
      Message.success('保存成功')
      setDrawerVisible(false)
      fetchList()
    } catch (e) {
      Message.error('保存失败，请稍后重试')
    } finally {
      setDrawerSubmitting(false)
    }
  }

  // 表格列定义：序号列 + 动态字段列 + 操作列（编辑 / 查看）
  const tableColumns = useMemo(
    () => [
      {
        key: 'index',
        title: '序号',
        dataIndex: 'index',
        width: 62,
        align: 'center',
        render: (_, __, index) => index + 1,
      },
      ...columns.map((col) => ({
        key: col.field_key,
        title: col.label,
        dataIndex: col.field_key,
        render: (value) => getDisplayValue(col, value),
      })),
      {
        key: 'action',
        title: '操作',
        dataIndex: 'operation',
        width: 120,
        render: (_, record) => (
          <Space>
            <Button type="text" size="small" onClick={() => openDrawer(record, 'form')}>
              编辑
            </Button>
            <Button type="text" size="small" onClick={() => openDrawer(record, 'detail')}>
              查看
            </Button>
          </Space>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [columns, code],
  )

  // 初始数据直接取自 app（state=list 时后端已内联返回 list/total）
  useEffect(() => {
    setData(app?.list || [])
    setTotal(app?.total || 0)
    setPage(app?.page || 1)
    setPageSize(app?.size || 10)
  }, [app?.list, app?.total, app?.page, app?.size])

  // 搜索 / 翻页时独立请求动态数据列表
  const fetchList = useCallback(
    async (p = 1, ps = pageSize, filters = searchValues) => {
      setLoading(true)
      try {
        const res = await applicationApi.getApplicationByCode(code, 'list', p, ps, filters)
        setData(res.data?.list || [])
        setTotal(res.data?.total || 0)
      } catch {
        // 错误已在请求层提示
      } finally {
        setLoading(false)
      }
    },
    [code, pageSize, searchValues],
  )

  // 搜索：生效当前草稿条件，回到第一页并请求
  const handleSearch = async () => {
    try {
      const values = await searchForm.validate()
      const filters = {}
      for (const [k, v] of Object.entries(values || {})) {
        if (v !== undefined && v !== null && v !== '') filters[k] = v
      }
      setSearchValues(filters)
      setPage(1)
      fetchList(1, pageSize, filters)
    } catch {
      // 校验未通过
    }
  }

  // 重置：清空条件，回到第一页并刷新
  const handleReset = () => {
    searchForm.resetFields()
    setSearchValues({})
    setPage(1)
    fetchList(1, pageSize, {})
  }

  // 表格密度下拉（选中项高亮，与系统管理页面一致）
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

  // 列设置弹层内容：操作列固定显示，不参与勾选
  const colSettingsPopover = (
    <Checkbox.Group value={visibleCols} onChange={setVisibleCols} direction="vertical">
      {ALL_COL_KEYS.map((k) => {
        const col = tableColumns.find((c) => c.key === k)
        return (
          <Checkbox key={k} value={k}>
            {col?.title || k}
          </Checkbox>
        )
      })}
    </Checkbox.Group>
  )

  // 操作列固定显示，其余按 visibleCols 过滤
  const visibleColumns = tableColumns.filter(
    (c) => c.key === 'action' || visibleCols.includes(c.key),
  )

  return (
    <Card title={app?.name || '数据列表'}>
      {/* 搜索区域：仅存在搜索字段时渲染 */}
      {searchFields.length > 0 && (
        <div className="mb-3">
          <Form form={searchForm} layout="inline">
            <Space wrap>
              {searchFields.map((field) => (
                <FormItem key={field.field_key} field={field.field_key} label={field.label}>
                  <Input placeholder={field.placeholder || `请输入${field.label}`} allowClear />
                </FormItem>
              ))}
              <Button type="primary" icon={<IconSearch />} onClick={handleSearch}>
                搜索
              </Button>
              <Button icon={<IconRefresh />} onClick={handleReset}>
                重置
              </Button>
            </Space>
          </Form>
        </div>
      )}

      {/* 表格工具栏：刷新 / 密度 / 列设置 */}
      <div className="mb-3 flex items-center justify-between">
        <div></div>
        <Space>
          <Button size="mini" icon={<IconRefresh />} onClick={() => fetchList()}>
            刷新
          </Button>
          <Dropdown droplist={sizeMenu} position="br">
            <Button size="mini" icon={<IconList />}>
              密度
            </Button>
          </Dropdown>
          <Popover content={colSettingsPopover} position="br" trigger="click">
            <Button size="mini" icon={<IconSettings />}>
              列设置
            </Button>
          </Popover>
        </Space>
      </div>

      {/* 数据表格：分页集成于 Table.pagination */}
      <Table
        rowKey="id"
        columns={visibleColumns}
        data={data}
        loading={loading}
        size={tableSize}
        pagination={{
          current: page,
          pageSize,
          total,
          showTotal: true,
          sizeCanChange: true,
          onChange: (p, ps) => {
            setPage(p)
            setPageSize(ps)
            fetchList(p, ps)
          },
        }}
      />

      {/* 编辑 / 查看 Drawer：按 drawerState 渲染 DynamicForm（编辑）或 DynamicDetail（查看） */}
      <Drawer
        width="50%"
        title={
          drawerState === 'form'
            ? `编辑 - ${drawerApp?.name || ''}`
            : `查看 - ${drawerApp?.name || ''}`
        }
        visible={drawerVisible}
        onCancel={() => setDrawerVisible(false)}
        onOk={drawerState === 'form' ? handleDrawerSubmit : undefined}
        okLoading={drawerSubmitting}
        footer={drawerState === 'detail' ? null : undefined}
        unmountOnExit
      >
        {drawerLoading ? (
          <div className="flex h-40 items-center justify-center">
            <Spin />
          </div>
        ) : drawerApp ? (
          drawerState === 'form' ? (
            <DynamicForm app={drawerApp} form={drawerForm} pageType="form" />
          ) : (
            <DynamicDetail app={drawerApp} dataId={drawerRecord?.id} />
          )
        ) : null}
      </Drawer>
    </Card>
  )
}
