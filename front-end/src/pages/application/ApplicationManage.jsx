import {
  Button,
  Card,
  Checkbox,
  DatePicker,
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
const ALL_COL_KEYS = [
  'index',
  'name',
  'code',
  'table_name',
  'sub_table_name',
  'bill_prefix',
  'current_version_no',
  'status',
]
const EMPTY_FORM = {
  name: '',
  code: '',
  status: 1,
  table_name: '',
  bill_prefix: '',
  sub_table_name: '',
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

  // 版本列表弹窗
  const [versionVisible, setVersionVisible] = useState(false)
  const [versionLoading, setVersionLoading] = useState(false)
  const [versionList, setVersionList] = useState([])
  const [versionApp, setVersionApp] = useState(null)
  const [editingVersion, setEditingVersion] = useState(null)
  const [editingEffectiveAt, setEditingEffectiveAt] = useState(null)

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
      status: record.status ?? 1,
      table_name: record.table_name,
      bill_prefix: record.bill_prefix || '',
      sub_table_name: record.sub_table_name || '',
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

  // 列表 Switch 切换启用状态：后端 Update 为指针式部分更新，只传 status 不动其它字段
  // 状态语义：1=启用，0=停用
  const [togglingId, setTogglingId] = useState(null)
  const handleToggleStatus = async (record, checked) => {
    setTogglingId(record.id)
    try {
      await applicationApi.updateApplication(record.id, { status: checked ? 1 : 0 })
      Message.success(checked ? '已启用' : '已停用')
      fetchList()
    } catch (e) {
      // 错误已在请求层提示
    } finally {
      setTogglingId(null)
    }
  }

  // 打开子页面：预添加独立页签并跳转，通过 state 传递流程名称
  const openSubPage = (record, module, label) => {
    const path = `/application/${record.id}/${module}`
    addTab({ path, title: `${label} - ${record.name}` })
    navigate(path)
  }

  // 打开动态列表页：配置完成后才可使用的成果入口，openSubPage 同款方式（预添加页签 + 定制标题 + 跳转）
  // 编码通过 location.state 传递（不暴露于 URL），并写入 sessionStorage 兜底刷新/页签切换
  const openListPage = (record) => {
    const path = '/application/list'
    const linkApp = `${record.code}:list`
    sessionStorage.setItem(`link_app:${path}`, linkApp)
    addTab({ path, title: `列表页 - ${record.name}` })
    navigate(path, { state: { link_app: linkApp } })
  }

  // 打开版本列表弹窗
  const openVersions = async (record) => {
    setVersionApp(record)
    setVersionVisible(true)
    setEditingVersion(null)
    setVersionLoading(true)
    try {
      const res = await applicationApi.listApplicationVersions(record.id)
      setVersionList(res.data || [])
    } catch (e) {
      setVersionList([])
    } finally {
      setVersionLoading(false)
    }
  }

  const saveEditVersion = async () => {
    if (!versionApp || !editingVersion || !editingEffectiveAt) return
    try {
      await applicationApi.updateApplicationVersionEffectiveAt(
        versionApp.id,
        editingVersion.id,
        new Date(editingEffectiveAt).toISOString(),
      )
      Message.success('生效时间已更新')
      setEditingVersion(null)
      const res = await applicationApi.listApplicationVersions(versionApp.id)
      setVersionList(res.data || [])
    } catch (e) {
      // 错误已在请求层提示
    }
  }

  const deleteVersion = async (record) => {
    try {
      await applicationApi.deleteApplicationVersion(versionApp.id, record.id)
      Message.success('已删除')
      const res = await applicationApi.listApplicationVersions(versionApp.id)
      setVersionList(res.data || [])
    } catch (e) {
      // 错误已在请求层提示
    }
  }

  const formatTime = (v) => {
    if (!v) return '-'
    const d = new Date(v)
    if (Number.isNaN(d.getTime())) return v
    const pad = (n) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  }

  const VERSION_STATUS = {
    0: { label: '待生效', color: 'orange' },
    1: { label: '已生效', color: 'green' },
    2: { label: '已失效', color: 'gray' },
  }

  // 禁止选择当前时间之前的日期/时间
  const toJsDate = (v) => {
    if (!v) return null
    if (v instanceof Date) return v
    if (typeof v.toDate === 'function') return v.toDate()
    return new Date(v)
  }
  const disablePastDate = (current) => {
    const d = toJsDate(current)
    if (!d) return false
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return d < today
  }
  const disablePastTime = (current) => {
    const empty = { disabledHours: () => [], disabledMinutes: () => [], disabledSeconds: () => [] }
    const d = toJsDate(current)
    if (!d) return empty
    const now = new Date()
    const isToday =
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate()
    if (!isToday) return empty
    return {
      disabledHours: () => Array.from({ length: now.getHours() }, (_, i) => i),
      disabledMinutes: (h) =>
        h === now.getHours() ? Array.from({ length: now.getMinutes() }, (_, i) => i) : [],
      disabledSeconds: (h, m) =>
        h === now.getHours() && m === now.getMinutes()
          ? Array.from({ length: now.getSeconds() }, (_, i) => i)
          : [],
    }
  }

  // 操作列「更多」下拉菜单分发：仅含配置类子页面入口，编辑/删除为平铺按钮
  const handleActionMenu = (key, record) => {
    if (key === 'tables') {
      openSubPage(record, 'tables', '表字段管理')
    } else if (key === 'elements') {
      openSubPage(record, 'elements', '表单元素')
    } else if (key === 'layout') {
      openSubPage(record, 'layout', '表单设置布局')
    } else if (key === 'examine') {
      openSubPage(record, 'examine', '审批配置')
    } else if (key === 'design') {
      openSubPage(record, 'design', '表单设计')
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
    {
      key: 'name',
      title: '名称',
      dataIndex: 'name',
      render: (v, record) => (
        <Typography.Text type="primary" className="cursor-pointer" onClick={() => openEdit(record)}>
          {v}
        </Typography.Text>
      ),
    },
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
      key: 'bill_prefix',
      title: '单号前缀',
      dataIndex: 'bill_prefix',
      width: 110,
      render: (v) => v || '-',
    },
    {
      key: 'current_version_no',
      title: '当前版本号',
      dataIndex: 'current_version_no',
      align: 'center',
      width: 110,
      render: (v, record) =>
        v ? (
          <Typography.Text
            type="primary"
            className="cursor-pointer"
            onClick={() => openVersions(record)}
          >
            {v}
          </Typography.Text>
        ) : (
          '-'
        ),
    },
    {
      key: 'status',
      title: '状态',
      dataIndex: 'status',
      width: 70,
      align: 'center',
      render: (status, record) =>
        hasPerm('application:edit') ? (
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
    {
      key: 'action',
      title: '操作',
      width: 150,
      render: (_, record) => {
        // 「更多」下拉菜单：仅子页面入口；编辑 / 删除保持平铺展示
        const actionMenu = (
          <Menu onClickMenuItem={(key) => handleActionMenu(key, record)}>
            <MenuItem key="tables">表字段管理</MenuItem>
            <MenuItem key="elements">表单元素管理</MenuItem>
            <MenuItem key="design">表单设计</MenuItem>
          </Menu>
        )
        return (
          hasPerm('application:edit') && (
            <Space>
              <Dropdown trigger="click" droplist={actionMenu} position="br">
                <Button size="mini" type="text">
                  配置
                  <IconDown />
                </Button>
              </Dropdown>
              <Button size="mini" onClick={() => openListPage(record)}>
                数据
              </Button>
              {record.status !== 1 && (
                <Popconfirm
                  disabled={record.status === 1}
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
              )}
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
        title={editing ? '编辑流程' : '新增流程'}
        visible={modalVisible}
        onOk={handleSave}
        confirmLoading={saving}
        onCancel={() => setModalVisible(false)}
        unmountOnExit
        className="w-160! max-w-[90vw]"
      >
        <Form form={form} layout="vertical" autoComplete="off">
          <Row gutter={20}>
            <Col span={10}>
              <FormItem label="编码" field="code">
                <Input placeholder="由系统自动生成" disabled />
              </FormItem>
            </Col>
            <Col span={14}>
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
            <Col span={10}>
              <FormItem label="状态" field="status" triggerPropName="value">
                <Select>
                  <Select.Option value={1}>启用</Select.Option>
                  <Select.Option value={0}>停用</Select.Option>
                </Select>
              </FormItem>
            </Col>
            <Col span={14}>
              <FormItem
                label="对应表"
                field="table_name"
                rules={[
                  { required: true, message: '请输入对应表' },
                  {
                    match: /^[a-zA-Z][a-zA-Z0-9_]*$/,
                    message: '只能使用英文字母开头，包含英文字母、数字和下划线',
                  },
                ]}
              >
                <Input placeholder="如：order" />
              </FormItem>
            </Col>
            <Col span={10}>
              <FormItem
                label="单号前缀"
                field="bill_prefix"
                rules={[
                  { maxLength: 10, message: '最长 10 个字符' },
                  {
                    match: /^$|^[A-Z]+$/,
                    message: '只能使用英文大写字母',
                  },
                ]}
              >
                <Input placeholder="如：CC（用于生成单据编号）" />
              </FormItem>
            </Col>
            <Col span={14}>
              <FormItem
                label="子表"
                field="sub_table_name"
                rules={[
                  {
                    match: /^$|^[a-zA-Z][a-zA-Z0-9_]*([,，][a-zA-Z][a-zA-Z0-9_]*)*$/,
                    message: '只能使用英文字母开头，包含英文字母、数字和下划线，多个用逗号隔开',
                  },
                ]}
              >
                <Input placeholder="多个子表用逗号隔开，如：order_item,order_detail" />
              </FormItem>
            </Col>
          </Row>
        </Form>
      </Modal>

      <Modal
        title={versionApp ? `${versionApp.name} - 版本列表` : '版本列表'}
        visible={versionVisible}
        footer={null}
        autoFocus={false}
        onCancel={() => {
          setVersionVisible(false)
          setEditingVersion(null)
        }}
        unmountOnExit
        className="w-240! max-w-[90vw] [&_.arco-modal-content]:max-h-[60vh] [&_.arco-modal-content]:overflow-y-auto"
      >
        <Table
          rowKey="id"
          loading={versionLoading}
          data={versionList}
          pagination={false}
          columns={[
            { title: '版本号', dataIndex: 'version_no', width: 80, align: 'center' },
            {
              title: '状态',
              dataIndex: 'status',
              width: 90,
              render: (s) => {
                const cfg = VERSION_STATUS[s] || { label: String(s), color: 'gray' }
                return <Tag color={cfg.color}>{cfg.label}</Tag>
              },
            },
            {
              title: '生效时间',
              dataIndex: 'effective_at',
              width: 220,
              render: (v, record) =>
                editingVersion?.id === record.id ? (
                  <DatePicker
                    showTime
                    size="mini"
                    style={{ width: '100%' }}
                    disabledDate={disablePastDate}
                    disabledTime={disablePastTime}
                    value={editingEffectiveAt}
                    onChange={(val) => setEditingEffectiveAt(val)}
                  />
                ) : (
                  formatTime(v)
                ),
            },
            { title: '失效时间', dataIndex: 'expired_at', width: 160, render: formatTime },
            { title: '版本说明', dataIndex: 'remark', render: (v) => v || '-' },
            {
              title: '操作',
              width: 130,
              render: (_, record) => {
                if (record.status !== 0) return '-'
                if (editingVersion?.id === record.id) {
                  return (
                    <Space size="small">
                      <Button size="mini" type="primary" onClick={saveEditVersion}>
                        保存
                      </Button>
                      <Button size="mini" onClick={() => setEditingVersion(null)}>
                        取消
                      </Button>
                    </Space>
                  )
                }
                return (
                  <Space size="small">
                    <Button
                      size="mini"
                      onClick={() => {
                        setEditingVersion(record)
                        setEditingEffectiveAt(record.effective_at)
                      }}
                    >
                      编辑
                    </Button>
                    <Popconfirm title="确认删除该待生效版本？" onOk={() => deleteVersion(record)}>
                      <Button size="mini" status="danger">
                        删除
                      </Button>
                    </Popconfirm>
                  </Space>
                )
              },
            },
          ]}
        />
      </Modal>
    </Card>
  )
}
