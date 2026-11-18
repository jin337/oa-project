import { OptionReadOnly, OptionSelect } from './OptionPicker'

/**
 * 弹窗选择元素（modelselect）
 *
 * 呈现方式与项目选择 / 人员选择一致：Input.Search 只读 + 「选择」按钮唤起弹窗，
 * 弹窗内为数据列表单选（支持关键字搜索），已选记录回填展示名。
 *
 * 与 projectselect 的唯一区别：本类型不声明 meta.dataSourceDefaults，
 * 数据源完全由使用方在「表单元素管理 - 数据源配置」中自行配置，不做任何默认值注入。
 */

/** 详情只读：显示已选记录名，空值显示 '-' */
export function ModelReadOnly(props) {
  return <OptionReadOnly variant="model" {...props} />
}

/** 弹窗选择主组件（受控）：value/onChange 由 Arco FormItem 注入 */
export function ModelSelect(props) {
  return <OptionSelect variant="model" {...props} />
}

/** ELEMENT_RENDER_CONFIG.modelselect.renderPreview 入口 */
export function renderModelPreview(el, pageType, rt) {
  return <OptionSelect variant="model" el={el} pageType={pageType} rt={rt} />
}
