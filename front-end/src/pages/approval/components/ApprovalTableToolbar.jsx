import { Button, Checkbox, Dropdown, Input, Popover, Space } from '@arco-design/web-react'
import { IconList, IconRefresh, IconSettings } from '@arco-design/web-react/icon'

/**
 * 审批列表页通用工具栏：搜索区 + 刷新 / 密度 / 列设置。
 * UI 与交互对齐 system 模块（用户管理）的表格工具栏模式。
 *
 * @param {object} props
 * @param {string} props.keyword       搜索关键词草稿值
 * @param {function} props.setKeyword  更新关键词草稿
 * @param {function} props.onSearch    点击搜索 / 回车（生效关键词并回第一页）
 * @param {function} props.onReset     重置搜索
 * @param {function} props.onRefresh   刷新列表
 * @param {ReactNode} props.sizeMenu   密度下拉菜单（由 useApprovalList 提供）
 * @param {string[]} props.visibleCols 当前可见列 key 列表
 * @param {function} props.setVisibleCols 更新可见列
 * @param {object[]} props.columns     页面完整列定义（用于渲染列设置标题）
 * @param {string[]} props.colKeys     可配置列 key 列表（操作列固定显示，不参与设置）
 */
export default function ApprovalTableToolbar({
  keyword,
  setKeyword,
  onSearch,
  onReset,
  onRefresh,
  sizeMenu,
  visibleCols,
  setVisibleCols,
  columns,
  colKeys,
  placeholder = '按单号 / 模块 / 申请人搜索',
}) {
  // 列设置弹层内容
  const colSettingsPopover = (
    <Checkbox.Group value={visibleCols} onChange={setVisibleCols} direction="vertical">
      {colKeys.map((k) => {
        const col = columns.find((c) => c.key === k)
        return (
          <Checkbox key={k} value={k}>
            {col?.title || k}
          </Checkbox>
        )
      })}
    </Checkbox.Group>
  )

  return (
    <>
      {/* 搜索区域 */}
      <div className="mb-3">
        <Space wrap>
          <Input
            className="w-55!"
            placeholder={placeholder}
            allowClear
            value={keyword}
            onChange={setKeyword}
            onPressEnter={onSearch}
          />
          <Button type="primary" onClick={onSearch}>
            搜索
          </Button>
          <Button onClick={onReset}>重置</Button>
        </Space>
      </div>

      {/* 表格工具栏 */}
      <div className="mb-3 flex items-center justify-end">
        <Space>
          <Button size="small" icon={<IconRefresh />} onClick={onRefresh}>
            刷新
          </Button>
          <Dropdown droplist={sizeMenu} trigger='click' position="br">
            <Button size="small" icon={<IconList />}>
              密度
            </Button>
          </Dropdown>
          <Popover content={colSettingsPopover} position="br" trigger="click">
            <Button size="small" icon={<IconSettings />}>
              列设置
            </Button>
          </Popover>
        </Space>
      </div>
    </>
  )
}
