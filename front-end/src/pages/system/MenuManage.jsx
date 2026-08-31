import { useCallback, useEffect, useState } from 'react'
import {
  Table,
  Button,
  Space,
  Form,
  Modal,
  Select,
  Tag,
  Popconfirm,
  Message,
  Card,
  Input,
  InputNumber,
  TreeSelect,
} from '@arco-design/web-react'
import { IconPlus, IconRefresh } from '@arco-design/web-react/icon'
import * as menuApi from '../../api/menu'

const FormItem = Form.Item

// 菜单类型，与后端 type 字段对齐：1目录 2页面菜单 3按钮/权限标识
const MENU_TYPES = [
  { label: '目录', value: 1, color: 'arcoblue' },
  { label: '页面菜单', value: 2, color: 'green' },
  { label: '按钮/权限', value: 3, color: 'orange' },
]

const TYPE_MAP = Object.fromEntries(MENU_TYPES.map((t) => [t.value, t]))

// 菜单树 -> TreeSelect 数据（选择父级用，排除按钮类型，按钮不能作为父级）
function toParentOptions(menus) {
  return (menus || [])
    .filter((m) => m.type !== 3)
    .map((m) => ({
      key: String(m.id),
      title: m.name,
      value: m.id,
      children: m.children ? toParentOptions(m.children) : undefined,
    }))
}

const EMPTY_FORM = {
  parent_id: 0,
  name: '',
  type: 2,
  path: '',
  perm: '',
  icon: '',
  sort: 0,
  status: 1,
}

export default function MenuManage() {
  const [tree, setTree] = useState([])
  const [loading, setLoading] = useState(false)
  const [modalVisible, setModalVisible] = useState(false)
  const [editing, setEditing] = useState(null)
  const [saving, setSaving] = useState(false)
  const [menuType, setMenuType] = useState(2)
  const [form] = Form.useForm()

  const fetchTree = useCallback(async () => {
    setLoading(true)
    try {
      const res = await menuApi.getMenuTree()
      setTree(res.data || [])
    } catch (e) {
      // 错误已在请求层提示
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchTree()
  }, [fetchTree])

  const openCreate = (parent = null) => {
    setEditing(null)
    form.setFieldsValue({ ...EMPTY_FORM, parent_id: parent ? parent.id : 0 })
    setMenuType(EMPTY_FORM.type)
    setModalVisible(true)
  }

  const openEdit = (record) => {
    setEditing(record)
    form.setFieldsValue({
      parent_id: record.parent_id,
      name: record.name,
      type: record.type,
      path: record.path,
      perm: record.perm,
      icon: record.icon,
      sort: record.sort,
      status: record.status,
    })
    setMenuType(record.type)
    setModalVisible(true)
  }

  const handleSave = async () => {
    const values = await form.validate()
    setSaving(true)
    try {
      const payload = { ...values, parent_id: values.parent_id || 0 }
      if (editing) {
        await menuApi.updateMenu(editing.id, payload)
        Message.success('保存成功')
      } else {
        await menuApi.createMenu(payload)
        Message.success('创建成功')
      }
      setModalVisible(false)
      fetchTree()
    } catch (e) {
      // 错误已在请求层提示
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (record) => {
    try {
      await menuApi.deleteMenu(record.id)
      Message.success('删除成功')
      fetchTree()
    } catch (e) {
      // 错误已在请求层提示
    }
  }

  const columns = [
    { title: '菜单名称', dataIndex: 'name', width: 220 },
    {
      title: '类型',
      dataIndex: 'type',
      width: 110,
      render: (t) => {
        const item = TYPE_MAP[t]
        return item ? <Tag color={item.color}>{item.label}</Tag> : t
      },
    },
    { title: '路由地址', dataIndex: 'path', render: (v) => v || '-' },
    { title: '权限标识', dataIndex: 'perm', render: (v) => v || '-' },
    { title: '图标', dataIndex: 'icon', width: 80, render: (v) => v || '-' },
    { title: '排序', dataIndex: 'sort', width: 70 },
    {
      title: '状态',
      dataIndex: 'status',
      width: 80,
      render: (status) =>
        status === 1 ? <Tag color="green">启用</Tag> : <Tag color="red">停用</Tag>,
    },
    {
      title: '操作',
      width: 220,
      render: (_, record) => (
        <Space wrap>
          <Button size="mini" onClick={() => openCreate(record)}>
            新增子项
          </Button>
          <Button size="mini" onClick={() => openEdit(record)}>
            编辑
          </Button>
          <Popconfirm focusLock title="确认删除该菜单？子菜单不会自动删除" onOk={() => handleDelete(record)}>
            <Button size="mini" status="danger">
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <Card title="菜单管理">
      <div className="flex justify-between mb-4">
        <Button icon={<IconRefresh />} onClick={fetchTree}>
          刷新
        </Button>
        <Button type="primary" icon={<IconPlus />} onClick={() => openCreate()}>
          新增菜单
        </Button>
      </div>
      <Table
        rowKey="id"
        columns={columns}
        data={tree}
        loading={loading}
        pagination={false}
        defaultExpandAllRows
      />
      <Modal
        title={editing ? '编辑菜单' : '新增菜单'}
        visible={modalVisible}
        onOk={handleSave}
        confirmLoading={saving}
        onCancel={() => setModalVisible(false)}
        unmountOnExit
        style={{ width: 520 }}
      >
        <Form
          form={form}
          layout="vertical"
          autoComplete="off"
          onValuesChange={(changed) => {
            if (changed.type !== undefined) {
              setMenuType(changed.type)
            }
          }}
        >
          <FormItem label="父级菜单" field="parent_id" triggerPropName="value">
            <TreeSelect
              placeholder="不选则为顶级菜单"
              allowClear
              treeData={toParentOptions(tree)}
            />
          </FormItem>
          <FormItem
            label="菜单名称"
            field="name"
            rules={[{ required: true, message: '请输入菜单名称' }]}
          >
            <Input placeholder="请输入菜单名称" />
          </FormItem>
          <FormItem label="类型" field="type" triggerPropName="value">
            <Select>
              {MENU_TYPES.map((t) => (
                <Select.Option key={t.value} value={t.value}>
                  {t.label}
                </Select.Option>
              ))}
            </Select>
          </FormItem>
          {menuType !== 3 && (
            <FormItem label="路由地址" field="path">
              <Input placeholder="如 /system/user" />
            </FormItem>
          )}
          <FormItem label="权限标识" field="perm">
            <Input placeholder="如 system:user:list" />
          </FormItem>
          {menuType !== 3 && (
            <FormItem label="图标" field="icon">
              <Input placeholder="如 setting / user / apps" />
            </FormItem>
          )}
          <FormItem label="排序" field="sort" triggerPropName="value">
            <InputNumber min={0} placeholder="数字越小越靠前" />
          </FormItem>
          <FormItem label="状态" field="status" triggerPropName="value">
            <Select>
              <Select.Option value={1}>启用</Select.Option>
              <Select.Option value={0}>停用</Select.Option>
            </Select>
          </FormItem>
        </Form>
      </Modal>
    </Card>
  )
}
