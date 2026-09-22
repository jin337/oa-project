import { Empty, Form, Grid } from '@arco-design/web-react'
import { useMemo } from 'react'
import {
    DEFAULT_FORM_CONFIG,
    renderFormItemElement,
} from '../DynamicForm'

const Row = Grid.Row
const Col = Grid.Col

/**
 * MoveDetailMode：设计器详情页画布只读预览模式（pageType === 'move-detail'）
 *
 * 复用画布容器结构但禁用所有编辑交互：无拖拽、无选中高亮、无删除、无蒙层。
 * 表格组件按只读（editable=false）渲染，所有控件保持禁用态预览。
 */
export default function MoveDetailMode({
  form,
  elements,
  formConfig = DEFAULT_FORM_CONFIG,
}) {
  const formCtx = useMemo(
    () => ({
      isHorizontal: formConfig.layout === 'horizontal',
      formConfig,
      pageType: 'move-detail',
      isMoveMode: true,
      fieldPerms: null,
      editable: false,
      detailDynamicStates: null,
    }),
    [formConfig],
  )

  return (
    <div className="m-4 flex-1 overflow-auto border-2 border-dashed border-gray-200 p-4">
      {elements.length === 0 ? (
        <div className="flex h-full items-center justify-center">
          <Empty description="该应用暂未配置表单布局" />
        </div>
      ) : (
        <Form
          size="small"
          form={form}
          className="mx-auto max-w-187.5"
          layout={formConfig.layout}
          labelAlign={formConfig.labelAlign}
          disabled
          autoComplete="off"
        >
          <Row>
            {elements.map((el, index) => (
              <Col span={el.width || 24} key={el.id || `el_${el.element_type}_${index}`}>
                {renderFormItemElement(el, { ...formCtx, runtime: null })}
              </Col>
            ))}
          </Row>
        </Form>
      )}
    </div>
  )
}
