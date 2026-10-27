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
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Tooltip,
  TreeSelect,
} from '@arco-design/web-react'
import { IconList, IconPlus, IconRefresh, IconSettings } from '@arco-design/web-react/icon'
import { useCallback, useEffect, useState } from 'react'
import { listApplications } from 'src/api/application'
import * as menuApi from 'src/api/menu'
import IconSelect, { MenuIcon } from 'src/components/icon-select'
import { SIZE_OPTIONS } from 'src/config/app'
import { usePermission } from 'src/hooks/usePermission'

const FormItem = Form.Item
const Row = Grid.Row
const Col = Grid.Col
const MenuItem = Menu.Item

// 可配置列 key（操作列固定显示，不参与列设置）
const ALL_COL_KEYS = [
  'name',
  'type',
  'path',
  'perm',
  'link_app',
  'icon',
  'sort',
  'status',
  'hidden',
]
const TYPE_MAP = { 1: '目录', 2: '菜单', 3: '按钮' }

// 关联流程的页面状态：与 DynamicPage 的 VALID_STATES 保持一致
// link_app 存储格式为 "流程编码:页面状态"（如 app_123:list-edit），缺省时降级 list
const LINK_STATE_OPTIONS = [
  { label: '列表', value: 'list' },
  { label: '列表+编辑', value: 'list-edit' },
  { label: '表单', value: 'form' },
]
const DEFAULT_LINK_STATE = 'list'

function toTreeData(menus) {
  return (menus || []).map((m) => ({
    key: String(m.id),
    title: m.name,
    value: m.id,
    children: m.children ? toTreeData(m.children) : undefined,
  }))
}

const EMPTY_FORM = {
  name: '',
  parent_id: undefined,
  type: 2,
  path: '',
  perm: '',
  icon: '',
  link_app: '',
  link_state: DEFAULT_LINK_STATE,
  sort: 1,
  status: 1,
  hidden: 0,
}

export default function MenuManage() {
  const { hasPerm } = usePermission()
  const canEdit = hasPerm('system:menu:edit')
  const [tree, setTree] = useState([])
  const [loading, setLoading] = useState(false)

  // 表格密度 & 列可见性
  const [tableSize, setTableSize] = useState('default')
  const [visibleCols, setVisibleCols] = useState(ALL_COL_KEYS)

  const [modalVisible, setModalVisible] = useState(false)
  const [editing, setEditing] = useState(null)
  const [saving, setSaving] = useState(false)
  const [formType, setFormType] = useState(2)
  const [form] = Form.useForm()
  // 流程配置列表：「关联流程」下拉选项（显示 name，提交 code）
  const [appOptions, setAppOptions] = useState([])
  // 未选择关联流程时「页面状态」不可选（没有流程则状态无意义）
  const watchedLinkApp = Form.useWatch('link_app', form)

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

  // 加载流程配置列表，供「关联流程」下拉选择
  useEffect(() => {
    listApplications({ page: 1, size: 1000, status: 1 })
      // 通过接口参数只取启用的流程配置，停用的不可被关联
      .then((res) => setAppOptions(res?.data?.list || []))
      .catch(() => setAppOptions([]))
  }, [])

  const openCreate = (parentId) => {
    setEditing(null)
    form.setFieldsValue({ ...EMPTY_FORM, parent_id: parentId || undefined })
    setFormType(2)
    setModalVisible(true)
  }

  const openEdit = (record) => {
    setEditing(record)
    // link_app 存储格式为 "流程编码:页面状态"，拆分后分别回填到两个字段
    const [linkAppCode = '', linkAppState = ''] = (record.link_app || '').split(':')
    form.setFieldsValue({
      name: record.name,
      parent_id: record.parent_id || undefined,
      type: record.type,
      path: record.path,
      perm: record.perm,
      icon: record.icon,
      link_app: linkAppCode.trim(),
      link_state: linkAppState.trim() || DEFAULT_LINK_STATE,
      sort: record.sort,
      status: record.status,
      hidden: record.hidden,
    })
    setFormType(record.type)
    setModalVisible(true)
  }

  const handleSave = async () => {
    const values = await form.validate()
    // link_app 与 link_state 合成 "流程编码:页面状态" 后提交；link_state 仅作前端中间态，不落库
    const { link_state: linkState, ...rest } = values
    const payload = {
      ...rest,
      link_app: values.link_app ? `${values.link_app}:${linkState || DEFAULT_LINK_STATE}` : '',
    }
    setSaving(true)
    try {
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

  // 列表 Switch 切换启用状态：后端 Update 为字段守卫式部分更新，只传 status
  const [togglingId, setTogglingId] = useState(null)
  const handleToggleStatus = async (record, checked) => {
    setTogglingId(record.id)
    try {
      await menuApi.updateMenu(record.id, { status: checked ? 1 : 0 })
      Message.success(checked ? '已启用' : '已停用')
      fetchTree()
    } catch (e) {
      // 错误已在请求层提示
    } finally {
      setTogglingId(null)
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
    { key: 'name', title: '菜单名称', dataIndex: 'name', width: 300 },
    {
      key: 'type',
      title: '类型',
      dataIndex: 'type',
      width: 80,
      align: 'center',
      render: (type) => {
        const color = type === 1 ? 'orangered' : type === 2 ? 'arcoblue' : 'gray'
        return <Tag color={color}>{TYPE_MAP[type] || type}</Tag>
      },
    },
    { key: 'path', title: '路由地址', dataIndex: 'path', render: (v) => v || '-' },
    { key: 'perm', title: '权限标识', dataIndex: 'perm', render: (v) => v || '-' },
    {
      key: 'link_app',
      title: '关联流程',
      dataIndex: 'link_app',
      // link_app 存 "流程编码:页面状态"，列表展示为「流程名称（页面状态）」；无配置显示 -
      render: (v) => {
        if (!v) return '-'
        const [code = '', st = ''] = String(v).split(':')
        const name = appOptions.find((a) => a.code === code.trim())?.name || code.trim()
        const state = LINK_STATE_OPTIONS.find((o) => o.value === (st.trim() || DEFAULT_LINK_STATE))
        return state ? `${name}（${state.label}）` : name
      },
    },
    {
      key: 'icon',
      title: '图标',
      dataIndex: 'icon',
      width: 80,
      align: 'center',
      render: (v) => (v ? <MenuIcon name={v} className="text-lg" /> : '-'),
    },
    { key: 'sort', title: '排序', dataIndex: 'sort', width: 80, align: 'center' },
    {
      key: 'hidden',
      title: '是否隐藏',
      dataIndex: 'hidden',
      align: 'center',
      width: 90,
      render: (hidden) => (hidden === 1 ? <Tag color="red">是</Tag> : <Tag color="green">否</Tag>),
    },
    {
      key: 'status',
      title: '状态',
      dataIndex: 'status',
      align: 'center',
      width: 80,
      render: (status, record) =>
        canEdit ? (
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
      width: 150,
      render: (_, record) => (
        <Space>
          {record.type !== 3 && (
            <Button size="mini" onClick={() => openCreate(record.id)}>
              新增子菜单
            </Button>
          )}
          <Button size="mini" onClick={() => openEdit(record)}>
            编辑
          </Button>
          {record.status !== 1 && (
            <>
              {record.children?.length > 0 ? (
                <Tooltip content="存在子节点，请先删除子节点">
                  <Button size="mini" status="danger" disabled>
                    删除
                  </Button>
                </Tooltip>
              ) : (
                <Popconfirm
                  position="lb"
                  focusLock
                  title="确认删除该菜单？"
                  onOk={() => handleDelete(record)}
                >
                  <Button size="mini" status="danger">
                    删除
                  </Button>
                </Popconfirm>
              )}
            </>
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
    <Card title="菜单管理">
      {/* 表格工具栏 */}
      <div className="mb-3 flex items-center justify-between">
        {canEdit ? (
          <Button type="primary" icon={<IconPlus />} onClick={() => openCreate()}>
            新增菜单
          </Button>
        ) : (
          <div />
        )}
        <Space>
          <Button size="small" icon={<IconRefresh />} onClick={fetchTree}>
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
        data={tree}
        loading={loading}
        size={tableSize}
        pagination={false}
        childrenKey="children"
        defaultExpandAllRows
      />

      <Modal
        title={editing ? '编辑菜单' : '新增菜单'}
        visible={modalVisible}
        onOk={handleSave}
        confirmLoading={saving}
        onCancel={() => setModalVisible(false)}
        unmountOnExit
        className="w-160! max-w-[90vw]"
      >
        <Form
          form={form}
          layout="vertical"
          autoComplete="off"
          onValuesChange={(changed) => {
            if (changed.type !== undefined) {
              setFormType(changed.type)
            }
          }}
        >
          <Row gutter={20}>
            <Col span={12}>
              <FormItem
                label="菜单名称"
                field="name"
                rules={[
                  { required: true, message: '请输入菜单名称' },
                  { minLength: 2, maxLength: 64, message: '长度 2-64 个字符' },
                ]}
              >
                <Input placeholder="如：用户管理" />
              </FormItem>
            </Col>
            <Col span={12}>
              <FormItem label="上级菜单" field="parent_id">
                <TreeSelect placeholder="不选则为顶级菜单" allowClear treeData={toTreeData(tree)} />
              </FormItem>
            </Col>
            <Col span={12}>
              <FormItem label="类型" field="type" triggerPropName="value">
                <Select>
                  <Select.Option value={1}>目录</Select.Option>
                  <Select.Option value={2}>菜单</Select.Option>
                  <Select.Option value={3}>按钮</Select.Option>
                </Select>
              </FormItem>
            </Col>
            {formType === 2 && (
              <Col span={12}>
                <FormItem label="路由地址" field="path">
                  <Input placeholder="如：/system/user" />
                </FormItem>
              </Col>
            )}
            {formType === 2 && (
              <>
                <Col span={12}>
                  <FormItem label="关联流程" field="link_app">
                    <Select
                      placeholder="请选择流程配置"
                      allowClear
                      showSearch
                      options={appOptions.map((a) => ({ label: a.name, value: a.code }))}
                    />
                  </FormItem>
                </Col>
                <Col span={12}>
                  <FormItem label="页面状态" field="link_state">
                    <Select
                      placeholder="请选择页面状态"
                      options={LINK_STATE_OPTIONS}
                      disabled={!watchedLinkApp}
                    />
                  </FormItem>
                </Col>
              </>
            )}
            <Col span={12}>
              <FormItem label="权限标识" field="perm">
                <Input placeholder="如：system:user:add" />
              </FormItem>
            </Col>
            {formType !== 3 && (
              <Col span={12}>
                <FormItem label="图标" field="icon">
                  <IconSelect />
                </FormItem>
              </Col>
            )}
            {formType !== 3 && (
              <Col span={12}>
                <FormItem label="是否隐藏" field="hidden" triggerPropName="value">
                  <Select>
                    <Select.Option value={1}>是</Select.Option>
                    <Select.Option value={0}>否</Select.Option>
                  </Select>
                </FormItem>
              </Col>
            )}
            <Col span={12}>
              <FormItem label="排序" field="sort" triggerPropName="value">
                <InputNumber min={1} placeholder="数字越小越靠前" />
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
        </Form>
      </Modal>
    </Card>
  )
}
