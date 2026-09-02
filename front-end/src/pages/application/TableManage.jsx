import {
  Button,
  Card,
  Checkbox,
  Dropdown,
  Form,
  Grid,
  Input,
  Menu,
  Message,
  Modal,
  Popconfirm,
  Popover,
  Select,
  Space,
  Switch,
  Table,
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

const MODULE_LABEL = '表管理'

// 可配置列 key（操作列固定显示，不参与列设置）
const ALL_COL_KEYS = ['name', 'type', 'length', 'not_null', 'default_value', 'comment']

// 表格密度选项
const SIZE_OPTIONS = [
  { label: '默认', value: 'default' },
  { label: '中等', value: 'middle' },
  { label: '紧凑', value: 'small' },
  { label: '迷你', value: 'mini' },
]

// 常用字段类型
const FIELD_TYPES = [
  'varchar',
  'char',
  'text',
  'int',
  'bigint',
  'tinyint',
  'smallint',
  'decimal',
  'float',
  'double',
  'date',
  'datetime',
  'timestamp',
  'time',
  'boolean',
  'json',
  'blob',
]

const EMPTY_FORM = {
  name: '',
  type: undefined,
  length: undefined,
  not_null: true,
  default_value: '',
  comment: '',
}

export default function TableManage() {
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

  // 弹窗
  const [modalVisible, setModalVisible] = useState(false)
  const [editing, setEditing] = useState(null)
  const [saving, setSaving] = useState(false)
  const [form] = Form.useForm()

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
        if (appliedKeyword) params.name = appliedKeyword
        const res = await applicationApi.listTableFields(id, params)
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

  const openCreate = () => {
    setEditing(null)
    form.setFieldsValue(EMPTY_FORM)
    setModalVisible(true)
  }

  const openEdit = (record) => {
    setEditing(record)
    form.setFieldsValue({
      name: record.name,
      type: record.type,
      length: record.length,
      not_null: record.not_null === 1,
      default_value: record.default_value || '',
      comment: record.comment || '',
    })
    setModalVisible(true)
  }

  const handleSave = async () => {
    const values = await form.validate()
    const payload = {
      ...values,
      not_null: values.not_null ? 1 : 0,
      length: values.length ? Number(values.length) : undefined,
    }
    if (!payload.length) delete payload.length
    setSaving(true)
    try {
      if (editing) {
        await applicationApi.updateTableField(id, editing.id, payload)
        Message.success('保存成功')
      } else {
        await applicationApi.createTableField(id, payload)
        Message.success('创建成功')
      }
      setModalVisible(false)
      fetchList()
    } catch (e) {
      // 错误已在请求层提示
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (record) => {
    try {
      await applicationApi.deleteTableField(id, record.id)
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
    { key: 'name', title: '字段名称', dataIndex: 'name' },
    { key: 'type', title: '类型', dataIndex: 'type' },
    { key: 'length', title: '长度', dataIndex: 'length',  render: (v) => v || '-' },
    {
      key: 'not_null',
      title: '不可为空',
      dataIndex: 'not_null',
      align: 'center',
      render: (v) => (v ? '是' : '否'),
    },
    {
      key: 'default_value',
      title: '默认值',
      align: 'center',
      dataIndex: 'default_value',
      render: (v) => (v === '' || v === null || v === undefined ? '-' : v),
    },
    { key: 'comment', title: '注释', dataIndex: 'comment', render: (v) => v || '-' },
    {
      key: 'action',
      title: '操作',
      width: 140,
      render: (_, record) => (
        <Space>
          <Button size="mini" onClick={() => openEdit(record)}>
            编辑
          </Button>
          <Popconfirm focusLock title="确认删除该字段？" onOk={() => handleDelete(record)}>
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
            placeholder="按字段名称搜索"
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
          新增字段
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

      <Modal
        title={editing ? '编辑字段' : '新增字段'}
        visible={modalVisible}
        onOk={handleSave}
        confirmLoading={saving}
        onCancel={() => setModalVisible(false)}
        unmountOnExit
        className="w-160! max-w-[90vw]"
      >
        <Form form={form} layout="horizontal" autoComplete="off">
          <FormItem
            label="字段名称"
            field="name"
            rules={[
              { required: true, message: '请输入字段名称' },
              { minLength: 1, maxLength: 64, message: '长度 1-64 个字符' },
            ]}
          >
            <Input placeholder="如：user_name" />
          </FormItem>
          <FormItem
            label="字段类型"
            field="type"
            rules={[{ required: true, message: '请选择字段类型' }]}
          >
            <Select placeholder="请选择类型" allowClear>
              {FIELD_TYPES.map((t) => (
                <Select.Option key={t} value={t}>
                  {t}
                </Select.Option>
              ))}
            </Select>
          </FormItem>
          <FormItem
            label="长度"
            field="length"
            rules={[
              {
                validator: (value, cb) => {
                  if (value === '' || value === undefined || value === null) return cb()
                  const n = Number(value)
                  if (!Number.isInteger(n) || n <= 0) {
                    return cb('长度必须为正整数')
                  }
                  cb()
                },
              },
            ]}
          >
            <Input placeholder="如：255" />
          </FormItem>
          <FormItem label="不可为空" field="not_null" triggerPropName="checked">
            <Switch />
          </FormItem>
          <FormItem label="默认值" field="default_value">
            <Input placeholder="可选" />
          </FormItem>
          <FormItem label="注释" field="comment">
            <Input.TextArea placeholder="字段说明" autoSize={{ minRows: 2, maxRows: 4 }} />
          </FormItem>
        </Form>
      </Modal>
    </Card>
  )
}
