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
import { IconList, IconRefresh, IconSettings, IconSync } from '@arco-design/web-react/icon'
import { useCallback, useEffect, useState } from 'react'
import * as apiDefinitionApi from 'src/api/apiDefinition'
import { SIZE_OPTIONS } from 'src/config/app'
import { usePermission } from 'src/hooks/usePermission'
import { API_PREFIX } from 'src/utils/constants'
import { formatJsonQuotes } from 'src/utils/json'
import SqlEditor from './SqlEditor'

const MenuItem = Menu.Item

// 可配置列 key（操作列固定显示，不参与列设置）
const ALL_COL_KEYS = [
  'index',
  'name',
  'method',
  'path',
  'type',
  'sort',
  'status',
  'remark',
  'referenced',
]

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

// 定义方式枚举
const TYPE_OPTIONS = [
  { label: 'SQL 直查', value: 'sql' },
  { label: 'HTTP 转发', value: 'http' },
]

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

// 格式化试调结果：错误信息优先，其次字符串 raw，最后 JSON 美化输出
function formatDebugResult(debugResult) {
  if (debugResult.error) return debugResult.error
  const raw = debugResult.raw
  if (typeof raw === 'string') return raw
  return JSON.stringify(raw, null, 2)
}

const EMPTY_FORM = {
  name: '',
  method: 'GET',
  path: '',
  type: 'sql',
  sql_template: '',
  target_path: '',
  params_json: '',
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

  // 搜索条件：关键字（名称/路径）+ 请求方法 + 定义方式（应用后才触发查询）
  const [keyword, setKeyword] = useState('')
  const [keywordMethod, setKeywordMethod] = useState('')
  const [keywordType, setKeywordType] = useState('')
  const [appliedKeyword, setAppliedKeyword] = useState('')
  const [appliedMethod, setAppliedMethod] = useState('')
  const [appliedType, setAppliedType] = useState('')

  // 表格密度 & 列可见性
  const [tableSize, setTableSize] = useState('default')
  const [visibleCols, setVisibleCols] = useState(ALL_COL_KEYS)

  // 新增 / 编辑抽屉
  const [drawerVisible, setDrawerVisible] = useState(false)
  const [editing, setEditing] = useState(null)
  const [saving, setSaving] = useState(false)
  const [form] = Form.useForm()
  const defType = Form.useWatch('type', form) || 'sql'
  const targetMethod = Form.useWatch('method', form) || 'GET' // 转发方法与对外方法一致

  // 抽屉内嵌试调
  const [debugParams, setDebugParams] = useState('')
  const [debugging, setDebugging] = useState(false)
  const [debugResult, setDebugResult] = useState(null) // { raw, error }

  const fetchList = useCallback(async () => {
    setLoading(true)
    try {
      const params = { page, size }
      if (appliedKeyword) params.keyword = appliedKeyword
      if (appliedMethod) params.method = appliedMethod
      if (appliedType) params.type = appliedType
      const res = await apiDefinitionApi.listApiDefinitions(params)
      setList(res.data.list || [])
      setTotal(res.data.total || 0)
    } catch (e) {
      // 错误已在请求层提示
    } finally {
      setLoading(false)
    }
  }, [page, size, appliedKeyword, appliedMethod, appliedType])

  useEffect(() => {
    fetchList()
  }, [page, size, fetchList])

  // 一键导入后端全部业务路由为 HTTP 转发定义
  const handleImportRoutes = () => {
    Modal.confirm({
      title: '同步后端路由',
      content:
        '将后端全部业务路由（排除接口管理自身、登录、SSE 推送）导入为 HTTP 转发定义，已存在的接口自动跳过。确定导入？',
      okText: '导入',
      cancelText: '取消',
      onOk: async () => {
        const res = await apiDefinitionApi.importBackendRoutes()
        Message.success(`已导入 ${res.data?.imported ?? 0} 条后端路由`)
        fetchList()
      },
    })
  }

  const handleSearch = () => {
    setAppliedKeyword(keyword)
    setAppliedMethod(keywordMethod)
    setAppliedType(keywordType)
    setPage(1)
  }

  const handleReset = () => {
    setKeyword('')
    setKeywordMethod('')
    setKeywordType('')
    setAppliedKeyword('')
    setAppliedMethod('')
    setAppliedType('')
    setPage(1)
  }

  // 回填表单全量字段（新增/编辑共用）
  const fillForm = (record) => {
    form.setFieldsValue({
      name: record.name || '',
      method: record.method || 'GET',
      path: record.path || '',
      type: record.type || 'sql',
      sql_template: record.sql_template || '',
      target_path: record.target_path || '',
      params_json: objToJson(record.params),
      status: record.status ?? 1,
      sort: record.sort ?? 1,
      remark: record.remark || '',
    })
  }

  const openCreate = () => {
    setEditing(null)
    form.resetFields()
    form.setFieldsValue(EMPTY_FORM)
    setDebugParams('')
    setDebugResult(null)
    setDrawerVisible(true)
  }

  const openEdit = (record) => {
    setEditing(record)
    fillForm(record)
    setDebugParams('')
    setDebugResult(null)
    setDrawerVisible(true)
  }

  // 组装保存 payload：params_json -> params 对象；解析失败返回 undefined
  const buildPayload = (values) => {
    const pj = values.params_json
    let params = {}
    if (pj && String(pj).trim()) {
      const parsed = jsonToObj(pj)
      if (parsed === undefined) return undefined
      params = parsed
    }
    return {
      name: values.name,
      method: values.method || 'GET',
      path: values.path || '',
      type: values.type || 'sql',
      sql_template: values.sql_template || '',
      target_path: values.target_path || '',
      params,
      status: values.status ?? 1,
      sort: values.sort ?? 1,
      remark: values.remark || '',
    }
  }

  const handleSave = async () => {
    const values = form.getFieldsValue()
    if (values.type === 'sql' && !String(values.sql_template || '').trim()) {
      Message.error('定义方式为 SQL 时，SQL 模板不能为空')
      return
    }
    if (values.type === 'http' && !String(values.target_path || '').trim()) {
      Message.error('定义方式为 HTTP 时，转发目标路径不能为空')
      return
    }
    const payload = buildPayload(values)
    if (payload === undefined) {
      Message.error('转发参数模板不是合法的 JSON')
      return
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
      fetchList()
    } catch (e) {
      // 错误已在请求层提示
    } finally {
      setSaving(false)
    }
  }

  // 抽屉内发起试调：params 作为 ${form.xxx} 求值的上下文
  const handleDebug = async () => {
    if (!editing) return
    const params = jsonToObj(debugParams)
    if (params === undefined) {
      setDebugResult({ error: '试调参数不是合法的 JSON' })
      return
    }
    setDebugging(true)
    setDebugResult(null)
    try {
      const res = await apiDefinitionApi.debugApiDefinition({
        id: editing.id,
        params,
      })
      if (res.code !== 0) {
        // 业务结果型错误（code=1）：静默放行后由页面展示，不弹全局 Message
        setDebugResult({ error: res.msg || '试调失败' })
        return
      }
      setDebugResult(res.data)
    } catch (e) {
      // 网络异常等非业务错误兜底
      setDebugResult({ error: e?.message || '试调失败' })
    } finally {
      setDebugging(false)
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
    { key: 'name', title: '接口名称', dataIndex: 'name', width: 160 },
    {
      key: 'method',
      title: '方法',
      dataIndex: 'method',
      width: 70,
      render: (m) => <Tag color={METHOD_COLOR[m] || 'gray'}>{m || 'GET'}</Tag>,
    },
    {
      key: 'type',
      title: '定义方式',
      dataIndex: 'type',
      width: 100,
      render: (t) =>
        t === 'http' ? <Tag color="purple">HTTP 转发</Tag> : <Tag color="arcoblue">SQL 直查</Tag>,
    },
    {
      key: 'path',
      title: '对外路径',
      dataIndex: 'path',
      render: (v) =>
        v ? (
          <Typography.Text className="mb-0!" code copyable>
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
      width: 220,
      render: (v) => (
        <div style={{ maxWidth: 220, overflow: 'hidden' }}>
          <Typography.Ellipsis showTooltip>{v || '-'}</Typography.Ellipsis>
        </div>
      ),
    },
    { key: 'sort', title: '排序', dataIndex: 'sort', width: 70, align: 'center' },
    {
      key: 'referenced',
      title: '引用',
      dataIndex: 'referenced',
      width: 100,
      align: 'center',
      render: (n) =>
        n > 0 ? <Tag color="orange">{`被引用 ${n} 次`}</Tag> : <Tag color="gray">未引用</Tag>,
    },
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
      key: 'action',
      title: '操作',
      width: 150,
      render: (_, record) =>
        canEdit ? (
          <Space>
            <Button size="mini" onClick={() => openEdit(record)}>
              编辑
            </Button>
            <Popconfirm
              position="lb"
              focusLock
              disabled={record.referenced > 0}
              title="确认删除该接口？"
              onOk={() => handleDelete(record)}
            >
              <Button size="mini" status="danger" disabled={record.referenced > 0}>
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

  const isNew = !editing

  return (
    <Card
      title="接口管理"
      extra={
        canEdit && (
          <Button icon={<IconSync />} onClick={handleImportRoutes}>
            同步后端路由
          </Button>
        )
      }
    >
      {/* 搜索区域：关键字（接口名称 / 对外路径）+ 方法 + 定义方式 */}
      <div className="mb-3">
        <Space wrap>
          <Input
            className="w-60!"
            placeholder="按接口名称 / 对外路径搜索"
            allowClear
            value={keyword}
            onChange={setKeyword}
            onPressEnter={handleSearch}
          />
          <Select
            className="w-28!"
            placeholder="请求方法"
            allowClear
            value={keywordMethod || undefined}
            onChange={(v) => setKeywordMethod(v || '')}
            options={METHOD_OPTIONS}
          />
          <Select
            className="w-32!"
            placeholder="定义方式"
            allowClear
            value={keywordType || undefined}
            onChange={(v) => setKeywordType(v || '')}
            options={TYPE_OPTIONS}
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
          <Button size="small" icon={<IconRefresh />} onClick={() => fetchList()}>
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

      {/* 新增 / 编辑抽屉：50% 宽，全字段分区一次提交 */}
      <Drawer
        title={editing ? '编辑接口' : '新增接口'}
        visible={drawerVisible}
        onCancel={() => setDrawerVisible(false)}
        width={'60%'}
        footer={
          <Space>
            <Button type="primary" loading={saving} onClick={handleSave}>
              保存
            </Button>
            <Button onClick={() => setDrawerVisible(false)}>取消</Button>
          </Space>
        }
      >
        <Form form={form} layout="vertical" autoComplete="off">
          <Row gutter={20}>
            <Col span={8}>
              <FormItem
                label="定义方式"
                field="type"
                triggerPropName="value"
                rules={[{ required: true, message: '请选择定义方式' }]}
              >
                <Select options={TYPE_OPTIONS} />
              </FormItem>
            </Col>
            <Col span={16}>
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
          </Row>
          <Row gutter={20}>
            <Col span={8}>
              <FormItem
                label="请求方法"
                field="method"
                triggerPropName="value"
                rules={[{ required: true, message: '请选择请求方法' }]}
              >
                <Select>
                  {METHOD_OPTIONS.map((o) => (
                    <Select.Option key={o.value} value={o.value}>
                      {o.label}
                    </Select.Option>
                  ))}
                </Select>
              </FormItem>
            </Col>
            <Col span={16}>
              <FormItem
                label="对外路径"
                field="path"
                rules={[
                  { required: true, message: '请输入对外路径' },
                  { minLength: 1, maxLength: 255, message: '长度 1-255 个字符' },
                ]}
                extra={`统一分发端点：${API_PREFIX}/interfaces + 该路径（仅内部相对路径，禁止绝对 URL）`}
              >
                <Input placeholder="如：/depts" />
              </FormItem>
            </Col>
          </Row>
          <Row gutter={20}>
            <Col span={12}>
              <FormItem label="排序" field="sort" triggerPropName="value">
                <InputNumber min={1} placeholder="数字越小越靠前" className="w-full!" />
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
              autoSize={{ minRows: 1, maxRows: 4 }}
              maxLength={255}
              placeholder="选填"
            />
          </FormItem>

          {defType === 'sql' && (
            <>
              <Divider orientation="left">SQL 数据源</Divider>
              <FormItem
                label="SQL 模板"
                field="sql_template"
                rules={[{ required: true, message: '请输入 SQL 模板' }]}
                extra={
                  <span>
                    占位符仅支持 {'${form.xxx}'}（如 {'${form.keyword}'}）；仅允许
                    SELECT/INSERT/UPDATE/DELETE，禁止分号、注释与危险函数，写操作必须带 WHERE；
                    数据权限条件（如 dept_id / created_by 过滤）请在模板内静态写死
                  </span>
                }
              >
                <SqlEditor
                  maxLength={8000}
                  placeholder={
                    'SELECT * FROM oa_depts WHERE name LIKE ? /* 不要写注释 */\n示例：SELECT id, name FROM oa_depts WHERE name LIKE ${form.keyword}'
                  }
                />
              </FormItem>
            </>
          )}

          {defType === 'http' && (
            <>
              <Divider orientation="left">HTTP 数据源</Divider>
              <FormItem
                label="转发目标路径"
                field="target_path"
                rules={[
                  { required: true, message: '请输入转发目标路径' },
                  { minLength: 1, maxLength: 255, message: '长度 1-255 个字符' },
                ]}
                extra="本服务内部接口相对路径（如 /depts），请求会以当前账号身份转发"
              >
                <Input placeholder="如：/depts" />
              </FormItem>
              <FormItem
                label={
                  <span className="flex w-full items-center justify-between">
                    <span>转发参数模板</span>
                    <Button
                      type="text"
                      size="mini"
                      onClick={() => {
                        const cur = form.getFieldValue('params_json')
                        if (cur === undefined || cur === null) return
                        form.setFieldValue('params_json', formatJsonQuotes(cur))
                      }}
                    >
                      格式化
                    </Button>
                  </span>
                }
                field="params_json"
                extra={
                  <span>
                    JSON 对象，值支持 {'${form.xxx}'} 占位（如 {'{"keyword": "${form.keyword}"}'}
                    ）；留空表示无参数
                  </span>
                }
              >
                <Input.TextArea
                  autoSize={{ minRows: 1, maxRows: 5 }}
                  maxLength={2000}
                  placeholder={'{"keyword": "${form.keyword}"}'}
                  style={{ fontFamily: 'monospace' }}
                />
              </FormItem>
            </>
          )}
        </Form>
        {/* 内嵌试调：仅编辑已保存的接口可用 */}
        {!isNew && (
          <div className="mt-2">
            <Alert type="info" title="保存后可发起试调" />
            <Divider orientation="left">试调</Divider>
            <Alert
              className="mb-3"
              type="warning"
              title={
                defType === 'http' && targetMethod !== 'GET'
                  ? 'HTTP 转发为非 GET 方法，会产生真实副作用（新增、修改、删除数据），请谨慎操作'
                  : defType === 'sql'
                    ? 'SQL 模板为 INSERT/UPDATE/DELETE 时会真实写入数据库，请谨慎操作'
                    : '仅发起一次只读请求，不会修改数据'
              }
              content={
                <>
                  <div>HTTP 转发：试调以当前账号身份真实执行；</div>
                  <div>
                    SQL 直查：调试的数据权限由模板内静态条件决定（如 WHERE dept_id =
                    2），所有账号看到同一份数据；模板内未写过滤条件即不过滤
                  </div>
                </>
              }
            />
            <div className="mb-1 flex items-center justify-between">
              <span className="text-sm font-medium">
                试调参数（JSON，作为 {'${form.xxx}'} 求值上下文）
              </span>
              <Button
                type="text"
                size="mini"
                onClick={() => setDebugParams(formatJsonQuotes(debugParams))}
              >
                格式化
              </Button>
            </div>
            <Input.TextArea
              autoSize={{ minRows: 1, maxRows: 5 }}
              value={debugParams}
              onChange={setDebugParams}
              placeholder='{"keyword": "研发"}'
              style={{ fontFamily: 'monospace' }}
            />
            <div className="my-2 flex items-center justify-between gap-2">
              <Button
                size="small"
                type="primary"
                status="warning"
                onClick={handleDebug}
                loading={debugging}
              >
                发起试调
              </Button>
              {debugResult && (
                <Tag color={debugResult.error ? 'red' : 'green'} className="mx-0!">
                  {debugResult.error ? '试调失败' : '试调成功'}
                </Tag>
              )}
            </div>
            <div>
              <div className="mb-2 text-sm font-medium text-gray-500">试调结果</div>
              {debugResult ? (
                <pre
                  className={`max-h-60 overflow-auto rounded p-3 text-xs ${
                    debugResult.error ? 'bg-red-50 text-red-600' : 'bg-gray-50'
                  }`}
                >
                  {formatDebugResult(debugResult)}
                </pre>
              ) : (
                <div className="rounded bg-gray-50 p-3 text-xs text-gray-400">
                  填写试调参数后点击「发起试调」查看结果
                </div>
              )}
            </div>
          </div>
        )}
      </Drawer>
    </Card>
  )
}
