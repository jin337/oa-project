import { Empty, Form, Grid } from '@arco-design/web-react'
import { useMemo } from 'react'
import {
  DEFAULT_FORM_CONFIG,
  RuntimeFieldWrap,
  RuntimeFormContext,
  renderFormItemElement,
  useRuntimeForm,
} from '../DynamicForm'

const Row = Grid.Row
const Col = Grid.Col

/**
 * FormMode：常规可填写动态表单（pageType === 'form'）
 *
 * 集成 useRuntimeForm 动态数据源与联动逻辑，提供 RuntimeFormContext，
 * 渲染常规可填写的动态表单。
 */
export default function FormMode({
  app,
  form,
  elements,
  formConfig = DEFAULT_FORM_CONFIG,
  onValuesChange,
  fieldPerms,
}) {
  // 运行时交互：动态数据源(api)选项加载 + 事件联动(actions)执行
  const { contextValue, handleValuesChange } = useRuntimeForm({ elements, form, pageType: 'form', app })

  const formCtx = useMemo(
    () => ({
      isHorizontal: formConfig.layout === 'horizontal',
      formConfig,
      pageType: 'form',
      isMoveMode: false,
      fieldPerms,
      editable: false,
      detailDynamicStates: null,
    }),
    [formConfig, fieldPerms],
  )

  if (!elements.length) {
    return (
      <RuntimeFormContext.Provider value={contextValue}>
        <Empty description="该流程暂未配置表单布局" />
      </RuntimeFormContext.Provider>
    )
  }

  return (
    <RuntimeFormContext.Provider value={contextValue}>
      <Form
        form={form}
        layout={formConfig.layout}
        labelAlign={formConfig.labelAlign}
        autoComplete="off"
        scrollToFirstError={{ behavior: 'smooth', block: 'center' }}
        onValuesChange={(changed, allValues) => {
          handleValuesChange(changed, allValues)
          onValuesChange?.(allValues)
        }}
      >
        <Row>
          {elements.map((el, index) => (
            <Col span={el.width || 24} key={el.id || `el_${el.element_type}_${index}`}>
              <RuntimeFieldWrap el={el}>
                {renderFormItemElement(el, { ...formCtx, runtime: contextValue })}
              </RuntimeFieldWrap>
            </Col>
          ))}
        </Row>
      </Form>
    </RuntimeFormContext.Provider>
  )
}
