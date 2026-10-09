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
  Table,
  Tag,
  Tooltip,
  TreeSelect,
} from '@arco-design/web-react'
import { IconList, IconPlus, IconRefresh, IconSettings } from '@arco-design/web-react/icon'
import { useCallback, useEffect, useState } from 'react'
import * as deptApi from 'src/api/dept'
import { fetchAll } from 'src/api/fetchAll'
import * as userApi from 'src/api/user'
import { SIZE_OPTIONS } from 'src/config/app'
import { usePermission } from 'src/hooks/usePermission'

const FormItem = Form.Item
const Row = Grid.Row
const Col = Grid.Col
const MenuItem = Menu.Item

// 可配置列 key（操作列固定显示，不参与列设置）
const ALL_COL_KEYS = ['name', 'leader', 'sort', 'status', 'created_at']
function toTreeData(depts) {
  return (depts || []).map((d) => ({
    key: String(d.id),
    title: d.name,
    value: d.id,
    children: d.children ? toTreeData(d.children) : undefined,
  }))
}

const EMPTY_FORM = {
  name: '',
  parent_id: undefined,
  leader: undefined,
  sort: 1,
  status: 1,
}

export default function DeptManage() {
  const { hasPerm } = usePermission()
  const [tree, setTree] = useState([])
  const [loading, setLoading] = useState(false)

  // 表格密度 & 列可见性
  const [tableSize, setTableSize] = useState('default')
  const [visibleCols, setVisibleCols] = useState(ALL_COL_KEYS)

  const [modalVisible, setModalVisible] = useState(false)
  const [editing, setEditing] = useState(null)
  const [saving, setSaving] = useState(false)
  const [form] = Form.useForm()

  // 负责人下拉选项：全量用户（展示优先 nickname，回退 username；搜索 nickname + username 均可命中）
  const [userOptions, setUserOptions] = useState([])

  // 负责人下拉选项：仅弹窗需要时按需拉取一次
  const ensureUserOptions = useCallback(async () => {
    if (userOptions.length > 0) return
    try {
      const res = await fetchAll(userApi.listUsers)
      const users = res?.data?.list || res?.data || []
      setUserOptions(
        users.map((u) => {
          const nickname = u.profile?.nickname
          return {
            label: nickname || u.username, // 展示：优先 nickname，无 nickname 时回退 username
            value: u.id,
            searchText: `${nickname || ''} ${u.username || ''}`.toLowerCase(), // 搜索：nickname + username 均可命中
          }
        }),
      )
    } catch (e) {
      // 错误已在请求层提示
    }
  }, [userOptions])

  const fetchTree = useCallback(async () => {
    setLoading(true)
    try {
      const res = await deptApi.getDeptTree()
      setTree(res.data || [])
    } catch (e) {
      // 错误已在请求层提示
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchTree()
    ensureUserOptions()
  }, [fetchTree, ensureUserOptions])

  const openCreate = (parentId) => {
    setEditing(null)
    form.setFieldsValue({ ...EMPTY_FORM, parent_id: parentId || undefined })
    setModalVisible(true)
    ensureUserOptions()
  }

  const openEdit = (record) => {
    setEditing(record)
    form.setFieldsValue({
      name: record.name,
      parent_id: record.parent_id || undefined,
      leader: record.leader,
      sort: record.sort,
      status: record.status,
    })
    setModalVisible(true)
    ensureUserOptions()
  }

  const handleSave = async () => {
    const values = await form.validate()
    setSaving(true)
    try {
      if (editing) {
        await deptApi.updateDept(editing.id, values)
        Message.success('保存成功')
      } else {
        await deptApi.createDept(values)
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
      await deptApi.deleteDept(record.id)
      Message.success('删除成功')
      fetchTree()
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
    { key: 'name', title: '部门名称', dataIndex: 'name' },
    {
      key: 'leader',
      title: '负责人',
      dataIndex: 'leader',
      render: (v) => {
        const u = userOptions.find((o) => o.value === v)
        return u ? u.label : '-'
      },
    },
    { key: 'sort', title: '排序', dataIndex: 'sort', width: 80,align: 'center', },
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
      key: 'created_at',
      title: '创建时间',
      dataIndex: 'created_at',
      width: 180,
      render: (v) => v?.slice(0, 19).replace('T', ' '),
    },
    {
      key: 'action',
      title: '操作',
      width: 220,
      render: (_, record) =>
        hasPerm('system:dept:edit') && (
          <Space>
            <Button size="mini" onClick={() => openCreate(record.id)}>
              新增子部门
            </Button>
            <Button size="mini" onClick={() => openEdit(record)}>
              编辑
            </Button>
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
                title="确认删除该部门？"
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

  const visibleColumns = columns.filter((c) => c.key === 'action' || visibleCols.includes(c.key))

  return (
    <Card title="部门管理">
      {/* 表格工具栏 */}
      <div className="mb-3 flex items-center justify-between">
        {hasPerm('system:dept:edit') ? (
          <Button type="primary" icon={<IconPlus />} onClick={() => openCreate()}>
            新增部门
          </Button>
        ) : (
          <div />
        )}
        <Space>
          <Button size="small" icon={<IconRefresh />} onClick={fetchTree}>
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
        data={tree}
        loading={loading}
        size={tableSize}
        pagination={false}
        childrenKey="children"
        defaultExpandAllRows
      />

      <Modal
        title={editing ? '编辑部门' : '新增部门'}
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
                label="部门名称"
                field="name"
                rules={[
                  { required: true, message: '请输入部门名称' },
                  { minLength: 2, maxLength: 64, message: '长度 2-64 个字符' },
                ]}
              >
                <Input placeholder="如：技术部" />
              </FormItem>
            </Col>
            <Col span={12}>
              <FormItem label="上级部门" field="parent_id">
                <TreeSelect placeholder="不选则为顶级部门" allowClear treeData={toTreeData(tree)} />
              </FormItem>
            </Col>
            <Col span={24}>
              <FormItem label="负责人" field="leader">
                <Select
                  placeholder="请选择负责人"
                  allowClear
                  showSearch
                  filterOption={(input, option) =>
                    (option.props.searchText || String(option.props.children).toLowerCase()).includes(
                      input.toLowerCase(),
                    )
                  }
                >
                  {userOptions.map((u) => (
                    <Select.Option key={u.value} value={u.value} searchText={u.searchText}>
                      {u.label}
                    </Select.Option>
                  ))}
                </Select>
              </FormItem>
            </Col>
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
