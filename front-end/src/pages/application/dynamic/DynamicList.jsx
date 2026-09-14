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
  Popconfirm,
  Popover,
  Space,
  Spin,
  Table,
} from '@arco-design/web-react'
import { IconList, IconRefresh, IconSettings } from '@arco-design/web-react/icon'
import { cloneElement, useCallback, useEffect, useMemo, useState } from 'react'
import * as applicationApi from 'src/api/application'
import DynamicDetail from 'src/pages/application/dynamic/DynamicDetail'
import DynamicForm, {
  formatTimeValue,
  getStaticOptions,
  parseLayoutJson,
  renderPreviewConfig,
  TIME_ELEMENT_TYPES,
} from 'src/pages/application/dynamic/DynamicForm'
import { useApplicationDetailData } from 'src/pages/application/dynamic/useApplicationDetailData'

const FormItem = Form.Item
const MenuItem = Menu.Item

// 表格密度选项（与系统管理页面统一）
const SIZE_OPTIONS = [
  { label: '默认', value: 'default' },
  { label: '中等', value: 'middle' },
  { label: '紧凑', value: 'small' },
  { label: '迷你', value: 'mini' },
]

/**
 * 将表单 values 中的时间字段序列化为 MySQL 兼容格式（提交前调用）：
 * 依据表单元素配置（含 table 子表的列配置）识别时间类型字段（TIME_ELEMENT_TYPES），
 * 主表字段与子表行内字段均转换；
 * 统一复用 formatTimeValue，第三个参数传原值（value）实现空值透传，避免污染提交数据
 */
function serializeTimeFields(values, elements) {
  if (!values || !Array.isArray(elements)) return values
  const next = { ...values }
  for (const el of elements || []) {
    const key = el?.field_key
    if (!key) continue
    if (el.element_type === 'table') {
      // 子表（Form.List）：遍历行内时间列
      const rows = next[key]
      if (Array.isArray(rows)) {
        next[key] = rows.map((row) => {
          if (!row || typeof row !== 'object') return row
          const nr = { ...row }
          for (const col of el.columns || []) {
            const colKey = col.dataIndex || col.field_key
            if (
              colKey &&
              TIME_ELEMENT_TYPES.includes(col.element_type) &&
              nr[colKey] != null &&
              nr[colKey] !== ''
            ) {
              nr[colKey] = formatTimeValue(nr[colKey], col.element_type, nr[colKey])
            }
          }
          return nr
        })
      }
    } else if (
      TIME_ELEMENT_TYPES.includes(el.element_type) &&
      next[key] != null &&
      next[key] !== ''
    ) {
      next[key] = formatTimeValue(next[key], el.element_type, next[key])
    }
  }
  return next
}

/**
 * 根据元素类型获取单元格的展示文本：
 * 时间/日期类型（date/datetime/time 等）经 formatTimeValue 格式化为标准可读格式；
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

// 支持 allowClear 的搜索控件类型（Switch/Radio/Checkbox/Upload 等不支持该属性，不注入）
const SEARCH_ALLOW_CLEAR_TYPES = [
  'input',
  'textarea',
  'number',
  'select',
  'date',
  'datepicker',
  'time',
  'timepicker',
]

/**
 * 搜索控件动态分发：根据 field.element_type 复用 DynamicForm 的 renderPreviewConfig 映射对应的
 * Arco 控件（select/radio/checkbox 经 getStaticOptions 注入静态选项、number → InputNumber、
 * datepicker → DatePicker、timepicker → TimePicker 等），搜索场景始终以可交互模式
 * （pageType='form'）渲染并统一注入 allowClear；未匹配的类型回退为 Input
 */
function renderSearchControl(field) {
  const render = renderPreviewConfig[field.element_type]
  const control = render ? render(field, 'form') : null
  if (control) {
    return SEARCH_ALLOW_CLEAR_TYPES.includes(field.element_type)
      ? cloneElement(control, { allowClear: true })
      : control
  }
  return <Input placeholder={field.placeholder || `请输入${field.label || '内容'}`} allowClear />
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
  const { fetchDetail: fetchRecordDetail } = useApplicationDetailData(null, null, drawerForm, {
    autoFetch: false,
  })

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
      // 时间字段（date/datetime/time 等）序列化为 MySQL 兼容格式
      // （YYYY-MM-DD / YYYY-MM-DD HH:mm:ss / HH:mm:ss），避免前端 ISO 8601
      // （如 2026-09-09T00:00:00+08:00）导致 MySQL Error 1292 更新失败
      const layout = parseLayoutJson(drawerApp?.form_layout_json)
      const payload = serializeTimeFields(values, layout?.elements || [])
      await applicationApi.updateApplicationData(drawerApp.id, drawerRecord.id, payload)
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
        width: 160,
        render: (_, record) => (
          <Space>
            <Button type="text" size="small" onClick={() => openDrawer(record, 'detail')}>
              查看
            </Button>
            <Button type="text" size="small" onClick={() => openDrawer(record, 'form')}>
              编辑
            </Button>
            <Popconfirm position="lb" title="确认删除该条数据？" onOk={() => handleDelete(record)}>
              <Button type="text" size="small" status="danger">
                删除
              </Button>
            </Popconfirm>
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

  // 删除当前行数据：Popconfirm 二次确认后调用删除接口，成功后提示并刷新列表
  const handleDelete = useCallback(
    async (record) => {
      if (!app?.id || !record?.id) return
      try {
        await applicationApi.deleteApplicationData(app.id, record.id)
        Message.success('删除成功')
        fetchList()
      } catch {
        // 错误已在请求层提示
      }
    },
    [app?.id, fetchList],
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
            {searchFields.map((field) => (
              <FormItem key={field.field_key} field={field.field_key} label={field.label}>
                {renderSearchControl(field)}
              </FormItem>
            ))}
            <FormItem>
              <Space>
                <Button type="primary" onClick={handleSearch}>
                  搜索
                </Button>
                <Button onClick={handleReset}>重置</Button>
              </Space>
            </FormItem>
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
