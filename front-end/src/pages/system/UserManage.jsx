import { useCallback, useEffect, useState } from 'react'
import {
  Table,
  Button,
  Space,
  Input,
  Form,
  Modal,
  Select,
  TreeSelect,
  Tag,
  Popconfirm,
  Message,
  Card,
} from '@arco-design/web-react'
import { IconPlus, IconRefresh } from '@arco-design/web-react/icon'
import * as userApi from '../../api/user'
import * as deptApi from '../../api/dept'
import * as roleApi from '../../api/role'

const FormItem = Form.Item

// 部门树 -> Arco TreeSelect 数据
function toTreeData(depts) {
  return (depts || []).map((d) => ({
    key: String(d.id),
    title: d.name,
    value: d.id,
    children: d.children ? toTreeData(d.children) : undefined,
  }))
}

const EMPTY_FORM = {
  username: '',
  email: '',
  phone: '',
  password: '',
  status: 1,
  dept_id: undefined,
  role_ids: [],
}

// 后端 dept_id 为数字类型、role_ids 为数字数组：
// TreeSelect 选中值与编辑回填的角色 ID 可能是字符串，提交前统一转为数字，
// 否则后端 JSON 绑定阶段直接报「请求参数格式错误」
function normalizeUserPayload(values) {
  const payload = { ...values }
  if (payload.dept_id !== undefined && payload.dept_id !== null && payload.dept_id !== '') {
    payload.dept_id = Number(payload.dept_id)
  } else {
    delete payload.dept_id
  }
  if (Array.isArray(payload.role_ids)) {
    payload.role_ids = payload.role_ids.map((id) => Number(id))
  } else {
    delete payload.role_ids
  }
  return payload
}

export default function UserManage() {
  const [list, setList] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(10)
  const [loading, setLoading] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [deptFilter, setDeptFilter] = useState(undefined)

  const [deptTree, setDeptTree] = useState([])
  const [allRoles, setAllRoles] = useState([])

  const [modalVisible, setModalVisible] = useState(false)
  const [editing, setEditing] = useState(null) // null=新增
  const [saving, setSaving] = useState(false)
  const [form] = Form.useForm()

  const fetchList = useCallback(async (p = page, s = size) => {
    setLoading(true)
    try {
      const params = { page: p, size: s }
      if (keyword) params.username = keyword
      if (deptFilter) params.dept_id = deptFilter
      const res = await userApi.listUsers(params)
      setList(res.data.list || [])
      setTotal(res.data.total || 0)
    } catch (e) {
      // 错误已在请求层提示
    } finally {
      setLoading(false)
    }
  }, [page, size, keyword, deptFilter])

  const fetchBase = useCallback(async () => {
    try {
      const [deptRes, roleRes] = await Promise.all([
        deptApi.getDeptTree(),
        roleApi.listRoles({ page: 1, size: 200 }),
      ])
      setDeptTree(deptRes.data || [])
      setAllRoles(roleRes.data.list || [])
    } catch (e) {
      // 错误已在请求层提示
    }
  }, [])

  useEffect(() => {
    fetchBase()
  }, [fetchBase])

  useEffect(() => {
    fetchList()
  }, [page, size, fetchList])

  const openCreate = () => {
    setEditing(null)
    form.setFieldsValue(EMPTY_FORM)
    setModalVisible(true)
  }

  const openEdit = (record) => {
    setEditing(record)
    form.setFieldsValue({
      username: record.username,
      email: record.email,
      phone: record.phone,
      password: '',
      status: record.status,
      dept_id: record.dept_id || undefined,
      role_ids: (record.roles || []).map((r) => r.id),
    })
    setModalVisible(true)
  }

  const handleSave = async () => {
    const values = await form.validate()
    const payload = normalizeUserPayload(values)
    setSaving(true)
    try {
      if (editing) {
        // 更新接口不含角色，密码留空表示不修改
        if (!payload.password) delete payload.password
        delete payload.role_ids
        await userApi.updateUser(editing.id, payload)
        if (Array.isArray(values.role_ids) && values.role_ids.length > 0) {
          await userApi.assignUserRoles(editing.id, values.role_ids.map(Number))
        }
        Message.success('保存成功')
      } else {
        await userApi.createUser(payload)
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
      await userApi.deleteUser(record.id)
      Message.success('删除成功')
      fetchList()
    } catch (e) {
      // 错误已在请求层提示
    }
  }

  const columns = [
    { title: 'ID', dataIndex: 'id', width: 70 },
    { title: '用户名', dataIndex: 'username' },
    {
      title: '部门',
      dataIndex: 'dept',
      render: (dept) => dept?.name || '-',
    },
    {
      title: '角色',
      dataIndex: 'roles',
      render: (roles) =>
        (roles || []).map((r) => (
          <Tag key={r.id} color="arcoblue" className="mr-1">
            {r.name}
          </Tag>
        )),
    },
    { title: '邮箱', dataIndex: 'email', render: (v) => v || '-' },
    { title: '手机号', dataIndex: 'phone', render: (v) => v || '-' },
    {
      title: '状态',
      dataIndex: 'status',
      width: 80,
      render: (status) =>
        status === 1 ? <Tag color="green">启用</Tag> : <Tag color="red">停用</Tag>,
    },
    { title: '创建时间', dataIndex: 'created_at', render: (v) => v?.slice(0, 19).replace('T', ' ') },
    {
      title: '操作',
      width: 160,
      render: (_, record) => (
        <Space>
          <Button size="mini" onClick={() => openEdit(record)}>
            编辑
          </Button>
          <Popconfirm focusLock title="确认删除该用户？" onOk={() => handleDelete(record)}>
            <Button size="mini" status="danger">
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <Card title="用户管理">
      <div className="flex justify-between mb-4">
        <Space wrap>
          <Input.Search
            className="w-[220px]!"
            placeholder="按用户名搜索"
            allowClear
            value={keyword}
            onChange={setKeyword}
            onSearch={() => {
              setPage(1)
              fetchList(1, size)
            }}
          />
          <TreeSelect
            className="w-[200px]!"
            placeholder="按部门筛选"
            allowClear
            treeData={toTreeData(deptTree)}
            value={deptFilter}
            onChange={(v) => {
              setDeptFilter(v)
              setPage(1)
            }}
          />
          <Button
            icon={<IconRefresh />}
            onClick={() => {
              setKeyword('')
              setDeptFilter(undefined)
              setPage(1)
              fetchList(1, size)
            }}
          >
            重置
          </Button>
        </Space>
        <Button type="primary" icon={<IconPlus />} onClick={openCreate}>
          新增用户
        </Button>
      </div>
      <Table
        rowKey="id"
        columns={columns}
        data={list}
        loading={loading}
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
        title={editing ? '编辑用户' : '新增用户'}
        visible={modalVisible}
        onOk={handleSave}
        confirmLoading={saving}
        onCancel={() => setModalVisible(false)}
        unmountOnExit
        className="w-[520px]! max-w-[90vw]"
      >
        <Form form={form} layout="vertical" autoComplete="off">
          <FormItem
            label="用户名"
            field="username"
            rules={[
              { required: true, message: '请输入用户名' },
              { minLength: 2, maxLength: 64, message: '长度 2-64 个字符' },
            ]}
          >
            <Input placeholder="请输入用户名" />
          </FormItem>
          {!editing && (
            <FormItem
              label="密码"
              field="password"
              rules={[
                { required: true, message: '请输入密码' },
                { minLength: 6, maxLength: 64, message: '长度 6-64 个字符' },
              ]}
            >
              <Input.Password placeholder="请输入密码" />
            </FormItem>
          )}
          {editing && (
            <FormItem
              label="新密码（留空表示不修改）"
              field="password"
              rules={[{ minLength: 6, maxLength: 64, message: '长度 6-64 个字符' }]}
            >
              <Input.Password placeholder="留空表示不修改" />
            </FormItem>
          )}
          <FormItem label="邮箱" field="email" rules={[{ type: 'email', message: '邮箱格式不正确' }]}>
            <Input placeholder="请输入邮箱" />
          </FormItem>
          <FormItem label="手机号" field="phone">
            <Input placeholder="请输入手机号" />
          </FormItem>
          <FormItem label="所属部门" field="dept_id">
            <TreeSelect placeholder="请选择部门" allowClear treeData={toTreeData(deptTree)} />
          </FormItem>
          <FormItem label="角色" field="role_ids">
            <Select mode="multiple" placeholder="请选择角色" allowClear>
              {allRoles.map((r) => (
                <Select.Option key={r.id} value={r.id}>
                  {r.name}
                </Select.Option>
              ))}
            </Select>
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
