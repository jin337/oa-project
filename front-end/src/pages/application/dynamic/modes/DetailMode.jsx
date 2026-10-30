import { Empty, Form, Grid } from '@arco-design/web-react'
import { useMemo } from 'react'
import {
  DEFAULT_FORM_CONFIG,
  RuntimeFieldWrap,
  renderFormItemElement,
} from '../DynamicForm'

const Row = Grid.Row
const Col = Grid.Col

/**
 * DetailMode：详情只读模式（pageType === 'detail'）
 *
 * 接收 detailDynamicStates 预计算结果，渲染详情只读及审批模式下的表单。
 * 所有控件默认禁用；审批待办场景下 perm=2 的字段可编辑，perm=1 的字段保留标签但值脱敏为 *****。
 */
export default function DetailMode({
  form,
  elements,
  formConfig = DEFAULT_FORM_CONFIG,
  onValuesChange,
  fieldPerms,
  editable = false,
  detailDynamicStates,
}) {
  const formCtx = useMemo(
    () => ({
      isHorizontal: formConfig.layout === 'horizontal',
      formConfig,
      pageType: 'detail',
      isMoveMode: false,
      fieldPerms,
      editable,
      detailDynamicStates,
    }),
    [formConfig, fieldPerms, editable, detailDynamicStates],
  )

  if (!elements.length) {
    return <Empty description="该流程暂未配置表单布局" />
  }

  return (
    <Form
      form={form}
      layout={formConfig.layout}
      labelAlign={formConfig.labelAlign}
      disabled={!(editable && (fieldPerms || []).some((p) => p && p.perm === 2))}
      autoComplete="off"
      onValuesChange={onValuesChange ? (changed, allValues) => onValuesChange(allValues) : undefined}
      className="detail-form-descriptions"
    >
      <Row>
        {elements.map((el, index) => (
          <Col span={el.width || 24} key={el.id || `el_${el.element_type}_${index}`}>
            <RuntimeFieldWrap el={el}>
              {renderFormItemElement(el, { ...formCtx, runtime: null })}
            </RuntimeFieldWrap>
          </Col>
        ))}
      </Row>
    </Form>
  )
}
