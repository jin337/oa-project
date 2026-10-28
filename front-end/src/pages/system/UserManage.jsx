import {
  Button,
  Card,
  Checkbox,
  DatePicker,
  Descriptions,
  Divider,
  Drawer,
  Dropdown,
  Form,
  Grid,
  Input,
  Menu,
  Message,
  Modal,
  Popconfirm,
  Popover,
  Radio,
  Select,
  Space,
  Spin,
  Switch,
  Table,
  Tag,
  TreeSelect,
} from '@arco-design/web-react'
import { IconList, IconPlus, IconRefresh, IconSettings } from '@arco-design/web-react/icon'
import { useCallback, useEffect, useState } from 'react'
import * as deptApi from 'src/api/dept'
import { fetchAll } from 'src/api/fetchAll'
import * as roleApi from 'src/api/role'
import * as userApi from 'src/api/user'
import { SIZE_OPTIONS } from 'src/config/app'
import { usePermission } from 'src/hooks/usePermission'

const FormItem = Form.Item
const Row = Grid.Row
const Col = Grid.Col
const MenuItem = Menu.Item

// 可配置列 key（操作列固定显示，不参与列设置）
const ALL_COL_KEYS = [
  'index',
  'nickname',
  'username',
  'dept',
  'roles',
  'phone',
  'status',
  'created_at',
]
// 角色标签颜色池（Arco 预设色），按角色 ID 取模分配，保证同一角色颜色稳定
const ROLE_COLORS = [
  'none',
  'red',
  'arcoblue',
  'green',
  'orangered',
  'magenta',
  'cyan',
  'purple',
  'lime',
  'gold',
  'orange',
  'blue',
  'pinkpurple',
  'gray',
]

function getRoleColor(role) {
  const id = Number(role?.id)
  const idx = Number.isFinite(id) ? id % ROLE_COLORS.length : 0
  return ROLE_COLORS[idx]
}

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
  dept_ids: [],
  role_ids: [],
}

// 后端 dept_ids 为数字数组、role_ids 为数字数组：
// TreeSelect 选中值与编辑回填的角色 ID 可能是字符串，提交前统一转为数字，
// 否则后端 JSON 绑定阶段直接报「请求参数格式错误」
function normalizeUserPayload(values) {
  const payload = { ...values }
  if (Array.isArray(payload.dept_ids)) {
    payload.dept_ids = payload.dept_ids.map((id) => Number(id))
    if (!payload.dept_ids.length) delete payload.dept_ids
  } else {
    delete payload.dept_ids
  }
  if (Array.isArray(payload.role_ids)) {
    payload.role_ids = payload.role_ids.map((id) => Number(id))
  } else {
    delete payload.role_ids
  }
  return payload
}

export default function UserManage() {
  const { hasPerm } = usePermission()
  const canEdit = hasPerm('system:user:edit')
  const [list, setList] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(10)
  const [loading, setLoading] = useState(false)

  // 草稿筛选条件（绑定输入控件，变化不触发请求）
  const [keyword, setKeyword] = useState('')
  const [deptFilter, setDeptFilter] = useState([])
  const [roleFilter, setRoleFilter] = useState()
  // 已生效的筛选条件（点击「搜索」后更新，驱动列表请求）
  const [appliedFilters, setAppliedFilters] = useState({
    keyword: '',
    deptFilter: [],
    roleFilter: [],
  })

  // 表格密度 & 列可见性
  const [tableSize, setTableSize] = useState('default')
  const [visibleCols, setVisibleCols] = useState(ALL_COL_KEYS)

  const [deptTree, setDeptTree] = useState([])
  const [allRoles, setAllRoles] = useState([])

  const [modalVisible, setModalVisible] = useState(false)
  const [editing, setEditing] = useState(null)
  const [saving, setSaving] = useState(false)
  const [form] = Form.useForm()

  // 重置密码弹窗
  const [resetModalVisible, setResetModalVisible] = useState(false)
  const [resetTarget, setResetTarget] = useState(null)
  const [resetSaving, setResetSaving] = useState(false)
  const [resetForm] = Form.useForm()

  // 查看详情抽屉
  const [detailVisible, setDetailVisible] = useState(false)
  const [detailUser, setDetailUser] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailEditing, setDetailEditing] = useState(false)
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileForm] = Form.useForm()

  const fetchList = useCallback(
    async (p = page, s = size) => {
      setLoading(true)
      try {
        const params = { page: p, size: s }
        if (appliedFilters.keyword) params.username = appliedFilters.keyword
        if (appliedFilters.deptFilter?.length) params.dept_ids = appliedFilters.deptFilter
        if (appliedFilters.roleFilter?.length) params.role_ids = appliedFilters.roleFilter
        const res = await userApi.listUsers(params)
        setList(res.data.list || [])
        setTotal(res.data.total || 0)
      } catch (e) {
        // 错误已在请求层提示
      } finally {
        setLoading(false)
      }
    },
    [page, size, appliedFilters],
  )

  const fetchBase = useCallback(async () => {
    try {
      const [deptRes, roleRes] = await Promise.all([
        deptApi.getDeptTree(),
        fetchAll(roleApi.listRoles),
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

  // 搜索：生效当前草稿条件，回到第一页
  const handleSearch = () => {
    setAppliedFilters({ keyword, deptFilter, roleFilter })
    setPage(1)
  }

  // 重置：清空草稿与已生效条件，回到第一页并刷新
  const handleReset = () => {
    setKeyword('')
    setDeptFilter([])
    setRoleFilter(undefined)
    setAppliedFilters({ keyword: '', deptFilter: [], roleFilter: [] })
    setPage(1)
  }

  const openCreate = () => {
    setEditing(null)
    form.setFieldsValue(EMPTY_FORM)
    setModalVisible(true)
  }

  const handleSave = async () => {
    const values = await form.validate()
    const payload = normalizeUserPayload(values)
    setSaving(true)
    try {
      if (editing) {
        // 更新接口已支持 role_ids，密码留空表示不修改
        if (!payload.password) delete payload.password
        await userApi.updateUser(editing.id, payload)
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

  // 列表 Switch 切换启用状态：后端 Update 为字段守卫式部分更新，只传 status
  const [togglingId, setTogglingId] = useState(null)
  const handleToggleStatus = async (record, checked) => {
    setTogglingId(record.id)
    try {
      await userApi.updateUser(record.id, { status: checked ? 1 : 0 })
      Message.success(checked ? '已启用' : '已停用')
      fetchList()
    } catch (e) {
      // 错误已在请求层提示
    } finally {
      setTogglingId(null)
    }
  }

  // 打开重置密码弹窗
  const openResetPassword = (record) => {
    setResetTarget(record)
    resetForm.setFieldsValue({ new_password: '123456' })
    setResetModalVisible(true)
  }

  // 提交重置密码
  const handleResetPassword = async () => {
    const values = await resetForm.validate()
    setResetSaving(true)
    try {
      await userApi.resetUserPassword(resetTarget.id, { new_password: values.new_password })
      Message.success('重置密码成功')
      setResetModalVisible(false)
    } catch (e) {
      // 错误已在请求层提示
    } finally {
      setResetSaving(false)
    }
  }

  // 打开用户档案抽屉：列表接口已 Preload Profile/Roles/Dept，直接用行数据，无需再请求 GET /users/:id
  const openDetail = (record) => {
    setDetailVisible(true)
    setDetailUser(record)
    setDetailLoading(false)
    setDetailEditing(false)
    const profile = record.profile || {}
    profileForm.setFieldsValue({
      username: record.username || '',
      email: record.email || '',
      phone: record.phone || '',
      dept_ids: (record.dept_ids || []).map((d) => d.id),
      role_ids: (record.roles || []).map((r) => r.id),
      nickname: profile.nickname || '',
      gender: profile.gender ?? 0,
      birthday: profile.birthday || '',
      address: profile.address || '',
      join_date: profile.join_date || '',
      emergency_contact: profile.emergency_contact || '',
    })
  }

  // 保存用户详情：基础信息+部门+角色走一次 PUT /users/:id，档案走 PUT /users/:id/profile
  const handleSaveProfile = async () => {
    const values = await profileForm.validate()
    setProfileSaving(true)
    try {
      // 1) 基础信息：邮箱、手机号、部门、角色（role_ids 已合并进 updateUser 接口）
      await userApi.updateUser(detailUser.id, {
        email: values.email || '',
        phone: values.phone || '',
        dept_ids: Array.isArray(values.dept_ids) ? values.dept_ids.map(Number) : [],
        role_ids: Array.isArray(values.role_ids) ? values.role_ids.map(Number) : [],
      })
      // 2) 详细档案：单独走 updateUserProfile
      await userApi.updateUserProfile(detailUser.id, {
        nickname: values.nickname,
        gender: values.gender,
        birthday: values.birthday || '',
        address: values.address,
        join_date: values.join_date || '',
        emergency_contact: values.emergency_contact,
      })
      Message.success('保存成功')
      setDetailVisible(false)
      fetchList()
    } catch (e) {
      // 错误已在请求层提示
    } finally {
      setProfileSaving(false)
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
    { key: 'username', title: '用户名', dataIndex: 'username', width: 120 },
    { key: 'nickname', title: '姓名 ', dataIndex: 'profile.nickname', width: 120 },
    {
      key: 'dept',
      title: '部门',
      align: 'center',
      dataIndex: 'dept_ids',
      render: (deptIds) =>
        (deptIds || []).length
          ? deptIds.map((d) => (
              <Tag key={d.id} color={getRoleColor(d)} className="mr-1">
                {d.name}
              </Tag>
            ))
          : '-',
    },
    {
      key: 'roles',
      title: '角色',
      align: 'center',
      dataIndex: 'roles',
      render: (roles) =>
        (roles || []).map((r) => (
          <Tag key={r.id} color={getRoleColor(r)} className="mr-1">
            {r.name}
          </Tag>
        )),
    },
    { key: 'phone', title: '手机号', dataIndex: 'phone', render: (v) => v || '-',width: 140 },
    {
      key: 'created_at',
      title: '创建时间',
      dataIndex: 'created_at',
      width: 180,
      render: (v) => v?.slice(0, 19).replace('T', ' '),
    },
    {
      key: 'status',
      title: '状态',
      dataIndex: 'status',
      width: 80,
      align: 'center',
      render: (status, record) =>
        canEdit && record.id !== 1 ? (
          <Switch
            size="small"
            checked={status === 1}
            loading={togglingId === record.id}
            onChange={(checked) => handleToggleStatus(record, checked)}
          />
        ) : status === 1 ? (
          <Tag color="green">启用</Tag>
        ) : (
          <Tag color="red">停用</Tag>
        ),
    },
    canEdit && {
      key: 'action',
      title: '操作',
      width: 120,
      render: (_, record) => (
        <Space>
          <Button size="mini" onClick={() => openResetPassword(record)}>
            重置密码
          </Button>
          <Button size="mini" onClick={() => openDetail(record)}>
            用户档案
          </Button>
          {record.status !== 1 && record.id !== 1 && (
            <Popconfirm
              position="lb"
              focusLock
              title="确认删除该用户？"
              onOk={() => handleDelete(record)}
            >
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

  // 操作列固定显示，其余按 visibleCols 过滤
  const visibleColumns = columns.filter((c) => c.key === 'action' || visibleCols.includes(c.key))

  return (
    <Card title="用户管理">
      {/* 搜索区域 */}
      <div className="mb-3">
        <Space wrap>
          <Input
            className="w-55!"
            placeholder="按用户名搜索"
            allowClear
            value={keyword}
            onChange={setKeyword}
            onPressEnter={handleSearch}
          />
          <TreeSelect
            multiple
            className="w-55!"
            placeholder="按部门筛选（可多选）"
            allowClear
            treeData={toTreeData(deptTree)}
            value={deptFilter}
            onChange={setDeptFilter}
          />
          <Select
            mode="multiple"
            className="w-55!"
            placeholder="按角色筛选（可多选）"
            allowClear
            value={roleFilter}
            onChange={setRoleFilter}
            options={(allRoles || []).map((r) => ({ label: r.name, value: r.id }))}
          />
          <Button type="primary" onClick={handleSearch}>
            搜索
          </Button>
          <Button onClick={handleReset}>重置</Button>
        </Space>
      </div>

      {/* 表格工具栏 */}
      <div className="mb-3 flex items-center justify-between">
        {canEdit ? (
          <Button type="primary" icon={<IconPlus />} onClick={openCreate}>
            新增用户
          </Button>
        ) : (
          <div />
        )}
        <Space>
          <Button size="small" icon={<IconRefresh />} onClick={() => fetchList()}>
            刷新
          </Button>
          <Dropdown droplist={sizeMenu} trigger="click" position="br">
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
        title={editing ? '编辑用户' : '新增用户'}
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
                label="用户名"
                field="username"
                disabled={editing}
                rules={[
                  { required: true, message: '请输入用户名' },
                  { minLength: 2, maxLength: 64, message: '长度 2-64 个字符' },
                ]}
              >
                <Input placeholder="请输入用户名" />
              </FormItem>
            </Col>
            <Col span={12}>
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
            </Col>
            <Col span={12}>
              <FormItem
                label="邮箱"
                field="email"
                rules={[{ type: 'email', message: '邮箱格式不正确' }]}
              >
                <Input placeholder="请输入邮箱" />
              </FormItem>
            </Col>
            <Col span={12}>
              <FormItem label="手机号" field="phone">
                <Input placeholder="请输入手机号" />
              </FormItem>
            </Col>
            <Col span={12}>
              <FormItem label="部门" field="dept_ids">
                <TreeSelect
                  multiple
                  placeholder="请选择部门（可多选）"
                  allowClear
                  treeData={toTreeData(deptTree)}
                />
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
            <Col span={24}>
              <FormItem label="角色" field="role_ids">
                <Select mode="multiple" placeholder="请选择角色" allowClear>
                  {allRoles.map((r) => (
                    <Select.Option key={r.id} value={r.id}>
                      {r.name}
                    </Select.Option>
                  ))}
                </Select>
              </FormItem>
            </Col>
          </Row>
        </Form>
      </Modal>
      {/* 重置密码弹窗 */}
      <Modal
        title={`重置密码 - ${resetTarget?.username || ''}`}
        visible={resetModalVisible}
        onOk={handleResetPassword}
        confirmLoading={resetSaving}
        onCancel={() => setResetModalVisible(false)}
        unmountOnExit
        className="w-110! max-w-[90vw]"
      >
        <Form form={resetForm} layout="vertical" autoComplete="off">
          <FormItem
            label="新密码"
            field="new_password"
            tooltip={<div>默认：123456</div>}
            rules={[
              { required: true, message: '请输入新密码' },
              { minLength: 6, maxLength: 64, message: '长度 6-64 个字符' },
            ]}
          >
            <Input.Password placeholder="请输入新密码" />
          </FormItem>
        </Form>
      </Modal>
      {/* 用户档案抽屉：默认预览，点编辑进入编辑态 */}
      <Drawer
        title={
          <span className="flex items-center gap-3">
            <span>用户档案 - {detailUser?.username || ''}</span>
            {canEdit && !detailEditing && (
              <Button size="mini" type="primary" onClick={() => setDetailEditing(true)}>
                编辑
              </Button>
            )}
          </span>
        }
        visible={detailVisible}
        width={640}
        unmountOnExit
        onCancel={() => setDetailVisible(false)}
        footer={
          detailEditing ? (
            <div className="flex justify-end gap-2">
              <Button
                onClick={() => {
                  setDetailEditing(false)
                  openDetail(detailUser)
                }}
              >
                取消
              </Button>
              <Button type="primary" loading={profileSaving} onClick={handleSaveProfile}>
                保存
              </Button>
            </div>
          ) : null
        }
      >
        {detailLoading ? (
          <div className="flex justify-center py-10">
            <Spin />
          </div>
        ) : detailEditing ? (
          /* 编辑态：基础信息 + 详细档案 同一表单 */
          <Form
            form={profileForm}
            layout="horizontal"
            autoComplete="off"
            size="small"
            labelCol={{ span: 4 }}
            wrapperCol={{ span: 20 }}
          >
            <FormItem label="用户名" field="username" disabled>
              <Input placeholder="请输入用户名" allowClear />
            </FormItem>
            <FormItem
              label="邮箱"
              field="email"
              rules={[{ type: 'email', message: '邮箱格式不正确' }]}
            >
              <Input placeholder="请输入邮箱" allowClear />
            </FormItem>
            <FormItem label="手机号" field="phone">
              <Input placeholder="请输入手机号" allowClear />
            </FormItem>
            <FormItem label="部门" field="dept_ids">
              <TreeSelect
                multiple
                placeholder="请选择部门（可多选）"
                allowClear
                treeData={toTreeData(deptTree)}
              />
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

            <Divider orientation="left">详细档案</Divider>
            <FormItem
              label="姓名"
              field="nickname"
              rules={[{ maxLength: 64, message: '姓名不能超过 64 个字符' }]}
            >
              <Input placeholder="请输入姓名" allowClear />
            </FormItem>
            <FormItem label="性别" field="gender">
              <Radio.Group>
                <Radio value={1}>男</Radio>
                <Radio value={2}>女</Radio>
              </Radio.Group>
            </FormItem>
            <FormItem label="出生日期" field="birthday">
              <DatePicker placeholder="请选择出生日期" allowClear className="w-full" />
            </FormItem>
            <FormItem label="入职日期" field="join_date">
              <DatePicker placeholder="请选择入职日期" allowClear className="w-full" />
            </FormItem>
            <FormItem
              label="联系地址"
              field="address"
              rules={[{ maxLength: 255, message: '联系地址不能超过 255 个字符' }]}
            >
              <Input placeholder="请输入联系地址" allowClear />
            </FormItem>
            <FormItem
              label="紧急联系人"
              field="emergency_contact"
              rules={[{ maxLength: 64, message: '紧急联系人不能超过 64 个字符' }]}
            >
              <Input placeholder="请输入紧急联系人" allowClear />
            </FormItem>
          </Form>
        ) : (
          /* 预览态：只读展示 */
          <>
            <Descriptions
              column={1}
              labelStyle={{ width: 110, textAlign: 'right', paddingRight: 20 }}
              data={[
                { label: '用户名', value: detailUser?.username || '-' },
                { label: '邮箱', value: detailUser?.email || '-' },
                { label: '手机号', value: detailUser?.phone || '-' },
                {
                  label: '部门',
                  value: (detailUser?.dept_ids || []).length
                    ? detailUser.dept_ids.map((d) => (
                        <Tag key={d.id} color={getRoleColor(d)} className="mr-1">
                          {d.name}
                        </Tag>
                      ))
                    : '-',
                },
                {
                  label: '角色',
                  value:
                    (detailUser?.roles || []).map((r) => (
                      <Tag key={r.id} color={getRoleColor(r)} className="mr-1">
                        {r.name}
                      </Tag>
                    )) || '-',
                },
                {
                  label: '状态',
                  value:
                    detailUser?.status === 1 ? (
                      <Tag color="green">启用</Tag>
                    ) : (
                      <Tag color="red">停用</Tag>
                    ),
                },
                {
                  label: '创建时间',
                  value: detailUser?.created_at?.slice(0, 19).replace('T', ' ') || '-',
                },
              ]}
            />

            <Divider orientation="left">详细档案</Divider>
            <Descriptions
              column={1}
              labelStyle={{ width: 110, textAlign: 'right', paddingRight: 20 }}
              data={[
                { label: '姓名', value: detailUser?.profile?.nickname || '-' },
                {
                  label: '性别',
                  value:
                    detailUser?.profile?.gender === 1
                      ? '男'
                      : detailUser?.profile?.gender === 2
                        ? '女'
                        : '-',
                },
                { label: '出生日期', value: detailUser?.profile?.birthday || '-' },
                { label: '联系地址', value: detailUser?.profile?.address || '-' },
                { label: '入职日期', value: detailUser?.profile?.join_date || '-' },
                { label: '紧急联系人', value: detailUser?.profile?.emergency_contact || '-' },
              ]}
            />
          </>
        )}
      </Drawer>
    </Card>
  )
}
