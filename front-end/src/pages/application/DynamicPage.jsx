import {
  Button,
  Card,
  Checkbox,
  DatePicker,
  Divider,
  Empty,
  Form,
  Grid,
  Input,
  InputNumber,
  Radio,
  Select,
  Spin,
  Switch,
  Table,
  Tabs,
  TimePicker,
  Upload,
} from '@arco-design/web-react'
import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import * as applicationApi from '../../api/application'
import NotFound from '../error/NotFound'
import { useAuth } from '../../store/auth-context'
import { renderPreviewConfig } from './elementsConfig'

const FormItem = Form.Item
const Row = Grid.Row
const Col = Grid.Col
const TabPane = Tabs.TabPane

// 无字段标签的元素（渲染时隐藏 FormItem label，如分割线 / 表格）
const NO_LABEL_TYPES = ['divider', 'table']

// 全局表单配置默认值
const DEFAULT_FORM_CONFIG = {
  layout: 'horizontal', // vertical | horizontal
  labelWidth: 100,
  labelAlign: 'right', // left | right
}

// 解析后端布局 JSON（form_layout_json / detail_layout_json 均为 { formConfig, elements } 结构）
const parseLayout = (raw) => {
  if (!raw) return null
  try {
    return {
      formConfig: { ...DEFAULT_FORM_CONFIG, ...(raw.formConfig || {}) },
      elements: Array.isArray(raw.elements) ? raw.elements : [],
    }
  } catch (e) {
    return null
  }
}

// 从元素 data_source 中提取静态选项（json 类型）
const getStaticOptions = (el) => {
  const ds = el?.data_source
  if (ds?.type === 'json' && Array.isArray(ds.options)) {
    return ds.options.filter((o) => o && (o.label || o.value))
  }
  return []
}

// 数据表格（列按 element_type 渲染单元格，可编辑时显示新增按钮 + 操作列）
function TablePreview({ el }) {
  const columns = (el.columns || []).map((col, i) => ({
    title: col.title || col.dataIndex || `列${i + 1}`,
    dataIndex: col.dataIndex || `col_${i + 1}`,
    render: (value) => {
      const renderFn = renderPreviewConfig[col.element_type]
      if (renderFn) return renderFn(col)
      return <span>{value ?? ''}</span>
    },
  }))
  const isEditable = el.editable !== false
  const action = {
    key: 'action',
    title: '操作',
    width: 60,
    render: () => (
      <Button size="mini" status="danger">
        删除
      </Button>
    ),
  }
  const finalColumns = isEditable ? [...columns, action] : columns
  return (
    <div>
      <Table size="small" border pagination={false} columns={finalColumns} data={[]} />
      {isEditable && (
        <div className="mt-2 flex justify-end">
          <Button size="mini" type="primary">
            新增
          </Button>
        </div>
      )}
    </div>
  )
}

// 渲染单个表单元素（可编辑态，按 element_type 分发）
function renderField(el) {
  const common = { placeholder: el.placeholder || undefined }
  const options = getStaticOptions(el)
  switch (el.element_type) {
    case 'textarea':
      return <Input.TextArea {...common} autoSize={{ minRows: 2 }} />
    case 'number':
      return <InputNumber style={{ width: '100%' }} {...common} />
    case 'select':
      return options.length ? (
        <Select style={{ width: '100%' }} options={options} placeholder={el.placeholder || '请选择'} />
      ) : (
        <Select style={{ width: '100%' }} placeholder={el.placeholder || '请选择'} />
      )
    case 'radio':
      return options.length ? (
        <Radio.Group options={options} />
      ) : (
        <Radio.Group>
          <Radio>选项一</Radio>
          <Radio>选项二</Radio>
        </Radio.Group>
      )
    case 'checkbox':
      return options.length ? (
        <Checkbox.Group options={options} />
      ) : (
        <Checkbox.Group>
          <Checkbox>选项一</Checkbox>
          <Checkbox>选项二</Checkbox>
        </Checkbox.Group>
      )
    case 'date':
    case 'datepicker':
      return <DatePicker {...common} style={{ width: '100%' }} />
    case 'time':
    case 'timepicker':
      return <TimePicker {...common} style={{ width: '100%' }} />
    case 'switch':
      return <Switch />
    case 'upload':
      return <Upload action="/" {...common} />
    case 'divider':
      return el.text ? (
        <Divider orientation={el.orientation || 'center'}>{el.text}</Divider>
      ) : (
        <Divider />
      )
    case 'table':
      return <TablePreview el={el} />
    default:
      return <Input {...common} />
  }
}

/**
 * 动态配置页面：根据菜单项 link_app（应用 code）加载应用配置，
 * 将 form_layout_json / detail_layout_json 中设计的布局还原为真实表单 / 表格页面。
 */
export default function DynamicPage() {
  const location = useLocation()
  const { menus, menusLoaded } = useAuth()
  const [app, setApp] = useState(null)
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState('form')

  // 从菜单树中查找当前路径对应的菜单项（获取 link_app）
  const menuItem = useMemo(() => {
    const walk = (list) => {
      for (const m of list || []) {
        if (m.path === location.pathname) return m
        if (m.children) {
          const found = walk(m.children)
          if (found) return found
        }
      }
      return null
    }
    return walk(menus)
  }, [menus, location.pathname])

  const linkApp = menuItem?.link_app

  // 按 link_app（应用 code）加载应用配置
  useEffect(() => {
    if (!linkApp) return
    let cancelled = false
    setLoading(true)
    setApp(null)
    applicationApi
      .getApplicationByCode(linkApp)
      .then((res) => {
        if (!cancelled) setApp(res.data)
      })
      .catch(() => {
        if (!cancelled) setApp(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [linkApp])

  // 菜单加载完成前显示加载中，避免误判为 404
  if (!menusLoaded) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spin />
      </div>
    )
  }

  // 非动态菜单路径（无匹配菜单或未关联应用）→ 404
  if (!menuItem || !linkApp) {
    return <NotFound />
  }

  const formLayout = parseLayout(app?.form_layout_json)
  const detailLayout = parseLayout(app?.detail_layout_json)
  const hasForm = Boolean(formLayout?.elements?.length)
  const hasDetail = Boolean(detailLayout?.elements?.length)

  const renderLayoutBody = (layout) => {
    if (!layout || !layout.elements.length) {
      return <Empty description="暂无布局配置" />
    }
    const { formConfig, elements } = layout
    const isHorizontal = formConfig.layout === 'horizontal'
    return (
      <Form
        layout={formConfig.layout}
        labelAlign={formConfig.labelAlign}
        labelCol={isHorizontal ? { style: { flexBasis: formConfig.labelWidth } } : undefined}
        wrapperCol={
          isHorizontal
            ? { style: { flexBasis: `calc(100% - ${formConfig.labelWidth}px)` } }
            : undefined
        }
      >
        <Row gutter={[12, 12]}>
          {elements.map((el, index) => {
            const noLabel = NO_LABEL_TYPES.includes(el.element_type)
            return (
              <Col span={el.width || 24} key={el.id || `el_${el.element_type}_${index}`}>
                <FormItem label={noLabel ? '' : el.label} required={Boolean(el.required) && !noLabel}>
                  {renderField(el)}
                </FormItem>
              </Col>
            )
          })}
        </Row>
      </Form>
    )
  }

  return (
    <div className="p-4">
      <Card title={app?.name || menuItem.name} className="mb-4">
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-gray-600">
          <div>页面编码：{app?.code || '-'}</div>
          <div>绑定数据表：{app?.table_name || '-'}</div>
          <div>状态：{app?.status === 1 ? '启用' : '停用'}</div>
        </div>
      </Card>
      <Card>
        {loading ? (
          <div className="flex h-40 items-center justify-center">
            <Spin />
          </div>
        ) : hasForm || hasDetail ? (
          <Tabs activeTab={activeTab} onChange={setActiveTab}>
            {hasForm && (
              <TabPane key="form" title="表单页">
                {renderLayoutBody(formLayout)}
              </TabPane>
            )}
            {hasDetail && (
              <TabPane key="detail" title="详情页">
                {renderLayoutBody(detailLayout)}
              </TabPane>
            )}
          </Tabs>
        ) : (
          <Empty description="该应用暂未配置页面布局" />
        )}
      </Card>
    </div>
  )
}
