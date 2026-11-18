import { OptionReadOnly, OptionSelect } from './OptionPicker'

/**
 * 项目选择元素（projectselect）
 *
 * 呈现方式参考人员选择（userselect）：Input.Search 只读 + 「选择」按钮唤起弹窗，
 * 弹窗内为项目列表单选（支持关键字搜索），已选项目回填名称。
 *
 * 数据源支持（与 select/deptselect/userselect 一致）：
 *   - data_source.type='api'  动态接口（如接口管理中项目列表 GET /application/by-code/app_xxx?state=list）
 *   - data_source.type='json' 静态选项 [{label, value}]
 */

/** 详情只读：显示已选项目名，空值显示 '-' */
export function ProjectReadOnly(props) {
  return <OptionReadOnly variant="project" {...props} />
}

/** 项目选择主组件（受控）：value/onChange 由 Arco FormItem 注入 */
export function ProjectSelect(props) {
  return <OptionSelect variant="project" {...props} />
}

/** ELEMENT_RENDER_CONFIG.projectselect.renderPreview 入口 */
export function renderProjectPreview(el, pageType, rt) {
  return <OptionSelect variant="project" el={el} pageType={pageType} rt={rt} />
}
