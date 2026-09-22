import {
  Button,
  Card,
  Checkbox,
  Collapse,
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
  Table,
  Tag,
} from '@arco-design/web-react'
import { IconList, IconPlus, IconRefresh, IconSettings } from '@arco-design/web-react/icon'
import { useCallback, useEffect, useState } from 'react'
import { useLocation, useParams } from 'react-router-dom'
import * as applicationApi from 'src/api/application'
import { SIZE_OPTIONS } from 'src/config/app'
import { ELEMENT_TYPE_OPTIONS } from 'src/config/app.js'
import { useTabs } from 'src/store/tab-context'

const FormItem = Form.Item
const Row = Grid.Row
const Col = Grid.Col
const MenuItem = Menu.Item
const CollapseItem = Collapse.Item

const MODULE_LABEL = '表单元素'

// 可配置列 key（操作列固定显示，不参与列设置）
const ALL_COL_KEYS = [
  'index',
  'label',
  'field_key',
  'table_key',
  'element_type',
  'default_value',
  'data_source',
  'required',
  'vis_list',
  'vis_search',
]
const EMPTY_FORM = {
  label: '',
  field_key: undefined,
  table_key: undefined,
  element_type: undefined,
  placeholder: '',
  required: false,
  default_value: '',
  validation_rule: '',
  validation_message: '',
  vis_list: true,
  vis_search: false,
  disabled_if: '',
  visible_if: '',
  data_source: {},
  actions: { on_mount: [], on_change: [], on_blur: [] },
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

// 事件触发时机配置
const ACTION_TRIGGERS = [
  { key: 'on_change', label: '值改变触发' },
  { key: 'on_mount', label: '初始化触发' },
  { key: 'on_blur', label: '失焦触发' },
]

// Action 类型选项
const ACTION_TYPE_OPTIONS = [
  { value: 'set_value', label: '直接赋值' },
  { value: 'fetch_and_fill', label: '请求并填充' },
]

const ACTION_TRIGGER_KEYS = ['on_mount', 'on_change', 'on_blur']

// 后端 actions 对象 -> 表单结构（params 对象反序列化为 JSON 字符串）
function normalizeActionsForForm(actions) {
  const result = { on_mount: [], on_change: [], on_blur: [] }
  for (const t of ACTION_TRIGGER_KEYS) {
    const list = Array.isArray(actions?.[t]) ? actions[t] : []
    result[t] = list.map((a) => {
      const item = { ...a }
      item.params =
        item.params && typeof item.params === 'object' ? JSON.stringify(item.params, null, 2) : ''
      if (!Array.isArray(item.target_mapping)) item.target_mapping = []
      if (a.action_type === 'set_value') {
        if (Array.isArray(a.value)) {
          item.value = a.value.map((v) => ({ ...v }))
        } else {
          item.value = []
        }
      }
      return item
    })
  }
  return result
}

// 表单 actions 结构 -> 后端对象（按 action_type 只保留对应字段，过滤空项）
function buildActionsFromValues(actions) {
  const result = {}
  for (const t of ACTION_TRIGGER_KEYS) {
    const list = Array.isArray(actions?.[t]) ? actions[t] : []
    const cleaned = list
      .filter((a) => a && a.action_type)
      .map((a) => {
        const item = { action_type: a.action_type }
        if (a.action_type === 'set_value') {
          const value = (Array.isArray(a.value) ? a.value : [])
            .filter((v) => v && (v.source || v.target))
            .map((v) => ({ source: v.source || '', target: v.target || '' }))
          if (value.length) item.value = value
        } else if (a.action_type === 'fetch_and_fill') {
          if (a.api_url) item.api_url = a.api_url
          if (a.method) item.method = a.method
          if (a.params && String(a.params).trim()) {
            try {
              item.params = JSON.parse(a.params)
            } catch (e) {
              // 校验失败忽略
            }
          }
          const tm = (Array.isArray(a.target_mapping) ? a.target_mapping : [])
            .filter((m) => m && (m.source || m.target))
            .map((m) => ({ source: m.source || '', target: m.target || '' }))
          if (tm.length) item.target_mapping = tm
        }
        return item
      })
      .filter((a) => Object.keys(a).length > 1) // 至少含 action_type + 一个配置字段
    if (cleaned.length) result[t] = cleaned
  }
  return result
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

  // 当前选中的元素类型（用于联动控制 placeholder / data_source 的显隐）
  const [currentElementType, setCurrentElementType] = useState()
  // 数据源类型（json / api）：使用 Form.useWatch 直接监听嵌套字段，避免 onValuesChange 扁平 key 问题
  const dataSourceType = Form.useWatch('data_source.type', form)
  // 事件驱动 actions：监听整个对象以联动渲染每条规则的 action_type 分支
  const actionsWatch = Form.useWatch('actions', form)

  // 事件面板默认展开：有规则的分区展开，无规则时全部展开
  const defaultActiveKey = (() => {
    const withRules = ACTION_TRIGGER_KEYS.filter((k) => (actionsWatch?.[k] || []).length > 0)
    return withRules.length ? withRules : ACTION_TRIGGER_KEYS
  })()

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

  // 当前元素类型的配置元数据（用于联动控制 data_source 显隐）
  const typeConfig = ELEMENT_TYPE_OPTIONS.find((o) => o.value === currentElementType)
  const showDataSource = typeConfig ? typeConfig.needDataSource : false

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

  // 数据源类型切换：清理另一类型的冗余字段，避免提交无效数据
  const handleDataSourceTypeChange = (type) => {
    if (type === 'json') {
      form.setFieldsValue({
        data_source: {
          type: 'json',
          options: [],
          url: '',
          method: undefined,
          label: '',
        },
      })
    } else if (type === 'api') {
      form.setFieldsValue({
        data_source: {
          type: 'api',
          options: [],
          url: '',
          method: 'GET',
          label: '',
          params: '',
        },
      })
    }
  }

  const openCreate = async () => {
    setEditing(null)
    setCurrentElementType(undefined)
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
    setCurrentElementType(record.element_type)
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
      validation_rule: record.validation_rule || '',
      validation_message: record.validation_message || '',
      vis_list: record.visibility?.list ?? true,
      vis_search: record.visibility?.search ?? false,
      disabled_if: record.dynamic_states?.disabled_if || '',
      visible_if: record.dynamic_states?.visible_if || '',
      data_source: {
        ...(record.data_source || {}),
        // params 为对象结构，回填时反序列化为 JSON 字符串供 TextArea 展示
        params: safeStringify(record.data_source?.params),
      },
      actions: normalizeActionsForForm(record.actions),
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
      validation_rule: values.validation_rule || '',
      validation_message: values.validation_message || '',
      visibility: {
        list: values.vis_list ? 1 : 0,
        search: values.vis_search ? 1 : 0,
      },
      dynamic_states: Object.fromEntries(
        Object.entries({
          disabled_if: values.disabled_if,
          visible_if: values.visible_if,
        }).filter(([, v]) => v && String(v).trim() !== ''),
      ),
      // 数据源：按类型组装，过滤空值，避免提交冗余字段
      data_source: (() => {
        const ds = values.data_source || {}
        if (ds.type === 'json') {
          const options = (ds.options || []).filter((o) => o?.label || o?.value)
          return options.length ? { type: 'json', options } : {}
        }
        if (ds.type === 'api') {
          let params = {}
          if (ds.params && String(ds.params).trim()) {
            try {
              params = JSON.parse(ds.params)
            } catch (e) {
              // params 为 JSON 字符串输入，校验失败时保持空对象
            }
          }
          return {
            type: 'api',
            url: ds.url || '',
            method: ds.method || 'GET',
            label: ds.label || '',
            value_field: ds.value_field || '',
            params,
          }
        }
        return {}
      })(),
      actions: buildActionsFromValues(values.actions),
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
    {
      key: 'index',
      title: '序号',
      dataIndex: 'index',
      width: 62,
      align: 'center',
      render: (_, __, index) => index + 1,
    },
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
      key: 'data_source',
      title: '数据源',
      dataIndex: 'data_source.type',
      width: 80,
      align: 'center',
      render: (v) => (v ? <Tag color="arcoblue">{v === 'json' ? '静态' : '动态'}</Tag> : '-'),
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
          <Popconfirm
            position="lb"
            focusLock
            title="确认删除该表单元素？"
            onOk={() => handleDelete(record)}
          >
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
        width="55%"
        onOk={handleSave}
        confirmLoading={saving}
        onCancel={() => setDrawerVisible(false)}
        unmountOnExit
      >
        <Form
          form={form}
          layout="vertical"
          autoComplete="off"
          onValuesChange={(changedValues) => {
            if ('element_type' in changedValues) {
              const val = changedValues.element_type
              setCurrentElementType(val)
              const cfg = ELEMENT_TYPE_OPTIONS.find((o) => o.value === val)
              if (cfg && !cfg.needDataSource) {
                form.setFieldsValue({ data_source: {} })
              }
            }
          }}
        >
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
                <Select placeholder="请选择类型" allowClear options={ELEMENT_TYPE_OPTIONS} />
              </FormItem>
            </Col>
            <Col span={12}>
              <FormItem label="默认值" field="default_value">
                <Input placeholder="支持表达式，如 ${form.id}-${form.name}" />
              </FormItem>
            </Col>
            <Col span={12}>
              <FormItem label="占位提示" field="placeholder">
                <Input placeholder="如：请输入或选择" />
              </FormItem>
            </Col>
            <Col span={24}>
              <FormItem label="校验规则" field="validation_rule">
                <Input placeholder="支持表达式，如 /^1[3-9]\d{9}$/ 或 ${form.end_date} > ${form.start_date}" />
              </FormItem>
              <FormItem label="错误提示" field="validation_message">
                <Input placeholder="留空时使用默认提示（如：手机号格式不正确 / 手机号校验不通过）" />
              </FormItem>
            </Col>
            <Col span={24} className={'[&_.arco-checkbox]:mr-4 [&_.arco-checkbox]:pl-0!'}>
              <FormItem field="required" triggerPropName="checked" noStyle>
                <Checkbox>是否必填</Checkbox>
              </FormItem>
              <FormItem field="vis_list" triggerPropName="checked" noStyle>
                <Checkbox>列表列显示</Checkbox>
              </FormItem>
              <FormItem field="vis_search" triggerPropName="checked" noStyle>
                <Checkbox>搜索项显示</Checkbox>
              </FormItem>
            </Col>
          </Row>

          <Divider>动态状态控制</Divider>

          {/* 动态状态控制：拆解为 3 个独立表达式输入框 */}
          <FormItem label="动态显隐" field="visible_if">
            <Input.TextArea
              autoSize={{ minRows: 1, maxRows: 5 }}
              placeholder='支持表达式，如 ${form.country_id} === "CN"'
            />
          </FormItem>

          <FormItem label="动态禁用/只读" field="disabled_if">
            <Input.TextArea
              autoSize={{ minRows: 1, maxRows: 5 }}
              placeholder='支持表达式，如 ${form.user_id}===""'
            />
          </FormItem>

          {showDataSource && (
            <>
              <Divider>数据源配置</Divider>
              <Row gutter={20}>
                <Col span={24}>
                  <FormItem
                    label="数据类型"
                    field="data_source.type"
                    rules={[{ required: true, message: '请选择数据类型' }]}
                  >
                    <Select placeholder="请选择" onChange={handleDataSourceTypeChange}>
                      <Select.Option value="json">静态数据</Select.Option>
                      <Select.Option value="api">动态接口</Select.Option>
                    </Select>
                  </FormItem>
                </Col>
              </Row>
              {/* 静态数据：选项列表，支持动态增删 */}
              {dataSourceType === 'json' && (
                <Form.List field="data_source.options">
                  {(fields, { add, remove }) => (
                    <div>
                      {fields.length > 0 && (
                        <div className="mb-3 rounded border border-gray-200 bg-white p-3">
                          {fields.map((item, index) => (
                            <div
                              key={item.key}
                              className={`${index === 0 ? '' : 'mt-2'} flex items-center gap-2`}
                            >
                              <FormItem
                                field={item.field + '.label'}
                                noStyle
                                className="mb-0! flex-1"
                              >
                                <Input placeholder="显示标签，如：男" />
                              </FormItem>
                              <FormItem
                                field={item.field + '.value'}
                                noStyle
                                className="mb-0! flex-1"
                              >
                                <Input placeholder="提交值，如：1" />
                              </FormItem>
                              <Button status="danger" onClick={() => remove(index)}>
                                删除
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                      <Button type="outline" onClick={() => add({ label: '', value: '' })}>
                        + 添加选项
                      </Button>
                    </div>
                  )}
                </Form.List>
              )}

              {/* 动态接口：url / method / params / label / value 表达式 */}
              {dataSourceType === 'api' && (
                <Row gutter={20}>
                  <Col span={16}>
                    <FormItem
                      label="接口地址"
                      field="data_source.url"
                      rules={[{ required: true, message: '请输入接口地址' }]}
                    >
                      <Input placeholder="/user/list" />
                    </FormItem>
                  </Col>
                  <Col span={8}>
                    <FormItem label="请求方法" field="data_source.method">
                      <Select>
                        <Select.Option value="GET">GET</Select.Option>
                        <Select.Option value="POST">POST</Select.Option>
                        <Select.Option value="PUT">PUT</Select.Option>
                        <Select.Option value="DELETE">DELETE</Select.Option>
                      </Select>
                    </FormItem>
                  </Col>
                  <Col span={24}>
                    <FormItem
                      label="请求参数"
                      field="data_source.params"
                      rules={[{ validator: validateJson }]}
                    >
                      <Input.TextArea
                        placeholder='{"user_id":"${form.id}","page":1}'
                        autoSize={{ minRows: 1, maxRows: 5 }}
                      />
                    </FormItem>
                  </Col>
                  <Col span={12}>
                    <FormItem label="显示标签" field="data_source.label">
                      <Input placeholder="支持表达式，如 ${item.id}-${item.name}" />
                    </FormItem>
                  </Col>
                  <Col span={12}>
                    <FormItem label="对应值" field="data_source.value_field">
                      <Input placeholder="支持表达式，如 ${item.id}" />
                    </FormItem>
                  </Col>
                </Row>
              )}
            </>
          )}

          <Divider>事件驱动与联动</Divider>

          {/* 三个触发时机分区：on_mount / on_change / on_blur（折叠面板） */}
          <Collapse defaultActiveKey={defaultActiveKey} className="mb-4">
            {ACTION_TRIGGERS.map((trigger) => (
              <CollapseItem
                key={trigger.key}
                name={trigger.key}
                header={trigger.label}
                className={'[&_.arco-collapse-item-content-box]:pl-3.25!'}
              >
                <Form.List field={`actions.${trigger.key}`}>
                  {(fields, { add, remove }) => (
                    <>
                      {fields.length === 0 && (
                        <div className="mb-2 text-xs text-gray-400">暂无规则，点击下方按钮添加</div>
                      )}
                      {fields.map((item, index) => {
                        // 从 watch 结果获取当前规则的 action_type，联动显示对应配置字段
                        const actionType = actionsWatch?.[trigger.key]?.[index]?.action_type
                        return (
                          <div
                            key={item.key}
                            className="mb-3 rounded border border-gray-200 bg-white p-3"
                          >
                            <div className="mb-2 flex items-center justify-between">
                              <span className="text-xs font-medium text-gray-500">
                                规则 {index + 1}
                              </span>
                              <Button size="mini" status="danger" onClick={() => remove(index)}>
                                删除
                              </Button>
                            </div>
                            <FormItem
                              label="动作类型"
                              field={item.field + '.action_type'}
                              rules={[{ required: true, message: '请选择动作类型' }]}
                            >
                              <Select placeholder="请选择动作类型" options={ACTION_TYPE_OPTIONS} />
                            </FormItem>

                            {/* set_value：直接赋值（多字段映射） */}
                            {actionType === 'set_value' && (
                              <>
                                <div className="mb-2 text-gray-500">赋值映射</div>
                                <Form.List field={item.field + '.value'}>
                                  {(valueFields, { add: addValue, remove: removeValue }) => (
                                    <>
                                      {valueFields.map((vf, vfIndex) => (
                                        <div key={vf.key} className="mb-2 flex items-center gap-2">
                                          <FormItem
                                            field={vf.field + '.source'}
                                            noStyle
                                            className="mb-0! flex-1"
                                          >
                                            <Input placeholder="来源，如 user.city_name" />
                                          </FormItem>
                                          <span className="text-gray-400">→</span>
                                          <FormItem
                                            field={vf.field + '.target'}
                                            noStyle
                                            className="mb-0! flex-1"
                                          >
                                            <Input placeholder="目标，如 city_name" />
                                          </FormItem>
                                          <Button
                                            status="danger"
                                            onClick={() => removeValue(vfIndex)}
                                          >
                                            删除
                                          </Button>
                                        </div>
                                      ))}
                                      <Button
                                        size="small"
                                        type="outline"
                                        onClick={() => addValue({ source: '', target: '' })}
                                      >
                                        + 添加赋值映射
                                      </Button>
                                    </>
                                  )}
                                </Form.List>
                              </>
                            )}

                            {/* fetch_and_fill：请求并填充 */}
                            {actionType === 'fetch_and_fill' && (
                              <>
                                <Row gutter={16}>
                                  <Col span={16}>
                                    <FormItem
                                      label="接口地址"
                                      field={item.field + '.api_url'}
                                      rules={[{ required: true, message: '请输入接口地址' }]}
                                    >
                                      <Input placeholder="/user/salary-detail" />
                                    </FormItem>
                                  </Col>
                                  <Col span={8}>
                                    <FormItem
                                      label="请求方法"
                                      field={item.field + '.method'}
                                      rules={[{ required: true, message: '请选择请求方法' }]}
                                    >
                                      <Select>
                                        <Select.Option value="GET">GET</Select.Option>
                                        <Select.Option value="POST">POST</Select.Option>
                                        <Select.Option value="PUT">PUT</Select.Option>
                                        <Select.Option value="DELETE">DELETE</Select.Option>
                                      </Select>
                                    </FormItem>
                                  </Col>
                                  <Col span={24}>
                                    <FormItem
                                      label="请求参数"
                                      field={item.field + '.params'}
                                      rules={[{ validator: validateJson }]}
                                    >
                                      <Input.TextArea
                                        placeholder='{"user_id":"${form.user_id}"}'
                                        autoSize={{ minRows: 1, maxRows: 5 }}
                                      />
                                    </FormItem>
                                  </Col>
                                </Row>
                                <div className="mb-2 text-gray-500">目标字段</div>
                                <Form.List field={item.field + '.target_mapping'}>
                                  {(tmFields, { add: addTm, remove: removeTm }) => (
                                    <>
                                      {tmFields.map((tm, tmIndex) => (
                                        <div key={tm.key} className="mb-2 flex items-center gap-2">
                                          <FormItem
                                            field={tm.field + '.source'}
                                            noStyle
                                            className="mb-0! flex-1"
                                          >
                                            <Input placeholder="来源，如 user.city_name" />
                                          </FormItem>
                                          <span className="text-gray-400">→</span>
                                          <FormItem
                                            field={tm.field + '.target'}
                                            noStyle
                                            className="mb-0! flex-1"
                                          >
                                            <Input placeholder="目标，如 city_name" />
                                          </FormItem>
                                          <Button status="danger" onClick={() => removeTm(tmIndex)}>
                                            删除
                                          </Button>
                                        </div>
                                      ))}
                                      <Button
                                        size="small"
                                        type="outline"
                                        onClick={() => addTm({ source: '', target: '' })}
                                      >
                                        + 添加目标字段
                                      </Button>
                                    </>
                                  )}
                                </Form.List>
                              </>
                            )}
                          </div>
                        )
                      })}
                      <Button
                        size="small"
                        type="outline"
                        icon={<IconPlus />}
                        onClick={() => add({ action_type: undefined })}
                      >
                        添加规则
                      </Button>
                    </>
                  )}
                </Form.List>
              </CollapseItem>
            ))}
          </Collapse>
        </Form>
      </Drawer>
    </Card>
  )
}
