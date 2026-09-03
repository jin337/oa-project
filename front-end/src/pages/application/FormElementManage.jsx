import {
  Button,
  Card,
  Checkbox,
  Divider,
  Drawer,
  Dropdown,
  Form,
  Grid,
  Input,
  Menu,
  Message,
  Popconfirm,
  Popover,
  Select,
  Space,
  Switch,
  Table,
  Tag,
} from '@arco-design/web-react'
import { IconList, IconPlus, IconRefresh, IconSettings } from '@arco-design/web-react/icon'
import { useCallback, useEffect, useState } from 'react'
import { useLocation, useParams } from 'react-router-dom'
import * as applicationApi from '../../api/application'
import { useTabs } from '../../store/tab-context'

const FormItem = Form.Item
const Row = Grid.Row
const Col = Grid.Col
const MenuItem = Menu.Item

const MODULE_LABEL = '表单元素'

// 可配置列 key（操作列固定显示，不参与列设置）
const ALL_COL_KEYS = [
  'label',
  'field_key',
  'table_key',
  'element_type',
  'default_value',
  'required',
  'vis_list',
  'vis_search',
]

// 表格密度选项
const SIZE_OPTIONS = [
  { label: '默认', value: 'default' },
  { label: '中等', value: 'middle' },
  { label: '紧凑', value: 'small' },
  { label: '迷你', value: 'mini' },
]

// 元素类型选项
const ELEMENT_TYPES = [
  'input',
  'textarea',
  'number',
  'select',
  'radio',
  'checkbox',
  'datepicker',
  'timepicker',
  'switch',
  'upload',
]

const EMPTY_FORM = {
  label: '',
  field_key: undefined,
  table_key: undefined,
  element_type: undefined,
  placeholder: '',
  required: false,
  default_value: '',
  vis_list: true,
  vis_search: false,
  dynamic_states: '',
  data_source: '',
  actions: '',
}

// 布尔值渲染为 Tag
function BoolTag({ value, yesText = '是', noText = '否' }) {
  return value ? <Tag color="green">{yesText}</Tag> : <Tag color="gray">{noText}</Tag>
}

// JSON 字符串校验
function validateJson(value, cb) {
  if (!value) return cb()
  try {
    JSON.parse(value)
    cb()
  } catch (e) {
    cb('JSON 格式错误：' + e.message)
  }
}

// 安全 JSON 字符串化（用于编辑回填）
function safeStringify(obj) {
  if (!obj || Object.keys(obj).length === 0) return ''
  try {
    return JSON.stringify(obj, null, 2)
  } catch {
    return ''
  }
}

export default function FormElementManage() {
  const location = useLocation()
  const { id } = useParams()
  const { tabs, activeTab, addTab, updateTab } = useTabs()

  // 列表与分页
  const [list, setList] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(10)
  const [loading, setLoading] = useState(false)

  // 草稿筛选条件 + 已生效条件（禁止自动触发，手动搜索）
  const [keyword, setKeyword] = useState('')
  const [appliedKeyword, setAppliedKeyword] = useState('')

  // 表格密度 & 列可见性
  const [tableSize, setTableSize] = useState('default')
  const [visibleCols, setVisibleCols] = useState(ALL_COL_KEYS)

  // 抽屉
  const [drawerVisible, setDrawerVisible] = useState(false)
  const [editing, setEditing] = useState(null)
  const [saving, setSaving] = useState(false)
  const [form] = Form.useForm()

  // 级联选项：表列表 & 字段列表
  const [tableOptions, setTableOptions] = useState([])
  const [fieldOptions, setFieldOptions] = useState([])
  const [loadingFields, setLoadingFields] = useState(false)

  // 挂载时确保页签存在，并通过接口获取应用名后更新标题为「应用名 - 模块名」
  useEffect(() => {
    addTab({ path: location.pathname, title: MODULE_LABEL })
    let cancelled = false
    applicationApi
      .getApplication(id)
      .then((res) => {
        if (!cancelled && res.data?.name) {
          updateTab(location.pathname, { title: `${res.data.name} - ${MODULE_LABEL}` })
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [id, location.pathname, addTab, updateTab])

  // Card 标题与当前激活页签标题保持一致
  const currentTab = tabs.find((t) => t.path === activeTab)
  const cardTitle = currentTab?.title || MODULE_LABEL

  const fetchList = useCallback(
    async (p = page, s = size) => {
      setLoading(true)
      try {
        const params = { page: p, size: s }
        if (appliedKeyword) params.keyword = appliedKeyword
        const res = await applicationApi.listFormElements(id, params)
        setList(res.data.list || [])
        setTotal(res.data.total || 0)
      } catch (e) {
        // 错误已在请求层提示
      } finally {
        setLoading(false)
      }
    },
    [id, page, size, appliedKeyword],
  )

  useEffect(() => {
    fetchList()
  }, [page, size, fetchList])

  // 搜索：生效当前草稿条件，回到第一页
  const handleSearch = () => {
    setAppliedKeyword(keyword)
    setPage(1)
  }

  // 重置：清空草稿与已生效条件，回到第一页并刷新
  const handleReset = () => {
    setKeyword('')
    setAppliedKeyword('')
    setPage(1)
  }

  // 加载分类（表名）选项：主表 + 子表
  const loadTableOptions = useCallback(async () => {
    try {
      const res = await applicationApi.getApplication(id)
      const app = res.data
      const options = []
      if (app?.table_name) {
        options.push({ label: `${app.table_name}（主表）`, value: app.table_name })
      }
      if (app?.sub_table_name) {
        app.sub_table_name
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
          .forEach((t) => options.push({ label: `${t}（子表）`, value: t }))
      }
      setTableOptions(options)
      return app
    } catch (e) {
      return null
    }
  }, [id])

  // 加载指定表的所有字段（取消分页限制）
  const loadFieldOptions = useCallback(
    async (tableName) => {
      if (!tableName) {
        setFieldOptions([])
        return
      }
      setLoadingFields(true)
      try {
        const res = await applicationApi.listTableFields(id, { page: 1, size: 9999 }, tableName)
        setFieldOptions(res.data.list || [])
      } catch (e) {
        setFieldOptions([])
      } finally {
        setLoadingFields(false)
      }
    },
    [id],
  )

  // 分类变化：重置字段与名称，加载新字段列表
  const handleTableChange = (tableName) => {
    form.setFieldsValue({ field_key: undefined, label: '' })
    setFieldOptions([])
    loadFieldOptions(tableName)
  }

  // 字段变化：自动用字段注释填充名称（仍可手动修改）
  const handleFieldChange = (fieldKey) => {
    const field = fieldOptions.find((f) => f.name === fieldKey)
    if (field?.comment) {
      form.setFieldsValue({ label: field.comment })
    }
  }

  const openCreate = async () => {
    setEditing(null)
    form.setFieldsValue(EMPTY_FORM)
    setFieldOptions([])
    const app = await loadTableOptions()
    if (app?.table_name) {
      form.setFieldsValue({ table_key: app.table_name })
      await loadFieldOptions(app.table_name)
    }
    setDrawerVisible(true)
  }

  const openEdit = async (record) => {
    setEditing(record)
    setFieldOptions([])
    await loadTableOptions()
    form.setFieldsValue({
      label: record.label || '',
      field_key: record.field_key,
      table_key: record.table_key,
      element_type: record.element_type,
      placeholder: record.placeholder || '',
      required: Boolean(record.required),
      default_value: record.default_value || '',
      vis_list: record.visibility?.list ?? true,
      vis_search: record.visibility?.search ?? false,
      dynamic_states: safeStringify(record.dynamic_states),
      data_source: safeStringify(record.data_source),
      actions: safeStringify(record.actions),
    })
    if (record.table_key) {
      await loadFieldOptions(record.table_key)
    }
    setDrawerVisible(true)
  }

  const handleSave = async () => {
    const values = await form.validate()
    // 组装完整数据结构
    const payload = {
      label: values.label,
      field_key: values.field_key,
      table_key: values.table_key,
      element_type: values.element_type,
      placeholder: values.placeholder,
      required: values.required ? 1 : 0,
      default_value: values.default_value,
      visibility: {
        list: values.vis_list ? 1 : 0,
        search: values.vis_search ? 1 : 0,
      },
      dynamic_states: values.dynamic_states ? JSON.parse(values.dynamic_states) : {},
      data_source: values.data_source ? JSON.parse(values.data_source) : {},
      actions: values.actions ? JSON.parse(values.actions) : {},
    }
    setSaving(true)
    try {
      if (editing) {
        await applicationApi.updateFormElement(id, editing.id, payload)
        Message.success('保存成功')
      } else {
        await applicationApi.createFormElement(id, payload)
        Message.success('创建成功')
      }
      setDrawerVisible(false)
      fetchList()
    } catch (e) {
      // 错误已在请求层提示
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (record) => {
    try {
      await applicationApi.deleteFormElement(id, record.id)
      Message.success('删除成功')
      fetchList()
    } catch (e) {
      // 错误已在请求层提示
    }
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
    { key: 'label', title: '名称', dataIndex: 'label' },
    { key: 'field_key', title: '对应字段', dataIndex: 'field_key' },
    {
      key: 'table_key',
      title: '字段分类',
      dataIndex: 'table_key',
      render: (v) => (v ? <Tag color="arcoblue">{v}</Tag> : '-'),
    },
    { key: 'element_type', title: '元素类型', dataIndex: 'element_type' },
    {
      key: 'default_value',
      title: '默认值',
      dataIndex: 'default_value',
      render: (v) => (v === '' || v === null || v === undefined ? '-' : String(v)),
    },
    {
      key: 'required',
      title: '必填',
      dataIndex: 'required',
      width: 90,
      align: 'center',
      render: (v) => <BoolTag value={Boolean(v)} />,
    },
    {
      key: 'vis_list',
      title: '列表列',
      dataIndex: 'visibility',
      width: 90,
      align: 'center',
      render: (v) => <BoolTag value={Boolean(v?.list)} />,
    },
    {
      key: 'vis_search',
      title: '搜索项',
      dataIndex: 'visibility',
      width: 90,
      align: 'center',
      render: (v) => <BoolTag value={Boolean(v?.search)} />,
    },
    {
      key: 'action',
      title: '操作',
      width: 140,
      render: (_, record) => (
        <Space>
          <Button size="mini" onClick={() => openEdit(record)}>
            编辑
          </Button>
          <Popconfirm position="rb" focusLock title="确认删除该表单元素？" onOk={() => handleDelete(record)}>
            <Button size="mini" status="danger">
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
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

  // 操作列固定显示，其余按 visibleCols 过滤
  const visibleColumns = columns.filter((c) => c.key === 'action' || visibleCols.includes(c.key))

  return (
    <Card title={cardTitle}>
      {/* 搜索区域 */}
      <div className="mb-3">
        <Space wrap>
          <Input
            className="w-55!"
            placeholder="按名称或字段搜索"
            allowClear
            value={keyword}
            onChange={setKeyword}
            onPressEnter={handleSearch}
          />
          <Button type="primary" onClick={handleSearch}>
            搜索
          </Button>
          <Button onClick={handleReset}>重置</Button>
        </Space>
      </div>

      {/* 表格工具栏 */}
      <div className="mb-3 flex items-center justify-between">
        <Button type="primary" icon={<IconPlus />} onClick={openCreate}>
          新增元素
        </Button>
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

      {/* 新增/编辑抽屉 */}
      <Drawer
        title={editing ? '编辑表单元素' : '新增表单元素'}
        visible={drawerVisible}
        width="50%"
        onOk={handleSave}
        confirmLoading={saving}
        onCancel={() => setDrawerVisible(false)}
        unmountOnExit
      >
        <Form form={form} layout="vertical" autoComplete="off">
          <Row gutter={20}>
            {/* 字段分类 */}
            <Col span={12}>
              <FormItem
                label="字段分类"
                field="table_key"
                rules={[{ required: true, message: '请选择字段分类' }]}
              >
                <Select
                  placeholder="请选择数据表"
                  options={tableOptions}
                  onChange={handleTableChange}
                />
              </FormItem>
            </Col>
            {/* 对应字段（级联：选中表的所有字段） */}
            <Col span={12}>
              <FormItem
                label="对应字段"
                field="field_key"
                rules={[{ required: true, message: '请选择对应字段' }]}
              >
                <Select
                  placeholder="请选择字段"
                  loading={loadingFields}
                  onChange={handleFieldChange}
                  showSearch
                  filterOption={(inputValue, option) =>
                    option.value.toLowerCase().includes(inputValue.toLowerCase())
                  }
                >
                  {fieldOptions.map((f) => (
                    <Select.Option key={f.name} value={f.name}>
                      {f.name}
                      {f.comment ? `（${f.comment}）` : ''}
                    </Select.Option>
                  ))}
                </Select>
              </FormItem>
            </Col>
            {/* 名称（自动填充字段注释，可手动修改） */}
            <Col span={12}>
              <FormItem
                label="名称"
                field="label"
                rules={[
                  { required: true, message: '请输入名称' },
                  { minLength: 1, maxLength: 64, message: '长度 1-64 个字符' },
                ]}
              >
                <Input placeholder="选择字段后自动填充注释，可手动修改" />
              </FormItem>
            </Col>
            <Col span={12}>
              <FormItem
                label="元素类型"
                field="element_type"
                rules={[{ required: true, message: '请选择元素类型' }]}
              >
                <Select placeholder="请选择类型" allowClear>
                  {ELEMENT_TYPES.map((t) => (
                    <Select.Option key={t} value={t}>
                      {t}
                    </Select.Option>
                  ))}
                </Select>
              </FormItem>
            </Col>
            <Col span={12}>
              <FormItem label="占位提示" field="placeholder">
                <Input placeholder="如：请输入或选择" />
              </FormItem>
            </Col>
            <Col span={12}>
              <FormItem label="默认值" field="default_value">
                <Input placeholder="支持表达式，如 ${current_user.name}" />
              </FormItem>
            </Col>
            <Col span={12}>
              <FormItem label="是否必填" field="required" triggerPropName="checked">
                <Switch />
              </FormItem>
            </Col>
            <Col span={12}>
              <FormItem label="列表列显示" field="vis_list" triggerPropName="checked">
                <Switch />
              </FormItem>
            </Col>
            <Col span={12}>
              <FormItem label="搜索项显示" field="vis_search" triggerPropName="checked">
                <Switch />
              </FormItem>
            </Col>
          </Row>

          {/* 高级配置：JSON 结构 */}
          <Divider orientation="left">高级配置（JSON）</Divider>

          <FormItem
            label="动态状态控制（dynamic_states）"
            field="dynamic_states"
            rules={[{ validator: validateJson }]}
            extra='支持 visible_if / disabled_if / required_if 表达式，如 {"visible_if":"${form.department}===\"IT\""}'
          >
            <Input.TextArea
              placeholder='{"visible_if":"...","disabled_if":"...","required_if":"..."}'
              autoSize={{ minRows: 3, maxRows: 8 }}
              style={{ fontFamily: 'monospace' }}
            />
          </FormItem>

          <FormItem
            label="数据源配置（data_source）"
            field="data_source"
            rules={[{ validator: validateJson }]}
            extra="type: json(静态 options) / api(动态)，支持 url / method / label / value 表达式"
          >
            <Input.TextArea
              placeholder='{"type":"api","url":"/api/user/list","method":"GET","label":"...","value":"..."}'
              autoSize={{ minRows: 3, maxRows: 8 }}
              style={{ fontFamily: 'monospace' }}
            />
          </FormItem>

          <FormItem
            label="事件驱动与联动（actions）"
            field="actions"
            rules={[{ validator: validateJson }]}
            extra="支持 on_mount / on_change / on_blur 事件，配置 action_type 及联动参数"
          >
            <Input.TextArea
              placeholder='{"on_mount":[...],"on_change":[...],"on_blur":[...]}'
              autoSize={{ minRows: 3, maxRows: 8 }}
              style={{ fontFamily: 'monospace' }}
            />
          </FormItem>
        </Form>
      </Drawer>
    </Card>
  )
}
