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
  Table,
  Tag,
} from '@arco-design/web-react'
import { IconList, IconPlus, IconRefresh, IconSettings } from '@arco-design/web-react/icon'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTabs } from '../../store/tab-context'
import * as applicationApi from '../../api/application'

const FormItem = Form.Item
const Row = Grid.Row
const Col = Grid.Col
const MenuItem = Menu.Item

// 可配置列 key（操作列固定显示，不参与列设置）
const ALL_COL_KEYS = ['id', 'name', 'code', 'table_name', 'sub_table_name', 'status']

// 表格密度选项
const SIZE_OPTIONS = [
  { label: '默认', value: 'default' },
  { label: '中等', value: 'middle' },
  { label: '紧凑', value: 'small' },
  { label: '迷你', value: 'mini' },
]

const EMPTY_FORM = {
  name: '',
  code: '',
  table_name: '',
  sub_table_name: '',
  status: 1,
}

export default function ApplicationManage() {
  const navigate = useNavigate()
  const { addTab } = useTabs()
  const [list, setList] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(10)
  const [loading, setLoading] = useState(false)

  // 草稿筛选条件（变化不触发请求）
  const [keyword, setKeyword] = useState('')
  // 已生效的筛选条件（点击「搜索」后更新）
  const [appliedKeyword, setAppliedKeyword] = useState('')

  // 表格密度 & 列可见性
  const [tableSize, setTableSize] = useState('default')
  const [visibleCols, setVisibleCols] = useState(ALL_COL_KEYS)

  const [modalVisible, setModalVisible] = useState(false)
  const [editing, setEditing] = useState(null)
  const [saving, setSaving] = useState(false)
  const [form] = Form.useForm()

  const fetchList = useCallback(
    async (p = page, s = size) => {
      setLoading(true)
      try {
        const params = { page: p, size: s }
        if (appliedKeyword) params.keyword = appliedKeyword
        const res = await applicationApi.listApplications(params)
        setList(res.data.list || [])
        setTotal(res.data.total || 0)
      } catch (e) {
        // 错误已在请求层提示
      } finally {
        setLoading(false)
      }
    },
    [page, size, appliedKeyword],
  )

  useEffect(() => {
    fetchList()
  }, [page, size, fetchList])

  // 搜索：生效草稿条件，回到第一页
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
      code: record.code,
      table_name: record.table_name,
      sub_table_name: record.sub_table_name || '',
      status: record.status ?? 1,
    })
    setModalVisible(true)
  }

  const handleSave = async () => {
    const values = await form.validate()
    // 新建模式下 code 由后端自动生成，不传递
    if (!editing) {
      delete values.code
    }
    setSaving(true)
    try {
      if (editing) {
        await applicationApi.updateApplication(editing.id, values)
        Message.success('保存成功')
      } else {
        await applicationApi.createApplication(values)
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
      await applicationApi.deleteApplication(record.id)
      Message.success('删除成功')
      fetchList()
    } catch (e) {
      // 错误已在请求层提示
    }
  }

  // 打开子页面：预添加独立页签并跳转，通过 state 传递应用名称
  const openSubPage = (record, module, label) => {
    const path = `/application/${record.id}/${module}`
    addTab({ path, title: `${record.name} - ${label}` })
    navigate(path)
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
    { key: 'id', title: 'ID', dataIndex: 'id', width: 70 },
    { key: 'name', title: '页面名称', dataIndex: 'name' },
    { key: 'code', title: '页面编码', dataIndex: 'code' },
    { key: 'table_name', title: '对应表', dataIndex: 'table_name' },
    {
      key: 'sub_table_name',
      title: '子表',
      dataIndex: 'sub_table_name',
      render: (v) => v || '-',
    },
    {
      key: 'status',
      title: '状态',
      dataIndex: 'status',
      width: 80,
      render: (status) => (status === 1 ? <Tag color="green">启用</Tag> : <Tag color="red">停用</Tag>),
    },
    {
      key: 'action',
      title: '操作',
      width: 390,
      render: (_, record) => (
        <Space>
          <Button size="mini" onClick={() => openSubPage(record, 'tables', '表管理')}>
            表管理
          </Button>
          <Button size="mini" onClick={() => openSubPage(record, 'form-elements', '表单元素')}>
            表单元素管理
          </Button>
          <Button size="mini" onClick={() => openSubPage(record, 'layout', '布局管理')}>
            布局管理
          </Button>
          <Button size="mini" onClick={() => openEdit(record)}>
            编辑
          </Button>
          <Popconfirm focusLock title="确认删除该页面配置？" onOk={() => handleDelete(record)}>
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

  const visibleColumns = columns.filter((c) => c.key === 'action' || visibleCols.includes(c.key))

  return (
    <Card title="页面配置">
      {/* 搜索区域 */}
      <div className="mb-3">
        <Space wrap>
          <Input
            className="w-55!"
            placeholder="按页面名称 / 页面编码搜索"
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
          新增页面
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
        title={editing ? '编辑页面配置' : '新增页面配置'}
        visible={modalVisible}
        onOk={handleSave}
        confirmLoading={saving}
        onCancel={() => setModalVisible(false)}
        unmountOnExit
        className="w-160! max-w-[90vw]"
      >
        <Form form={form} layout="vertical" autoComplete="off">
          <Row gutter={20}>
            <Col span={12}>
              <FormItem
                label="页面名称"
                field="name"
                rules={[
                  { required: true, message: '请输入页面名称' },
                  { minLength: 2, maxLength: 64, message: '长度 2-64 个字符' },
                ]}
              >
                <Input placeholder="如：订单管理" />
              </FormItem>
            </Col>
            <Col span={12}>
              <FormItem label="页面编码" field="code" >
                <Input placeholder="由系统自动生成" disabled />
              </FormItem>
            </Col>
            <Col span={12}>
              <FormItem
                label="对应表"
                field="table_name"
                rules={[{ required: true, message: '请输入对应表' }]}
              >
                <Input placeholder="如：order" />
              </FormItem>
            </Col>
            <Col span={12}>
              <FormItem label="状态" field="status" triggerPropName="value">
                <Select>
                  <Select.Option value={1}>启用</Select.Option>
                  <Select.Option value={2}>停用</Select.Option>
                </Select>
              </FormItem>
            </Col>
            <Col span={24}>
              <FormItem label="子表" field="sub_table_name">
                <Input placeholder="多个子表用逗号隔开，如：order_item,order_detail" />
              </FormItem>
            </Col>
          </Row>
        </Form>
      </Modal>
    </Card>
  )
}
