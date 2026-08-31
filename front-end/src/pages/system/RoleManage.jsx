import { useCallback, useEffect, useState } from 'react'
import {
  Table,
  Button,
  Space,
  Input,
  InputNumber,
  Form,
  Modal,
  Select,
  Tag,
  Popconfirm,
  Message,
  Card,
  Tree,
  Radio,
} from '@arco-design/web-react'
import { IconPlus, IconRefresh } from '@arco-design/web-react/icon'
import * as roleApi from '../../api/role'
import * as menuApi from '../../api/menu'
import * as deptApi from '../../api/dept'

const FormItem = Form.Item

// 数据范围枚举，与后端 data_scope 对齐
const DATA_SCOPE_OPTIONS = [
  { label: '全部数据', value: 1 },
  { label: '自定义部门', value: 2 },
  { label: '仅本部门', value: 3 },
  { label: '本部门及下级', value: 4 },
]

const DATA_SCOPE_MAP = Object.fromEntries(DATA_SCOPE_OPTIONS.map((o) => [o.value, o.label]))

function menuToTree(menus) {
  return (menus || []).map((m) => ({
    key: String(m.id),
    title: m.name,
    children: m.children ? menuToTree(m.children) : undefined,
  }))
}

function deptToTree(depts) {
  return (depts || []).map((d) => ({
    key: String(d.id),
    title: d.name,
    children: d.children ? deptToTree(d.children) : undefined,
  }))
}

const EMPTY_FORM = {
  name: '',
  code: '',
  sort: 0,
  status: 1,
  data_scope: 3,
  remark: '',
}

export default function RoleManage() {
  const [list, setList] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(10)
  const [loading, setLoading] = useState(false)
  const [keyword, setKeyword] = useState('')

  const [modalVisible, setModalVisible] = useState(false)
  const [editing, setEditing] = useState(null)
  const [saving, setSaving] = useState(false)
  const [dataScope, setDataScope] = useState(3)
  const [form] = Form.useForm()

  // 分配菜单弹窗
  const [menuModal, setMenuModal] = useState(null)
  const [menuTree, setMenuTree] = useState([])
  const [checkedMenus, setCheckedMenus] = useState([])

  // 绑定部门弹窗（仅数据范围=自定义部门时使用）
  const [deptModal, setDeptModal] = useState(null)
  const [deptTree, setDeptTree] = useState([])
  const [checkedDepts, setCheckedDepts] = useState([])

  const fetchList = useCallback(
    async (p = page, s = size) => {
      setLoading(true)
      try {
        const params = { page: p, size: s }
        if (keyword) params.name = keyword
        const res = await roleApi.listRoles(params)
        setList(res.data.list || [])
        setTotal(res.data.total || 0)
      } catch (e) {
        // 错误已在请求层提示
      } finally {
        setLoading(false)
      }
    },
    [page, size, keyword]
  )

  useEffect(() => {
    fetchList()
  }, [page, size, fetchList])

  const openCreate = () => {
    setEditing(null)
    form.setFieldsValue(EMPTY_FORM)
    setDataScope(EMPTY_FORM.data_scope)
    setModalVisible(true)
  }

  const openEdit = (record) => {
    setEditing(record)
    form.setFieldsValue({
      name: record.name,
      code: record.code,
      sort: record.sort,
      status: record.status,
      data_scope: record.data_scope,
      remark: record.remark,
    })
    setDataScope(record.data_scope)
    setModalVisible(true)
  }

  const handleSave = async () => {
    const values = await form.validate()
    setSaving(true)
    try {
      if (editing) {
        await roleApi.updateRole(editing.id, values)
        Message.success('保存成功')
      } else {
        await roleApi.createRole(values)
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
      await roleApi.deleteRole(record.id)
      Message.success('删除成功')
      fetchList()
    } catch (e) {
      // 错误已在请求层提示
    }
  }

  // 打开分配菜单：加载菜单树 + 角色详情拿到已分配菜单
  const openAssignMenus = async (record) => {
    try {
      const [treeRes, detailRes] = await Promise.all([
        menuApi.getMenuTree(),
        roleApi.getRole(record.id),
      ])
      const tree = treeRes.data || []
      setMenuTree(tree)
      const assigned = (detailRes.data.menus || []).map((m) => String(m.id))
      setCheckedMenus(assigned)
      setMenuModal(record)
    } catch (e) {
      // 错误已在请求层提示
    }
  }

  const handleSaveMenus = async () => {
    if (!checkedMenus.length) {
      Message.warning('请至少勾选一个菜单')
      return
    }
    try {
      await roleApi.assignRoleMenus(menuModal.id, checkedMenus.map(Number))
      Message.success('菜单分配成功')
      setMenuModal(null)
    } catch (e) {
      // 错误已在请求层提示
    }
  }

  // 打开绑定部门：加载部门树 + 角色详情拿到已绑定部门
  const openAssignDepts = async (record) => {
    try {
      const [treeRes, detailRes] = await Promise.all([
        deptApi.getDeptTree(),
        roleApi.getRole(record.id),
      ])
      setDeptTree(treeRes.data || [])
      setCheckedDepts((detailRes.data.depts || []).map((d) => String(d.id)))
      setDeptModal(record)
    } catch (e) {
      // 错误已在请求层提示
    }
  }

  const handleSaveDepts = async () => {
    try {
      await roleApi.assignRoleDepts(deptModal.id, checkedDepts.map(Number))
      Message.success('部门绑定成功')
      setDeptModal(null)
    } catch (e) {
      // 错误已在请求层提示
    }
  }

  const columns = [
    { title: 'ID', dataIndex: 'id', width: 70 },
    { title: '角色名称', dataIndex: 'name' },
    { title: '角色编码', dataIndex: 'code' },
    {
      title: '数据范围',
      dataIndex: 'data_scope',
      render: (v) => DATA_SCOPE_MAP[v] || v,
    },
    { title: '排序', dataIndex: 'sort', width: 80 },
    {
      title: '状态',
      dataIndex: 'status',
      width: 80,
      render: (status) =>
        status === 1 ? <Tag color="green">启用</Tag> : <Tag color="red">停用</Tag>,
    },
    { title: '备注', dataIndex: 'remark', render: (v) => v || '-' },
    {
      title: '操作',
      width: 260,
      render: (_, record) => (
        <Space wrap>
          <Button size="mini" onClick={() => openEdit(record)}>
            编辑
          </Button>
          <Button size="mini" onClick={() => openAssignMenus(record)}>
            分配菜单
          </Button>
          {record.data_scope === 2 && (
            <Button size="mini" onClick={() => openAssignDepts(record)}>
              绑定部门
            </Button>
          )}
          <Popconfirm focusLock title="确认删除该角色？" onOk={() => handleDelete(record)}>
            <Button size="mini" status="danger">
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <Card title="角色管理">
      <div className="flex justify-between mb-4">
        <Space wrap>
          <Input.Search
            className="w-[220px]!"
            placeholder="按角色名称搜索"
            allowClear
            value={keyword}
            onChange={setKeyword}
            onSearch={() => {
              setPage(1)
              fetchList(1, size)
            }}
          />
          <Button
            icon={<IconRefresh />}
            onClick={() => {
              setKeyword('')
              setPage(1)
              fetchList(1, size)
            }}
          >
            重置
          </Button>
        </Space>
        <Button type="primary" icon={<IconPlus />} onClick={openCreate}>
          新增角色
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
        title={editing ? '编辑角色' : '新增角色'}
        visible={modalVisible}
        onOk={handleSave}
        confirmLoading={saving}
        onCancel={() => setModalVisible(false)}
        unmountOnExit
        className="w-[520px]! max-w-[90vw]"
      >
        <Form
          form={form}
          layout="vertical"
          autoComplete="off"
          onValuesChange={(changed) => {
            if (changed.data_scope !== undefined) {
              setDataScope(changed.data_scope)
            }
          }}
        >
          <FormItem
            label="角色名称"
            field="name"
            rules={[
              { required: true, message: '请输入角色名称' },
              { minLength: 2, maxLength: 64, message: '长度 2-64 个字符' },
            ]}
          >
            <Input placeholder="如：运营专员" />
          </FormItem>
          <FormItem
            label="角色编码"
            field="code"
            rules={[
              { required: true, message: '请输入角色编码' },
              { minLength: 2, maxLength: 64, message: '长度 2-64 个字符' },
            ]}
          >
            <Input placeholder="如：operator" />
          </FormItem>
          <FormItem label="数据范围" field="data_scope" triggerPropName="value">
            <Radio.Group>
              {DATA_SCOPE_OPTIONS.map((o) => (
                <Radio key={o.value} value={o.value}>
                  {o.label}
                </Radio>
              ))}
            </Radio.Group>
          </FormItem>
          {dataScope === 2 && (
            <div className="mb-3 text-sm text-gray-500">
              保存后请在列表中点击「绑定部门」为该角色选择自定义数据范围。
            </div>
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
          <FormItem label="备注" field="remark">
            <Input.TextArea maxLength={255} showWordLimit placeholder="选填" />
          </FormItem>
        </Form>
      </Modal>

      <Modal
        title={`分配菜单 - ${menuModal?.name || ''}`}
        visible={Boolean(menuModal)}
        onOk={handleSaveMenus}
        onCancel={() => setMenuModal(null)}
        unmountOnExit
        className="w-[480px]! max-w-[90vw]"
      >
        <Tree
          checkable
          defaultExpandAll
          treeData={menuToTree(menuTree)}
          checkedKeys={checkedMenus}
          onCheck={(keys) => setCheckedMenus(keys)}
          className="max-h-[400px] overflow-auto"
        />
      </Modal>

      <Modal
        title={`绑定部门 - ${deptModal?.name || ''}`}
        visible={Boolean(deptModal)}
        onOk={handleSaveDepts}
        onCancel={() => setDeptModal(null)}
        unmountOnExit
        className="w-[480px]! max-w-[90vw]"
      >
        <Tree
          checkable
          defaultExpandAll
          treeData={deptToTree(deptTree)}
          checkedKeys={checkedDepts}
          onCheck={(keys) => setCheckedDepts(keys)}
          className="max-h-[400px] overflow-auto"
        />
      </Modal>
    </Card>
  )
}
