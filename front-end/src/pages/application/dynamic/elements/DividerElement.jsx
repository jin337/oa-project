import { Divider, Input, Radio, Tag } from '@arco-design/web-react'

/**
 * 分割线元素（组件库/基础）：渲染与设置实现独立维护，
 * 注册结构（meta + 引用）保留在 elementConfig.jsx 的 BASE_ELEMENT_CONFIGS 中。
 */

// ==================== 渲染入口 ====================

/** 画布/运行时渲染：有文字时带 orientation 的带字分割线，否则纯分割线 */
export const renderDividerPreview = (el) =>
  el.text ? <Divider orientation={el.orientation || 'center'}>{el.text}</Divider> : <Divider />

// ==================== 设置面板 ====================

/** 设计器设置面板：元素类型 + 分割线文字 + 文字位置（纯受控 UI） */
export const renderDividerSettings = ({ selectedElement, updateSelectedElement }) => (
  <>
    <div>
      <div className="mb-2 text-sm text-gray-600">元素类型</div>
      <Tag color="arcoblue" size="medium">
        分割线
      </Tag>
    </div>
    <div>
      <div className="mb-2 text-sm text-gray-600">分割线文字</div>
      <Input
        value={selectedElement.text || ''}
        onChange={(v) => updateSelectedElement({ text: v })}
        placeholder="可选，留空为纯分割线"
      />
    </div>
    <div>
      <div className="mb-2 text-sm text-gray-600">文字位置</div>
      <Radio.Group
        type="button"
        value={selectedElement.orientation || 'center'}
        onChange={(v) => updateSelectedElement({ orientation: v })}
        options={[
          { label: '左', value: 'left' },
          { label: '中', value: 'center' },
          { label: '右', value: 'right' },
        ]}
      />
    </div>
  </>
)
