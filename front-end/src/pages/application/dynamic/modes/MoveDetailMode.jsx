import { Empty, Form, Grid } from '@arco-design/web-react'
import { useEffect, useMemo } from 'react'
import {
  CanvasElement,
  DEFAULT_FORM_CONFIG
} from '../DynamicForm'
import { buildMockFormData } from '../elements/ReadonlyValue'

const Row = Grid.Row

/**
 * MoveDetailMode：设计器详情页画布交互模式（pageType === 'move-detail'）
 *
 * 负责设计器详情页的画布交互逻辑，包括元素的拖拽、选中高亮、删除、
 * 透明蒙层及空白区交互。数据回显与真实详情页（detail）共用 ReadonlyValue 管线：
 * 挂载/元素变化时注入类型匹配的模拟数据（buildMockFormData），卸载时清空，
 * 避免 mock 数据残留影响其他画布模式（move-form）或共享 Form store。
 */
export default function MoveDetailMode({
  form,
  elements,
  formConfig = DEFAULT_FORM_CONFIG,
  selectedId = null,
  dragOverIndex = null,
  onSelectElement,
  onRemoveElement,
  onElementDragStart,
  onElementDragOver,
  onElementDrop,
  onDragEnd,
  onCanvasDragOver,
  onCanvasDrop,
  onCanvasClick,
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

  // 画布预览可能未由调用方传入 Form 实例（LayoutManage 不传）：未传时自建本地实例，
  // mock 数据仅注入本地 store，不影响外部共享 store
  const [formInstance] = Form.useForm()
  const formRef = form || formInstance

  // 注入模拟数据（move-detail 只读回显）；卸载时清空，防止残留到共享 Form store
  useEffect(() => {
    formRef.setFieldsValue(buildMockFormData(elements))
    return () => formRef.resetFields()
  }, [formRef, elements])

  return (
    <div
      className="m-4 flex-1 overflow-auto border-2 border-dashed border-gray-200 p-4"
      onDragOver={onCanvasDragOver}
      onDrop={onCanvasDrop}
      onClick={onCanvasClick}
    >
      {elements.length === 0 ? (
        <div className="flex h-full items-center justify-center">
          <Empty description="该流程暂未配置表单布局" />
        </div>
      ) : (
        <Form
          form={formRef}
          className="mx-auto max-w-[90%] detail-form-descriptions"
          layout={formConfig.layout}
          labelAlign={formConfig.labelAlign}
          disabled
          autoComplete="off"
        >
          <Row>
            {elements.map((el, index) => (
              <CanvasElement
                key={el.id || `el_${el.element_type}_${index}`}
                el={el}
                index={index}
                isSelected={el.id === selectedId}
                isDragOver={dragOverIndex === index}
                ctx={formCtx}
                onSelectElement={onSelectElement}
                onRemoveElement={onRemoveElement}
                onElementDragStart={onElementDragStart}
                onElementDragOver={onElementDragOver}
                onElementDrop={onElementDrop}
                onDragEnd={onDragEnd}
              />
            ))}
          </Row>
        </Form>
      )}
    </div>
  )
}
