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
} from '@arco-design/web-react'
import { IconList, IconPlus, IconRefresh, IconSettings } from '@arco-design/web-react/icon'
import { useCallback, useEffect, useState } from 'react'
import * as examineGroupApi from 'src/api/examineGroup'
import { fetchAll } from 'src/api/fetchAll'
import * as userApi from 'src/api/user'
import { SIZE_OPTIONS } from 'src/config/app'
import { usePermission } from 'src/hooks/usePermission'

const FormItem = Form.Item
const Row = Grid.Row
const Col = Grid.Col
const MenuItem = Menu.Item

// 可配置列 key（操作列固定显示，不参与列设置）
const ALL_COL_KEYS = ['index', 'name', 'approvers', 'sort', 'status']

const EMPTY_FORM = {
  name: '',
  approver_ids: [],
  sort: 1,
  status: 1,
}

export default function ExamineGroupManage() {
  const { hasPerm } = usePermission()
  const canEdit = hasPerm('system:examine:edit')
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

  // 审核人下拉选项：全量用户（展示优先 nickname，回退 username；searchText 同时保留 nickname+username 供搜索匹配）
  const [userOptions, setUserOptions] = useState([])

  const fetchList = useCallback(
    async (p = page, s = size) => {
      setLoading(true)
      try {
        const params = { page: p, size: s }
        if (appliedKeyword) params.name = appliedKeyword
        const res = await examineGroupApi.listExamineGroups(params)
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

  // 审核人下拉选项：仅编辑/新增弹窗需要时按需拉取一次
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
    ensureUserOptions()
  }

  const openEdit = async (record) => {
    setEditing(record)
    ensureUserOptions()
    // 详情接口返回翻译后的 approvers；直接用 approver_ids 回填更可靠
    const ids = Array.isArray(record.approver_ids) ? record.approver_ids : []
    form.setFieldsValue({
      name: record.name,
      approver_ids: ids,
      sort: record.sort,
      status: record.status,
    })
    setModalVisible(true)
  }

  const handleSave = async () => {
    const values = await form.validate()
    setSaving(true)
    try {
      if (editing) {
        await examineGroupApi.updateExamineGroup(editing.id, values)
        Message.success('保存成功')
      } else {
        await examineGroupApi.createExamineGroup(values)
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
      await examineGroupApi.deleteExamineGroup(record.id)
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
      await examineGroupApi.updateExamineGroup(record.id, { status: checked ? 1 : 0 })
      Message.success(checked ? '已启用' : '已停用')
      fetchList()
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
    {
      key: 'index',
      title: '序号',
      dataIndex: 'index',
      width: 62,
      align: 'center',
      render: (_, __, index) => index + 1,
    },
    { key: 'name', title: '组名称', dataIndex: 'name', width: 200 },
    {
      key: 'approvers',
      title: '审核人',
      dataIndex: 'approvers',
      render: (approvers) => {
        const names = Array.isArray(approvers) ? approvers.map((a) => a.name).filter(Boolean) : []
        if (names.length === 0) return '-'
        return (
          <Space wrap>
            {names.map((n) => (
              <Tag key={n} color="arcoblue">
                {n}
              </Tag>
            ))}
          </Space>
        )
      },
    },
    { key: 'sort', title: '排序', dataIndex: 'sort', width: 80, align: 'center' },
    {
      key: 'status',
      title: '状态',
      dataIndex: 'status',
      width: 80,
      align: 'center',
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
      width: 80,
      render: (_, record) => (
        <Space>
          <Button size="mini" onClick={() => openEdit(record)}>
            编辑
          </Button>
          {record.status !== 1 && (
            <Popconfirm
              position="lb"
              focusLock
              title="确认删除该审核人员组？"
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
    <Card title="审核人员组">
      {/* 搜索区域 */}
      <div className="mb-3">
        <Space wrap>
          <Input
            className="w-55!"
            placeholder="按组名称搜索"
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
        {canEdit ? (
          <Button type="primary" icon={<IconPlus />} onClick={openCreate}>
            新增审核人员组
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
        title={editing ? '编辑审核人员组' : '新增审核人员组'}
        visible={modalVisible}
        onOk={handleSave}
        confirmLoading={saving}
        onCancel={() => setModalVisible(false)}
        unmountOnExit
        className="w-160! max-w-[90vw]"
      >
        <Form form={form} layout="vertical" autoComplete="off">
          <FormItem
            label="审核人员组名称"
            field="name"
            rules={[
              { required: true, message: '请输入审核人员组名称' },
              { minLength: 1, maxLength: 64, message: '长度 1-64 个字符' },
            ]}
          >
            <Input placeholder="如：财务审核组" />
          </FormItem>
          <FormItem
            label="审核人"
            field="approver_ids"
            triggerPropName="value"
            rules={[
              { required: true, type: 'array', minLength: 1, message: '请至少选择一名审核人' },
            ]}
          >
            <Select
              allowClear
              mode="multiple"
              placeholder="请选择审核人（可多选）"
              maxTagCount={5}
              options={userOptions}
              filterOption={(input, option) => {
                const q = input.toLowerCase()
                const label = String(option.props?.children ?? option.props?.label ?? '')
                const searchText = String(option.props?.searchText ?? '')
                return label.toLowerCase().includes(q) || searchText.includes(q)
              }}
            />
          </FormItem>
          <Row gutter={20}>
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
