import { Empty, Grid, Icon, Input, Popover, Tooltip } from '@arco-design/web-react'
import {
  IconApps,
  IconCommand,
  IconCommon,
  IconDesktop,
  IconHeart,
  IconHome,
  IconMessage,
  IconSettings,
  IconSkin,
  IconStorage,
  IconUser,
  IconVoice,
} from '@arco-design/web-react/icon'
import { useMemo, useState } from 'react'

// iconfont.cn symbol 模式图标库：通过 Arco Icon.addFromIconFontCn 加载（官方方式，动态注入 <symbol>）
const IconFont = Icon.addFromIconFontCn({
  src: '//at.alicdn.com/t/c/font_5235873_un7j3rlsqe.js',
})

// 后端菜单 icon 字段 -> Arco 内置图标映射（兼容旧配置，如 setting/user/storage）
export const ICON_MAP = {
  setting: <IconSettings />,
  user: <IconUser />,
  storage: <IconStorage />,
  apps: <IconApps />,
  home: <IconHome />,
  desktop: <IconDesktop />,
  heart: <IconHeart />,
  message: <IconMessage />,
  voice: <IconVoice />,
  common: <IconCommon />,
  command: <IconCommand />,
  skin: <IconSkin />,
}

// 渲染 iconfont.cn 图标（Arco IconFont 组件，type 为 symbol id，如 icon-search）
export function IconFontSymbol({ name, className = '', style }) {
  if (!name) return null
  return <IconFont type={name} className={className} style={style} />
}

// 菜单图标统一渲染：内置 Arco 优先，其次 iconfont symbol（仅当已注入），无效/未配置兜底默认图标
export function MenuIcon({ name }) {
  if (!name) return <IconApps />
  if (ICON_MAP[name]) {
    return ICON_MAP[name]
  }
  if (listIconfontIcons().includes(name)) {
    return <IconFont type={name} />
  }
  return <IconApps />
}

// 枚举当前页面已注入的全部 iconfont symbol id（addFromIconFontCn 动态注入，选择弹窗打开时实时读取）
export function listIconfontIcons() {
  return Array.from(document.querySelectorAll('svg symbol[id]'))
    .map((s) => s.id)
    .filter(Boolean)
}

const Row = Grid.Row
const Col = Grid.Col
const BUILTIN_KEYS = Object.keys(ICON_MAP)

/**
 * 菜单图标选择器（受控组件，配合 Arco Form 使用：value/onChange）
 * - 只读输入框展示当前选中图标（前缀图标 + 名称），点击弹出选择面板
 * - 内置 Arco 图标与 iconfont 图标合并平铺展示，点击选中
 * - 输入框不可编辑，选中项仅通过面板选择/清除变更
 */
export default function IconSelect({ value, onChange, disabled }) {
  const [visible, setVisible] = useState(false)
  // Popover 重建 key：pick 后重建以重置 Arco Trigger 内部 popupOpen，
  // 规避受控 visible 与内部状态不同步导致的"下次点击无法打开"问题
  const [popKey, setPopKey] = useState(0)
  const [fontIcons, setFontIcons] = useState([])

  // 点击输入框：显式打开，并实时读取已注入的 iconfont symbol 列表
  // （addFromIconFontCn 为异步加载，首次打开若尚未注入则短暂重试一次）
  const openPopup = () => {
    if (disabled) return
    setVisible(true)
    const icons = listIconfontIcons()
    if (icons.length) {
      setFontIcons(icons)
    } else {
      setFontIcons([])
      setTimeout(() => setFontIcons(listIconfontIcons()), 800)
    }
  }

  // 内置图标与 iconfont 图标合并平铺（不分组）
  const allIcons = useMemo(() => [...BUILTIN_KEYS, ...fontIcons], [fontIcons])

  const renderIcon = (name) => (ICON_MAP[name] || null) ?? <IconFontSymbol name={name} />

  const pick = (name) => {
    onChange?.(name)
    setVisible(false)
    setPopKey((k) => k + 1)
  }

  const iconCell = (name, active) => (
    <Col span={4} key={name}>
      <Tooltip content={name}>
        <div
          className={`flex size-8 cursor-pointer items-center justify-center rounded text-lg transition-colors hover:bg-blue-50 ${
            active ? 'bg-blue-100 text-blue-600!' : ''
          }`}
          onClick={() => pick(name)}
        >
          {renderIcon(name)}
        </div>
      </Tooltip>
    </Col>
  )

  return (
    <Popover
      key={popKey}
      position="bl"
      trigger="click"
      visible={visible}
      onVisibleChange={(v) => setVisible(v)}
      disabled={disabled}
      className="[&_.arco-popover-content]:px-2.5!"
      content={
        <div className="max-h-80 overflow-auto">
          {allIcons.length === 0 && (
            <Empty description="图标加载中..." style={{ padding: '24px 0' }} />
          )}
          <Row>{allIcons.map((name) => iconCell(name, value === name))}</Row>
        </div>
      }
    >
      <Input
        allowClear
        onClear={() => pick('')}
        disabled={disabled}
        value={value || ''}
        placeholder="点击选择图标"
        onClick={openPopup}
        prefix={
          value ? <span className="mr-1 inline-flex text-base">{renderIcon(value)}</span> : null
        }
      />
    </Popover>
  )
}
