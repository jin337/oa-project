import { OptionReadOnly, OptionSelect } from './OptionPicker'

/**
 * 人员选择元素（userselect）
 *
 * 呈现方式参考部门选择（deptselect）：Input.Search 只读 + 「选择」按钮唤起弹窗，
 * 弹窗内为人员列表单选（支持关键字搜索），已选人员回填名称。
 *
 * 数据源支持（与 select/deptselect 一致）：
 *   - data_source.type='api'  动态接口（如接口管理中的人员列表 GET /user-list）
 *   - data_source.type='json' 静态选项 [{label, value}]
 */

/** 详情只读：显示已选人员名，空值显示 '-' */
export function UserReadOnly(props) {
  return <OptionReadOnly variant="user" {...props} />
}

/** 人员选择主组件（受控）：value/onChange 由 Arco FormItem 注入 */
export function UserSelect(props) {
  return <OptionSelect variant="user" {...props} />
}

/** ELEMENT_RENDER_CONFIG.userselect.renderPreview 入口 */
export function renderUserPreview(el, pageType, rt) {
  return <OptionSelect variant="user" el={el} pageType={pageType} rt={rt} />
}
