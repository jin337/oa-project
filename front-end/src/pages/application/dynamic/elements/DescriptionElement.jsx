import { Input, Radio, Tag } from '@arco-design/web-react'

/**
 * 说明文字元素（组件库/基础）：渲染与设置实现独立维护，
 * 注册结构（meta + 引用）保留在 elementConfig.jsx 的 BASE_ELEMENT_CONFIGS 中。
 */

// ==================== 渲染入口 ====================

/** 画布/运行时渲染：内容支持红色强调（标题由 FormItem 的 label 承载） */
export const renderDescriptionPreview = (el) => {
  const content = el.content
  if (!content) {
    return <div className="py-1 text-sm text-gray-400">说明文字（未配置内容）</div>
  }
  return (
    <div
      className="text-sm whitespace-pre-wrap text-gray-600"
      style={el.contentRed ? { color: '#f53f3f' } : undefined}
    >
      {content}
    </div>
  )
}

// ==================== 设置面板 ====================

/** 设计器设置面板：元素类型 + 标题 + 内容 + 内容颜色（纯受控 UI） */
export const renderDescriptionSettings = ({ selectedElement, updateSelectedElement }) => (
  <>
    <div>
      <div className="mb-2 text-sm text-gray-600">元素类型</div>
      <Tag color="arcoblue" size="medium">
        说明文字
      </Tag>
    </div>
    <div>
      <div className="mb-2 text-sm text-gray-600">标题</div>
      <Input
        value={selectedElement.label || ''}
        onChange={(v) => updateSelectedElement({ label: v })}
        placeholder="可选，留空则不显示标题"
      />
    </div>
    <div>
      <div className="mb-2 text-sm text-gray-600">内容</div>
      <Input.TextArea
        value={selectedElement.content || ''}
        onChange={(v) => updateSelectedElement({ content: v })}
        placeholder="请输入说明内容"
        autoSize={{ minRows: 2, maxRows: 5 }}
      />
    </div>
    <div>
      <div className="mb-2 text-sm text-gray-600">内容颜色</div>
      <Radio.Group
        type="button"
        value={selectedElement.contentRed ? 'red' : 'normal'}
        onChange={(v) => updateSelectedElement({ contentRed: v === 'red' })}
        options={[
          { label: '默认', value: 'normal' },
          { label: '红色', value: 'red' },
        ]}
      />
    </div>
  </>
)
