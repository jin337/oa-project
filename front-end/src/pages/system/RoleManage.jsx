import {
  Button,
  Card,
  Checkbox,
  Dropdown,
  Form,
  Grid,
  Input,
  InputNumber,
  Menu,
  Message,
  Modal,
  Popconfirm,
  Popover,
  Radio,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  Tree,
  Typography,
} from '@arco-design/web-react'
import { IconList, IconPlus, IconRefresh, IconSettings } from '@arco-design/web-react/icon'
import { useCallback, useEffect, useState } from 'react'
import * as deptApi from '../../api/dept'
import * as menuApi from '../../api/menu'
import * as roleApi from '../../api/role'

const FormItem = Form.Item
const Row = Grid.Row
const Col = Grid.Col
const MenuItem = Menu.Item

// 可配置列 key（操作列固定显示，不参与列设置）
const ALL_COL_KEYS = ['id', 'name', 'code', 'data_scope', 'sort', 'status', 'remark']

// 表格密度选项
const SIZE_OPTIONS = [
  { label: '默认', value: 'default' },
  { label: '中等', value: 'middle' },
  { label: '紧凑', value: 'small' },
  { label: '迷你', value: 'mini' },
]

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
        if (appliedKeyword) params.name = appliedKeyword
        const res = await roleApi.listRoles(params)
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
      const [treeRes, detailRes] = await Promise.all([menuApi.getMenuTree(), roleApi.getRole(record.id)])
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
      const [treeRes, detailRes] = await Promise.all([deptApi.getDeptTree(), roleApi.getRole(record.id)])
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
    { key: 'name', title: '角色名称', dataIndex: 'name' },
    { key: 'code', title: '角色编码', dataIndex: 'code' },
    {
      key: 'data_scope',
      title: '数据范围',
      dataIndex: 'data_scope',
      render: (v) => DATA_SCOPE_MAP[v] || v,
    },
    { key: 'sort', title: '排序', dataIndex: 'sort', width: 80 },
    {
      key: 'status',
      title: '状态',
      dataIndex: 'status',
      width: 80,
      render: (status) => (status === 1 ? <Tag color="green">启用</Tag> : <Tag color="red">停用</Tag>),
    },
    {
      key: 'remark',
      title: '备注',
      dataIndex: 'remark',
      width: 200,
      render: (v) => <Typography.Text className="mb-0!" ellipsis={{ showTooltip: true }}>{v || '-'}</Typography.Text>,
    },
    {
      key: 'action',
      title: '操作',
      width: 220,
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
          {record.code === 'admin' ? (
            <Tooltip content="超级管理员角色不可删除">
              <Button size="mini" status="danger" disabled>
                删除
              </Button>
            </Tooltip>
          ) : (
            <Popconfirm focusLock title="确认删除该角色？" onOk={() => handleDelete(record)}>
              <Button size="mini" status="danger">
                删除
              </Button>
            </Popconfirm>
          )}
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
    <Card title="角色管理">
      {/* 搜索区域 */}
      <div className="mb-3">
        <Space wrap>
          <Input
            className="w-55!"
            placeholder="按角色名称搜索"
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
          新增角色
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
        title={editing ? '编辑角色' : '新增角色'}
        visible={modalVisible}
        onOk={handleSave}
        confirmLoading={saving}
        onCancel={() => setModalVisible(false)}
        unmountOnExit
        className="w-160! max-w-[90vw]">
        <Form
          form={form}
          layout="vertical"
          autoComplete="off"
          onValuesChange={(changed) => {
            if (changed.data_scope !== undefined) {
              setDataScope(changed.data_scope)
            }
          }}>
          <Row gutter={20}>
            <Col span={12}>
              <FormItem
                label="角色名称"
                field="name"
                rules={[
                  { required: true, message: '请输入角色名称' },
                  { minLength: 2, maxLength: 64, message: '长度 2-64 个字符' },
                ]}>
                <Input placeholder="如：运营专员" />
              </FormItem>
            </Col>
            <Col span={12}>
              <FormItem
                label="角色编码"
                field="code"
                rules={[
                  { required: true, message: '请输入角色编码' },
                  { minLength: 2, maxLength: 64, message: '长度 2-64 个字符' },
                ]}>
                <Input placeholder="如：operator" disabled={Boolean(editing)} />
              </FormItem>
            </Col>
          </Row>
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
            <div className="mb-3 text-sm text-gray-500">保存后请在列表中点击「绑定部门」为该角色选择自定义数据范围。</div>
          )}
          <Row gutter={20}>
            <Col span={12}>
              <FormItem label="排序" field="sort" triggerPropName="value">
                <InputNumber min={0} placeholder="数字越小越靠前" />
              </FormItem>
            </Col>
            <Col span={12}>
              <FormItem label="状态" field="status" triggerPropName="value">
                <Select>
                  <Select.Option value={1}>启用</Select.Option>
                  <Select.Option value={0}>停用</Select.Option>
                </Select>
              </FormItem>
            </Col>
          </Row>
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
        className="w-120! max-w-[90vw]">
        <Tree
          checkable
          defaultExpandAll
          treeData={menuToTree(menuTree)}
          checkedKeys={checkedMenus}
          onCheck={(keys) => setCheckedMenus(keys)}
          className="max-h-100 overflow-auto"
        />
      </Modal>

      <Modal
        title={`绑定部门 - ${deptModal?.name || ''}`}
        visible={Boolean(deptModal)}
        onOk={handleSaveDepts}
        onCancel={() => setDeptModal(null)}
        unmountOnExit
        className="w-120! max-w-[90vw]">
        <Tree
          checkable
          defaultExpandAll
          treeData={deptToTree(deptTree)}
          checkedKeys={checkedDepts}
          onCheck={(keys) => setCheckedDepts(keys)}
          className="max-h-100 overflow-auto"
        />
      </Modal>
    </Card>
  )
}
