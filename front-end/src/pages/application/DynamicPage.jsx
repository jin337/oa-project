import {
  Button,
  Card,
  Checkbox,
  DatePicker,
  Divider,
  Drawer,
  Dropdown,
  Empty,
  Form,
  Input,
  InputNumber,
  Menu,
  Message,
  Popover,
  Select,
  Space,
  Spin,
  Switch,
  Table,
  Tag,
  TimePicker,
} from '@arco-design/web-react'
import { IconList, IconRefresh, IconSearch, IconSettings } from '@arco-design/web-react/icon'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import * as applicationApi from '../../api/application'
import { useAuth } from '../../store/auth-context'
import NotFound from '../error/NotFound'

const FormItem = Form.Item
const MenuItem = Menu.Item

const DEFAULT_PAGE_SIZE = 10

// 表格密度选项
const SIZE_OPTIONS = [
  { label: '默认', value: 'default' },
  { label: '中等', value: 'middle' },
  { label: '紧凑', value: 'small' },
  { label: '迷你', value: 'mini' },
]

// 从元素 data_source 中提取静态选项（json 类型）
const getStaticOptions = (el) => {
  const ds = el?.data_source
  if (ds?.type === 'json' && Array.isArray(ds.options)) {
    return ds.options.filter((o) => o && (o.label || o.value))
  }
  return []
}

// 按 element_type 格式化单元格 / 详情值
const formatValue = (el, value) => {
  if (value === null || value === undefined || value === '') return '-'
  const options = getStaticOptions(el)
  if (options.length) {
    const hit = options.find((o) => String(o.value) === String(value))
    if (hit) return hit.label
  }
  if (el.element_type === 'switch') {
    const on = value === 1 || value === true
    return <Tag color={on ? 'green' : 'gray'}>{on ? '是' : '否'}</Tag>
  }
  return String(value)
}

// 搜索区控件（按 element_type 分发）
const renderSearchControl = (el) => {
  const options = getStaticOptions(el)
  const width = { width: 200 }
  switch (el.element_type) {
    case 'number':
      return <InputNumber style={width} placeholder={`请输入${el.label}`} />
    case 'select':
      return <Select style={width} options={options} placeholder={`请选择${el.label}`} allowClear />
    case 'date':
    case 'datepicker':
      return <DatePicker style={width} placeholder={`请选择${el.label}`} />
    case 'time':
    case 'timepicker':
      return <TimePicker style={width} placeholder={`请选择${el.label}`} />
    case 'switch':
      return <Switch />
    default:
      return <Input style={width} placeholder={`请输入${el.label}`} allowClear />
  }
}

// 详情布局元素 → 对应表单元素的 field_key（布局元素可能未携带，按 label 回退匹配）
const resolveFieldKey = (el, elements) => {
  if (el.field_key) return el.field_key
  const hit = (elements || []).find((fe) => fe.label === el.label)
  return hit?.field_key
}

/**
 * 动态配置页面：
 * 1. 根据菜单 link_app（应用 code）加载应用配置；
 * 2. 读取表单元素配置，visibility.search=1 的字段动态生成搜索区，visibility.list=1 的字段生成表格列；
 * 3. 操作列"详情"打开 Drawer，按 detail_layout_json 布局配置渲染详情内容。
 */
export default function DynamicPage() {
  const location = useLocation()
  const { menus, menusLoaded } = useAuth()
  const [app, setApp] = useState(null)
  const [loading, setLoading] = useState(false)
  const [elements, setElements] = useState([])
  const [searchForm] = Form.useForm()

  // 数据列表
  const [list, setList] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)

  // 表格密度 & 列可见性（列键随动态列表字段派生）
  const [tableSize, setTableSize] = useState('default')
  const [visibleCols, setVisibleCols] = useState([])

  // 详情 Drawer
  const [detailVisible, setDetailVisible] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailData, setDetailData] = useState(null)

  // 从菜单树中查找当前路径对应的菜单项（获取 link_app）
  const menuItem = useMemo(() => {
    const walk = (list) => {
      for (const m of list || []) {
        if (m.path === location.pathname) return m
        if (m.children) {
          const found = walk(m.children)
          if (found) return found
        }
      }
      return null
    }
    return walk(menus)
  }, [menus, location.pathname])

  const linkApp = menuItem?.link_app

  // 按 link_app（应用 code）加载应用配置
  useEffect(() => {
    if (!linkApp) return
    let cancelled = false
    setLoading(true)
    setApp(null)
    applicationApi
      .getApplicationByCode(linkApp)
      .then((res) => {
        if (!cancelled) setApp(res.data)
      })
      .catch(() => {
        if (!cancelled) setApp(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [linkApp])

  // 加载应用关联的表单元素配置（用于搜索区 / 表格列 / 详情字段映射）
  useEffect(() => {
    if (!app?.id) return
    let cancelled = false
    applicationApi
      .listFormElements(app.id, { page: 1, size: 9999 })
      .then((res) => {
        if (!cancelled) setElements(res.data?.list || [])
      })
      .catch(() => {
        if (!cancelled) setElements([])
      })
    return () => {
      cancelled = true
    }
  }, [app?.id])

  // 搜索字段：visibility.search = 1
  const searchFields = useMemo(
    () => (elements || []).filter((el) => el.visibility?.search === 1),
    [elements],
  )

  // 列表字段：visibility.list = 1
  const listFields = useMemo(
    () => (elements || []).filter((el) => el.visibility?.list === 1),
    [elements],
  )

  // 动态列键集合（列表字段 field_key + 固定操作列）
  const allColKeys = useMemo(
    () => [...(listFields || []).map((el) => el.field_key), 'action'],
    [listFields],
  )

  // 列表字段加载完成后初始化列可见性（键集合变化时同步重置）
  useEffect(() => {
    setVisibleCols(allColKeys)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allColKeys.join(',')])

  // 通用数据列表查询（搜索条件以 field_key 作为参数名传给后端）
  const fetchData = useCallback(
    async (targetPage = 1, extra = {}, targetSize = DEFAULT_PAGE_SIZE) => {
      if (!app?.id) return
      setLoading(true)
      try {
        const res = await applicationApi.listApplicationData(app.id, {
          page: targetPage,
          size: targetSize,
          table_name: app.table_name,
          ...extra,
        })
        setList(res.data?.list || [])
        setTotal(res.data?.total || 0)
        setPage(targetPage)
      } catch (e) {
        setList([])
        setTotal(0)
        Message.error('数据加载失败，请确认后端数据接口已实现')
      } finally {
        setLoading(false)
      }
    },
    [app?.id, app?.table_name],
  )

  // 应用切换后拉取列表数据
  useEffect(() => {
    fetchData(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app?.id, app?.table_name])

  // 搜索：手动点击才触发接口调用
  const handleSearch = () => {
    const values = searchForm.getFieldsValue()
    const cleaned = Object.fromEntries(
      Object.entries(values).filter(([, v]) => v !== undefined && v !== null && v !== ''),
    )
    fetchData(1, cleaned, pageSize)
  }

  // 重置：清空搜索条件并刷新列表
  const handleReset = () => {
    searchForm.resetFields()
    fetchData(1, {}, pageSize)
  }

  // 打开详情：先以主表行数据渲染，再尝试拉取详情接口（含子表数据）
  const openDetail = async (row) => {
    if (!app?.id) return
    setDetailVisible(true)
    setDetailData(row)
    setDetailLoading(true)
    try {
      const res = await applicationApi.getApplicationDataDetail(app.id, row.id, {
        table_name: app.table_name,
      })
      setDetailData(res.data || row)
    } catch (e) {
      // 详情接口未实现时回退为主表行数据
      Message.warning('详情数据接口暂不可用，已展示列表数据')
    } finally {
      setDetailLoading(false)
    }
  }

  // 表格列：visibility.list=1 的字段 + 固定操作列（详情按钮）
  const columns = useMemo(() => {
    const cols = (listFields || []).map((el) => ({
      key: el.field_key,
      title: el.label,
      dataIndex: el.field_key,
      render: (value) => formatValue(el, value),
    }))
    cols.push({
      key: 'action',
      title: '操作',
      dataIndex: 'operation',
      width: 90,
      render: (_, row) => (
        <Button size="mini" type="text" onClick={() => openDetail(row)}>
          详情
        </Button>
      ),
    })
    return cols
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listFields])

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

  // 列设置弹层内容（操作列不在列设置中展示，始终显示）
  const colSettingsPopover = (
    <Checkbox.Group value={visibleCols} onChange={setVisibleCols} direction="vertical">
      {allColKeys.map((k) => {
        const col = columns.find((c) => c.key === k)
        return (
          <Checkbox key={k} value={k}>
            {col?.title || k}
          </Checkbox>
        )
      })}
    </Checkbox.Group>
  )

  // 操作列固定显示，其余按 visibleCols 过滤
  const visibleColumns = columns.filter((c) => c.key === 'action' || visibleCols.includes(c.key))

  // 菜单加载完成前显示加载中，避免误判为 404
  if (!menusLoaded) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spin />
      </div>
    )
  }

  // 非动态菜单路径（无匹配菜单或未关联应用）→ 404
  if (!menuItem || !linkApp) {
    return <NotFound />
  }

  // 解析详情页布局 JSON（{ formConfig, elements } 结构）
  let detailLayout = null
  try {
    const raw = app?.detail_layout_json
    detailLayout = raw ? { elements: Array.isArray(raw.elements) ? raw.elements : [] } : null
  } catch (e) {
    detailLayout = null
  }

  // 按详情布局渲染：divider → 分割线；table → 子表数据表格；常规字段 → label + 值
  const renderDetailContent = () => {
    if (!detailLayout?.elements?.length) {
      return <Empty description="暂无详情布局配置" />
    }
    return (
      <div className="flex flex-wrap">
        {detailLayout.elements.map((el, index) => {
          const key = el.id || `detail_el_${index}`
          if (el.element_type === 'divider') {
            return (
              <div className="w-full" key={key}>
                {el.text ? (
                  <Divider orientation={el.orientation || 'center'}>{el.text}</Divider>
                ) : (
                  <Divider />
                )}
              </div>
            )
          }
          if (el.element_type === 'table') {
            const cols = (el.columns || []).map((c, i) => ({
              title: c.title || c.dataIndex || `列${i + 1}`,
              dataIndex: c.dataIndex || `col_${i + 1}`,
            }))
            const data = Array.isArray(detailData?.[el.table_key]) ? detailData[el.table_key] : []
            return (
              <div className="w-full" key={key}>
                <div className="mb-1 text-sm text-gray-600">{el.label || '子表数据'}</div>
                <Table size="small" border pagination={false} columns={cols} data={data} />
              </div>
            )
          }
          const fieldKey = resolveFieldKey(el, elements)
          return (
            <div
              className="flex flex-col gap-1 px-2 py-2"
              style={{ width: `${((el.width || 24) / 24) * 100}%` }}
              key={key}
            >
              <div className="text-sm text-gray-500">{el.label}</div>
              <div className="text-sm text-gray-800">
                {formatValue(el, fieldKey ? detailData?.[fieldKey] : undefined)}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <>
      <Card title={menuItem.name}>
        {/* 搜索区域：visibility.search = 1 的字段 */}
        {searchFields.length > 0 && (
          <div className="mb-3">
            <Form layout="inline" form={searchForm}>
              <Space wrap>
                {searchFields.map((el, index) => (
                  <FormItem
                    key={el.id || el.field_key || `search_${index}`}
                    label={el.label}
                    field={el.field_key}
                    className="mb-0!"
                  >
                    {renderSearchControl(el)}
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

        {/* 表格工具栏 */}
        <div className="mb-3 flex items-center justify-end">
          <Space>
            <Button size="mini" icon={<IconRefresh />} onClick={() => fetchData(1, {}, pageSize)}>
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

        {/* 数据表格：visibility.list = 1 的字段 */}
        {listFields.length ? (
          <Table
            rowKey="id"
            columns={visibleColumns}
            data={list}
            loading={loading}
            size={tableSize}
            pagination={{
              current: page,
              pageSize,
              total,
              showTotal: true,
              sizeCanChange: true,
              onChange: (p, s) => {
                setPage(p)
                setPageSize(s)
                fetchData(p, {}, s)
              },
            }}
          />
        ) : (
          <Empty description="未配置列表展示字段（visibility.list）" />
        )}
      </Card>

      {/* 详情弹窗：按详情页布局配置渲染 */}
      <Drawer
        width={560}
        visible={detailVisible}
        onCancel={() => setDetailVisible(false)}
        footer={null}
        title={`${menuItem.name} - 详情`}
      >
        {detailLoading ? (
          <div className="flex h-40 items-center justify-center">
            <Spin />
          </div>
        ) : (
          renderDetailContent()
        )}
      </Drawer>
    </>
  )
}
