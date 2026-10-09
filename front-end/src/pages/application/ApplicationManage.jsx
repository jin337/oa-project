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
  Typography,
} from '@arco-design/web-react'
import {
  IconDown,
  IconList,
  IconPlus,
  IconRefresh,
  IconSettings,
} from '@arco-design/web-react/icon'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as applicationApi from 'src/api/application'
import { SIZE_OPTIONS } from 'src/config/app'
import { usePermission } from 'src/hooks/usePermission'
import { useTabs } from 'src/store/tab-context'

const FormItem = Form.Item
const Row = Grid.Row
const Col = Grid.Col
const MenuItem = Menu.Item

// 可配置列 key（操作列固定显示，不参与列设置）
const ALL_COL_KEYS = ['index', 'name', 'code', 'table_name', 'sub_table_name', 'status']
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
  const { hasPerm } = usePermission()
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

  // 打开子页面：预添加独立页签并跳转，通过 state 传递流程名称
  const openSubPage = (record, module, label) => {
    const path = `/application/${record.id}/${module}`
    addTab({ path, title: `${record.name} - ${label}` })
    navigate(path)
  }

  // 打开动态列表页：配置完成后才可使用的成果入口，openSubPage 同款方式（预添加页签 + 定制标题 + 跳转）
  // 编码通过 location.state 传递（不暴露于 URL），并写入 sessionStorage 兜底刷新/页签切换
  const openListPage = (record) => {
    const path = '/application/list'
    const linkApp = `${record.code}:list`
    sessionStorage.setItem(`link_app:${path}`, linkApp)
    addTab({ path, title: `${record.name} - 列表页` })
    navigate(path, { state: { link_app: linkApp } })
  }

  // 操作列「更多」下拉菜单分发：仅含配置类子页面入口，编辑/删除为平铺按钮
  const handleActionMenu = (key, record) => {
    if (key === 'tables') {
      openSubPage(record, 'tables', '表管理')
    } else if (key === 'elements') {
      openSubPage(record, 'elements', '表单元素')
    } else if (key === 'layout') {
      openSubPage(record, 'layout', '布局管理')
    } else if (key === 'examine') {
      openSubPage(record, 'examine', '审批配置')
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
    { key: 'name', title: '名称', dataIndex: 'name' },
    {
      key: 'code',
      title: '编码',
      dataIndex: 'code',
      render: (v) => <Typography.Text copyable>{v}</Typography.Text>,
    },
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
      align: 'center',
      render: (status) =>
        status === 1 ? <Tag color="green">启用</Tag> : <Tag color="red">停用</Tag>,
    },
    {
      key: 'action',
      title: '操作',
      width: 150,
      render: (_, record) => {
        // 「更多」下拉菜单：仅子页面入口；编辑 / 删除保持平铺展示
        const actionMenu = (
          <Menu onClickMenuItem={(key) => handleActionMenu(key, record)}>
            <MenuItem key="tables">表管理</MenuItem>
            <MenuItem key="elements">表单元素管理</MenuItem>
            <MenuItem key="layout">布局管理</MenuItem>
            <MenuItem key="examine">审批管理</MenuItem>
          </Menu>
        )
        return (
          hasPerm('application:edit') && (
            <Space>
              <Dropdown droplist={actionMenu} position="br">
                <Button size="mini" type="text">
                  更多 <IconDown />
                </Button>
              </Dropdown>
              <Button size="mini" onClick={() => openListPage(record)}>
                列表页
              </Button>
              <Button size="mini" onClick={() => openEdit(record)}>
                编辑
              </Button>
              <Popconfirm
                position="lb"
                focusLock
                title="确认删除该流程配置？"
                content="注意：此操作将同时物理删除对应的主表及所有子表，数据不可恢复，请谨慎操作！"
                onOk={() => handleDelete(record)}
              >
                <Button size="mini" status="danger">
                  删除
                </Button>
              </Popconfirm>
            </Space>
          )
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

  const visibleColumns = columns.filter((c) => c.key === 'action' || visibleCols.includes(c.key))

  return (
    <Card title="流程配置">
      {/* 搜索区域 */}
      <div className="mb-3">
        <Space wrap>
          <Input
            className="w-55!"
            placeholder="按名称 / 编码搜索"
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
        {hasPerm('application:edit') ? (
          <Button type="primary" icon={<IconPlus />} onClick={openCreate}>
            新增流程
          </Button>
        ) : (
          <div></div>
        )}
        <Space>
          <Button size="small" icon={<IconRefresh />} onClick={() => fetchList()}>
            刷新
          </Button>
          <Dropdown droplist={sizeMenu} trigger='click' position="br">
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

      <Modal
        title={editing ? '编辑配置' : '新增配置'}
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
                label="名称"
                field="name"
                rules={[
                  { required: true, message: '请输入名称' },
                  { minLength: 2, maxLength: 64, message: '长度 2-64 个字符' },
                ]}
              >
                <Input placeholder="如：订单管理" />
              </FormItem>
            </Col>
            <Col span={12}>
              <FormItem label="编码" field="code">
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
