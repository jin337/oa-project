import { Button, Space } from '@arco-design/web-react'
import { IconMinus, IconPlus } from '@arco-design/web-react/icon'

/**
 * JS / SQL 编辑器共用的顶部工具栏。
 *
 * 左侧固定为「美化 / 简化 / 字号缩放」，右侧 action 由调用方传入
 * （主编辑器为「全屏」，全屏弹窗内为「退出全屏」）。
 */
export function EditorToolbar({
  onBeautify,
  onCompact,
  fontSize,
  min,
  max,
  onChangeFontSize,
  action,
}) {
  return (
    <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-2 py-1">
      <Space size={0}>
        <Button type="text" size="mini" onClick={onBeautify}>
          美化
        </Button>
        <Button type="text" size="mini" onClick={onCompact}>
          简化
        </Button>
        <span className="mx-1 inline-block h-3 w-px bg-gray-300" />
        <Button
          type="text"
          size="mini"
          icon={<IconMinus />}
          disabled={fontSize <= min}
          onClick={() => onChangeFontSize(-1)}
        />
        <span className="min-w-7 text-center text-xs text-gray-500">{fontSize}</span>
        <Button
          type="text"
          size="mini"
          icon={<IconPlus />}
          disabled={fontSize >= max}
          onClick={() => onChangeFontSize(1)}
        />
      </Space>
      {action}
    </div>
  )
}
