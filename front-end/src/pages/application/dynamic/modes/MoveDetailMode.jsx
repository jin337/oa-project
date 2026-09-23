import { Empty, Form, Grid } from '@arco-design/web-react'
import { useMemo } from 'react'
import {
  CanvasElement,
  DEFAULT_FORM_CONFIG
} from '../DynamicForm'

const Row = Grid.Row

/**
 * MoveDetailMode：设计器详情页画布交互模式（pageType === 'move-detail'）
 *
 * 负责设计器详情页的画布交互逻辑，包括元素的拖拽、选中高亮、删除、
 * 透明蒙层及空白区交互。表格组件按只读（editable=false）渲染。
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

  return (
    <div
      className="m-4 flex-1 overflow-auto border-2 border-dashed border-gray-200 p-4"
      onDragOver={onCanvasDragOver}
      onDrop={onCanvasDrop}
      onClick={onCanvasClick}
    >
      {elements.length === 0 ? (
        <div className="flex h-full items-center justify-center">
          <Empty description="该应用暂未配置表单布局" />
        </div>
      ) : (
        <Form
          size="small"
          form={form}
          className="mx-auto max-w-187.5 detail-form-descriptions"
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
