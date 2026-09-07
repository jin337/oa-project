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
  Message,
  Radio,
  Select,
  Spin,
  Switch,
  Table,
  TimePicker,
  Upload,
} from '@arco-design/web-react'
import { IconSave } from '@arco-design/web-react/icon'
import { useEffect, useState } from 'react'
import { useLocation, useParams } from 'react-router-dom'
import * as applicationApi from '../../api/application'
import { useTabs } from '../../store/tab-context'

const FormItem = Form.Item
const Row = Grid.Row
const Col = Grid.Col

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
      const cols = (el.columns || []).map((c, i) => ({
        title: c.title || c.dataIndex || `列${i + 1}`,
        dataIndex: c.dataIndex || `col_${i + 1}`,
      }))
      return <Table size="small" border pagination={false} columns={cols} data={[]} />
    default:
      return <Input {...common} />
  }
}

/**
 * 动态表单渲染页：根据路由参数 code（应用页面编码）加载应用配置，
 * 将 form_layout_json 中设计的布局还原为可填写、可提交的动态表单页面。
 * 供审批申请项等业务入口按 code 跳转使用。
 */
export default function DynamicRender() {
  const { code } = useParams()
  const location = useLocation()
  const { addTab } = useTabs()
  const [app, setApp] = useState(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [form] = Form.useForm()

  // 按 code 加载应用配置
  useEffect(() => {
    if (!code) return
    let cancelled = false
    setLoading(true)
    setApp(null)
    applicationApi
      .getApplicationByCode(code)
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
  }, [code])

  // 页签：应用加载成功后更新标题为应用名称（不在菜单树中，需手动注册）
  useEffect(() => {
    if (app?.name) {
      addTab({ path: location.pathname, title: app.name })
    }
  }, [app?.name, location.pathname, addTab])

  // 提交动态表单（通用数据新增接口）
  const handleSubmit = async () => {
    const values = await form.validate()
    setSubmitting(true)
    try {
      await applicationApi.createApplicationData(app.id, values, app.table_name)
      Message.success('提交成功')
      form.resetFields()
    } catch (e) {
      // 错误已在请求层提示
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spin />
      </div>
    )
  }

  const layout = parseLayout(app?.form_layout_json)
  const elements = layout?.elements || []

  return (
    <Card title={app?.name || '动态表单'}>
      <div className="mb-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-gray-500">
        <div>页面编码：{app?.code || '-'}</div>
        <div>绑定数据表：{app?.table_name || '-'}</div>
        <div>状态：{app?.status === 1 ? '启用' : '停用'}</div>
      </div>

      {elements.length ? (
        <Form
          form={form}
          layout={layout.formConfig.layout}
          labelAlign={layout.formConfig.labelAlign}
          labelCol={
            layout.formConfig.layout === 'horizontal'
              ? { style: { flexBasis: layout.formConfig.labelWidth } }
              : undefined
          }
          wrapperCol={
            layout.formConfig.layout === 'horizontal'
              ? {
                  style: {
                    flexBasis: `calc(100% - ${layout.formConfig.labelWidth}px)`,
                  },
                }
              : undefined
          }
        >
          <Row gutter={[12, 12]}>
            {elements.map((el, index) => {
              const noLabel = NO_LABEL_TYPES.includes(el.element_type)
              return (
                <Col span={el.width || 24} key={el.id || `el_${el.element_type}_${index}`}>
                  <FormItem
                    label={noLabel ? '' : el.label}
                    required={Boolean(el.required) && !noLabel}
                  >
                    {renderField(el)}
                  </FormItem>
                </Col>
              )
            })}
          </Row>
          <div className="mt-4 flex justify-end">
            <Button type="primary" icon={<IconSave />} loading={submitting} onClick={handleSubmit}>
              提交
            </Button>
          </div>
        </Form>
      ) : (
        <Empty description="该应用暂未配置表单布局" />
      )}
    </Card>
  )
}
