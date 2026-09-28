import {
  Alert,
  Button,
  Card,
  Checkbox,
  Divider,
  Drawer,
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
  Typography,
} from '@arco-design/web-react'
import { IconList, IconRefresh, IconSettings } from '@arco-design/web-react/icon'
import { useCallback, useEffect, useState } from 'react'
import * as apiDefinitionApi from 'src/api/apiDefinition'
import { SIZE_OPTIONS } from 'src/config/app'
import { usePermission } from 'src/hooks/usePermission'

const MenuItem = Menu.Item

// 可配置列 key（操作列固定显示，不参与列设置）
const ALL_COL_KEYS = ['index', 'name', 'code', 'method', 'path', 'sort', 'status', 'remark']

const FormItem = Form.Item
const Row = Grid.Row
const Col = Grid.Col

// 请求方法枚举
const METHOD_OPTIONS = [
  { label: 'GET', value: 'GET' },
  { label: 'POST', value: 'POST' },
  { label: 'PUT', value: 'PUT' },
  { label: 'DELETE', value: 'DELETE' },
]
const METHOD_COLOR = { GET: 'arcoblue', POST: 'green', PUT: 'orangered', DELETE: 'red' }

// JSON 字符串 <-> 对象 转换：空串视为空对象；解析失败返回 undefined（由调用方提示）
function jsonToObj(str) {
  if (!str || !String(str).trim()) return {}
  try {
    const v = JSON.parse(String(str))
    return v && typeof v === 'object' ? v : {}
  } catch {
    return undefined
  }
}

function objToJson(obj) {
  if (!obj || typeof obj !== 'object') return ''
  try {
    return JSON.stringify(obj, null, 2)
  } catch {
    return ''
  }
}

// 递归统计选项总数（含 children 子节点）
function countOptions(options) {
  if (!Array.isArray(options)) return 0
  return options.reduce((sum, opt) => sum + 1 + countOptions(opt.children), 0)
}

const EMPTY_FORM = {
  name: '',
  code: '',
  method: 'GET',
  path: '',
  params_json: '',
  label: '',
  value_field: '',
  status: 1,
  sort: 1,
  remark: '',
}

export default function InterfaceManage() {
  const { hasPerm } = usePermission()
  const canEdit = hasPerm('interface:edit')
  const [list, setList] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(10)
  const [loading, setLoading] = useState(false)

  // 搜索条件：关键字 + 请求方法（应用后才触发查询）
  const [keyword, setKeyword] = useState('')
  const [keywordMethod, setKeywordMethod] = useState('')
  const [appliedKeyword, setAppliedKeyword] = useState('')
  const [appliedMethod, setAppliedMethod] = useState('')

  // 表格密度 & 列可见性
  const [tableSize, setTableSize] = useState('default')
  const [visibleCols, setVisibleCols] = useState(ALL_COL_KEYS)

  // 高级设置抽屉（请求方法 / 路径 / 参数 / 映射配置）
  const [settingsVisible, setSettingsVisible] = useState(false)

  const [modalVisible, setModalVisible] = useState(false)
  const [editing, setEditing] = useState(null)
  const [saving, setSaving] = useState(false)
  const [form] = Form.useForm()

  // 抽屉内嵌试调（不另开弹窗）
  const [debugParams, setDebugParams] = useState('')
  const [debugging, setDebugging] = useState(false)
  const [debugResult, setDebugResult] = useState(null) // { raw, options, error }

  const fetchList = useCallback(
    async () => {
      setLoading(true)
      try {
        const params = { page, size }
        if (appliedKeyword) params.keyword = appliedKeyword
        if (appliedMethod) params.method = appliedMethod
        const res = await apiDefinitionApi.listApiDefinitions(params)
        setList(res.data.list || [])
        setTotal(res.data.total || 0)
      } catch (e) {
        // 错误已在请求层提示
      } finally {
        setLoading(false)
      }
    },
    [page, size, appliedKeyword, appliedMethod],
  )

  useEffect(() => {
    fetchList()
  }, [page, size, fetchList])

  const handleSearch = () => {
    setAppliedKeyword(keyword)
    setAppliedMethod(keywordMethod)
    setPage(1)
  }

  const handleReset = () => {
    setKeyword('')
    setKeywordMethod('')
    setAppliedKeyword('')
    setAppliedMethod('')
    setPage(1)
  }

  const openCreate = () => {
    setEditing(null)
    form.setFieldsValue(EMPTY_FORM)
    setModalVisible(true)
  }

  // 回填表单全量字段（弹窗与抽屉共用，确保保存时 status 等不被零值覆盖）
  const fillForm = (record) => {
    form.setFieldsValue({
      name: record.name,
      code: record.code,
      method: record.method || 'GET',
      path: record.path,
      params_json: objToJson(record.params),
      label: record.label || '',
      value_field: record.value_field || '',
      status: record.status,
      sort: record.sort,
      remark: record.remark || '',
    })
  }

  // 打开高级设置抽屉（表格操作列「设置」）
  const openSettings = (record) => {
    setEditing(record)
    fillForm(record)
    setDebugParams(objToJson(record.params))
    setDebugResult(null)
    setSettingsVisible(true)
  }

  // 抽屉内发起试调：请求参数取抽屉内试调输入框的值，其余配置取抽屉表单当前值
  const handleDebugFromDrawer = async () => {
    if (!editing) return
    const params = jsonToObj(debugParams)
    if (params === undefined) {
      Message.error('请求参数不是合法的 JSON')
      return
    }
    setDebugging(true)
    setDebugResult(null)
    try {
      const res = await apiDefinitionApi.debugApiDefinition({
        code: editing.code,
        params,
      })
      setDebugResult(res.data)
    } catch (e) {
      // 错误已在请求层提示
    } finally {
      setDebugging(false)
    }
  }

  const openEdit = (record) => {
    setEditing(record)
    fillForm(record)
    setModalVisible(true)
  }

  // 组装设置抽屉保存 payload：高级字段的 FormItem 位于设置抽屉，
  // 未打开过时字段未注册到表单 store，getFieldsValue 取不到；
  // 此处用默认值 / editing（数据库当前值）兜底，避免缺失字段被后端零值覆盖
  const buildPayload = (values, editing) => {
    const hasParamsJson =
      values.params_json !== undefined && String(values.params_json).trim() !== ''
    const params = hasParamsJson ? jsonToObj(values.params_json) : (editing?.params ?? {})
    return {
      name: values.name ?? editing?.name,
      code: editing?.code ?? values.code,
      method: values.method || editing?.method || 'GET',
      path: values.path || editing?.path || '',
      params,
      label: values.label ?? editing?.label ?? '',
      value_field: values.value_field ?? editing?.value_field ?? '',
      status: values.status ?? editing?.status ?? 1,
      sort: values.sort ?? editing?.sort ?? 1,
      remark: values.remark ?? editing?.remark ?? '',
    }
  }

  const handleSave = async () => {
    await form.validate(['name', 'code', 'sort', 'status', 'remark'])
    // 弹窗仅编辑基础字段；method/path/params/label/value_field 等高级字段由设置抽屉维护，
    // 新增时后端对其提供默认值（method=GET、path 空、params={}），编辑时后端对空值字段保留原值，
    // 因此弹窗提交无需携带这些字段
    const values = form.getFieldsValue()
    const payload = {
      name: values.name,
      code: values.code,
      status: values.status ?? 1,
      sort: values.sort ?? 1,
      remark: values.remark ?? '',
    }
    setSaving(true)
    try {
      if (editing) {
        await apiDefinitionApi.updateApiDefinition(editing.id, payload)
        Message.success('保存成功')
      } else {
        await apiDefinitionApi.createApiDefinition(payload)
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

  // 抽屉保存：全量提交（含 status/sort/remark 等），避免部分字段缺失被零值覆盖
  const handleSaveSettings = async () => {
    if (!editing) return
    await form.validate(['path'])
    const payload = buildPayload(form.getFieldsValue(), editing)
    if (payload.params === undefined) {
      Message.error('请求参数模板不是合法的 JSON')
      return
    }
    setSaving(true)
    try {
      await apiDefinitionApi.updateApiDefinition(editing.id, payload)
      Message.success('保存成功')
      setSettingsVisible(false)
      fetchList()
    } catch (e) {
      // 错误已在请求层提示
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (record) => {
    try {
      await apiDefinitionApi.deleteApiDefinition(record.id)
      Message.success('删除成功')
      fetchList()
    } catch (e) {
      // 错误已在请求层提示
    }
  }

  const columns = [
    {
      key: 'index',
      title: '序号',
      dataIndex: 'index',
      width: 62,
      align: 'center',
      render: (_, __, index) => index + 1,
    },
    { key: 'name', title: '接口名称', dataIndex: 'name', width: 150 },
    { key: 'code', title: '接口标识', dataIndex: 'code', width: 150 },
    {
      key: 'method',
      title: '方法',
      dataIndex: 'method',
      width: 90,
      render: (m) => <Tag color={METHOD_COLOR[m] || 'gray'}>{m || 'GET'}</Tag>,
    },
    {
      key: 'path',
      title: '内部路径',
      dataIndex: 'path',
      render: (v) =>
        v ? (
          <Typography.Text className="mb-0!" code>
            {v}
          </Typography.Text>
        ) : (
          '-'
        ),
    },
    {
      key: 'remark',
      title: '备注',
      dataIndex: 'remark',
      render: (v) => (
        <Typography.Text className="mb-0!" ellipsis={{ showTooltip: true }}>
          {v || '-'}
        </Typography.Text>
      ),
    },
    { key: 'sort', title: '排序', dataIndex: 'sort', width: 70 },
    {
      key: 'status',
      title: '状态',
      dataIndex: 'status',
      width: 80,
      render: (status) =>
        status === 1 ? <Tag color="green">启用</Tag> : <Tag color="red">停用</Tag>,
    },
    {
      key: 'action',
      title: '操作',
      width: 210,
      render: (_, record) =>
        canEdit ? (
          <Space>
            <Button size="mini" onClick={() => openSettings(record)}>
              设置
            </Button>
            <Button size="mini" onClick={() => openEdit(record)}>
              编辑
            </Button>
            <Popconfirm
              position="lb"
              focusLock
              title="确认删除该接口？引用它的表单将无法加载选项"
              onOk={() => handleDelete(record)}
            >
              <Button size="mini" status="danger">
                删除
              </Button>
            </Popconfirm>
          </Space>
        ) : null,
    },
  ]

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
    <Card title="接口管理">
      {/* 搜索区域 */}
      <div className="mb-3">
        <Space wrap>
          <Input
            className="w-60!"
            placeholder="按接口名称 / 接口标识搜索"
            allowClear
            value={keyword}
            onChange={setKeyword}
            onPressEnter={handleSearch}
          />
          <Select
            className="w-32!"
            placeholder="请求方法"
            allowClear
            value={keywordMethod || undefined}
            onChange={(v) => setKeywordMethod(v || '')}
            options={METHOD_OPTIONS}
          />
          <Button type="primary" onClick={handleSearch}>
            搜索
          </Button>
          <Button onClick={handleReset}>重置</Button>
        </Space>
      </div>

      {/* 工具栏 */}
      <div className="mb-3 flex items-center justify-between">
        {canEdit && (
          <Button type="primary" onClick={openCreate}>
            新增接口
          </Button>
        )}
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

      {/* 新增 / 编辑弹窗 */}
      <Modal
        title={editing ? '编辑接口' : '新增接口'}
        visible={modalVisible}
        onCancel={() => setModalVisible(false)}
        onOk={handleSave}
        unmountOnExit
        className="w-110! max-w-[90vw]"
      >
        <Form form={form} layout="vertical" autoComplete="off">
          <Row gutter={20}>
            <Col span={12}>
              <FormItem
                label="接口名称"
                field="name"
                rules={[
                  { required: true, message: '请输入接口名称' },
                  { minLength: 1, maxLength: 64, message: '长度 1-64 个字符' },
                ]}
              >
                <Input placeholder="如：部门列表" />
              </FormItem>
            </Col>
            <Col span={12}>
              <FormItem
                label="接口标识"
                field="code"
                rules={[
                  { required: true, message: '请输入接口标识' },
                  { minLength: 1, maxLength: 64, message: '长度 1-64 个字符' },
                ]}
              >
                <Input placeholder="如：dept_list" disabled={Boolean(editing)} />
              </FormItem>
            </Col>
          </Row>
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
          <FormItem label="备注" field="remark">
            <Input.TextArea
              autoSize={{ minRows: 1, maxRows: 5 }}
              maxLength={255}
              placeholder="选填"
            />
          </FormItem>
        </Form>
      </Modal>

      {/* 接口设置抽屉：高级配置 + 内嵌试调 */}
      <Drawer
        title="接口设置"
        visible={settingsVisible}
        onCancel={() => setSettingsVisible(false)}
        width={'50%'}
        footer={
          <Space>
            <Button type="primary" loading={saving} onClick={handleSaveSettings}>
              保存
            </Button>
            <Button onClick={() => setSettingsVisible(false)}>取消</Button>
          </Space>
        }
      >
        <Form form={form} layout="vertical" autoComplete="off">
          <Row gutter={20}>
            <Col span={6}>
              <FormItem label="请求方法" field="method" triggerPropName="value">
                <Select>
                  {METHOD_OPTIONS.map((o) => (
                    <Select.Option key={o.value} value={o.value}>
                      {o.label}
                    </Select.Option>
                  ))}
                </Select>
              </FormItem>
            </Col>
            <Col span={18}>
              <FormItem
                label="内部相对路径"
                field="path"
                rules={[
                  { required: true, message: '请输入内部相对路径' },
                  { minLength: 1, maxLength: 255, message: '长度 1-255 个字符' },
                ]}
              >
                <Input placeholder="如：/depts（仅内部相对路径，禁止绝对 URL）" />
              </FormItem>
            </Col>
          </Row>
          <FormItem
            label="请求参数模板"
            field="params_json"
            extra="JSON 对象，值支持 ${form.xxx} 占位表达式；留空表示无参数"
          >
            <Input.TextArea
              autoSize={{ minRows: 1, maxRows: 5 }}
              maxLength={2000}
              placeholder={'{"keyword": "${form.keyword}"}'}
              style={{ fontFamily: 'monospace' }}
            />
          </FormItem>
          <Row gutter={20}>
            <Col span={14}>
              <FormItem
                label="显示标签表达式"
                field="label"
                extra="响应列表项的显示文本，如 ${item.name}"
              >
                <Input placeholder="如：${item.name}" />
              </FormItem>
            </Col>
            <Col span={10}>
              <FormItem
                label="选项值字段"
                field="value_field"
                extra="选项提交值取自响应项的哪个字段，如 id"
              >
                <Input placeholder="如：id" />
              </FormItem>
            </Col>
          </Row>
        </Form>

        {/* 内嵌试调：不再单独弹窗 */}
        {editing && (
          <div className="mt-2">
            <Divider orientation="left">试调</Divider>
            <Alert
              className="mb-3"
              type="warning"
              title="试调将以当前账号身份真实发起请求"
              content={
                form.getFieldValue('method') && form.getFieldValue('method') !== 'GET'
                  ? 'POST / PUT / DELETE 会产生真实副作用（新增、修改、删除数据），请谨慎操作'
                  : '仅发起一次只读请求，不会修改数据'
              }
            />
            <div className="mb-1 text-sm font-medium">请求参数（JSON，覆盖注册表模板）</div>
            <Input.TextArea
              autoSize={{ minRows: 1, maxRows: 5 }}
              value={debugParams}
              onChange={setDebugParams}
              placeholder='{"keyword": "测试"}'
              style={{ fontFamily: 'monospace' }}
            />
            <div className="my-2">
              <Button
                type="primary"
                status="warning"
                onClick={handleDebugFromDrawer}
                loading={debugging}
              >
                发起试调
              </Button>
            </div>
            {debugResult && (
              <>
                {debugResult.error ? (
                  <Alert type="error" title={debugResult.error} className="mb-3" />
                ) : (
                  <div className="mb-3 text-sm">
                    试调成功，映射出 {countOptions(debugResult.options)} 个选项
                  </div>
                )}
                {Array.isArray(debugResult.options) && debugResult.options.length > 0 && (
                  <Table
                    className="mb-3"
                    size="small"
                    rowKey={(record) => `${record.label}_${String(record.value)}`}
                    pagination={false}
                    data={debugResult.options}
                    columns={[
                      { title: 'label（显示）', dataIndex: 'label' },
                      { title: 'value（提交值）', dataIndex: 'value' },
                    ]}
                  />
                )}
                <div className="mb-1 text-sm font-medium">原始响应</div>
                <pre className="max-h-60 overflow-auto rounded bg-gray-50 p-3 text-xs">
                  {typeof debugResult.raw === 'string'
                    ? debugResult.raw
                    : JSON.stringify(debugResult.raw, null, 2)}
                </pre>
              </>
            )}
          </div>
        )}
      </Drawer>
    </Card>
  )
}
