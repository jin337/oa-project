import { Empty, Form, Grid } from '@arco-design/web-react'
import { isNoLabelElement, parseLayoutJson, renderField } from './elementsConfig'

const FormItem = Form.Item
const Row = Grid.Row
const Col = Grid.Col

/**
 * 动态表单渲染组件（纯展示/填写，不含数据加载）：
 * 根据应用配置的 form_layout_json 将布局还原为可填写的动态表单。
 * 供动态表单页面（DynamicRender）与抽屉场景（如审批申请）共用。
 * 元素渲染统一分发至 elementsConfig 中的组件配置中心（renderField）。
 *
 * @param {object} app        应用配置对象（含 form_layout_json 等字段）
 * @param {object} form       Arco Form 实例（可由调用方通过 Form.useForm() 创建）
 * @param {string} pageType   页面类型（如：move-form/move-detail/form/detail等）
 */
export default function DynamicForm({ app, form, pageType }) {
  const layout = parseLayoutJson(app?.form_layout_json)
  const elements = layout?.elements || []

  if (!elements.length) {
    return <Empty description="该应用暂未配置表单布局" />
  }

  const { formConfig } = layout
  const isHorizontal = formConfig.layout === 'horizontal'

  return (
    <Form form={form} layout={formConfig.layout} labelAlign={formConfig.labelAlign}>
      <Row gutter={[12, 12]}>
        {elements.map((el, index) => {
          const noLabel = isNoLabelElement(el.element_type)
          return (
            <Col span={el.width || 24} key={el.id || `el_${el.element_type}_${index}`}>
              <FormItem
                label={isNoLabelElement(el.element_type) ? '' : el.label}
                labelCol={
                  isHorizontal
                    ? isNoLabelElement(el.element_type)
                      ? { span: 24 - el.width }
                      : { style: { flexBasis: formConfig.labelWidth } }
                    : undefined
                }
                wrapperCol={
                  isHorizontal
                    ? isNoLabelElement(el.element_type)
                      ? { span: el.width }
                      : {
                          style: { flexBasis: `calc(100% - ${formConfig.labelWidth}px)` },
                        }
                    : undefined
                }
                required={Boolean(el.required)}
                className="mb-0!"
              >
                {renderField(el)}
              </FormItem>
            </Col>
          )
        })}
      </Row>
    </Form>
  )
}
