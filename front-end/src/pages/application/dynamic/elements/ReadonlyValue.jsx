import {
  TIME_ELEMENT_TYPES,
  formatTimeValue,
  getStaticOptions,
} from '../utils/formUtils'
import { DeptReadOnly } from './DeptElement'
import { renderUploadReadOnly } from './UploadElement'
import { UserReadOnly } from './UserElement'

/**
 * 详情只读（detail）数据回显：统一「值 → 展示」入口。
 * 真实详情页（DynamicForm）与画布详情预览（move-detail，喂类型匹配示例值）共用同一回显逻辑：
 * 选项型按 data_source 映射 label、日期格式化、upload/deptselect/userselect 走专属只读渲染、空值显示 '-'。
 * 独立成文件，避免与渲染配置中心（elementConfig）产生循环依赖。
 */

/** 将数据值映射为 data_source 配置的展示 label（select/radio/checkbox 等选项型字段）；
 * 未配置 data_source 或值无匹配项时原样返回 */
const labelOfValue = (value, dataSource) => {
  if (dataSource == null || value == null) return value
  const opts = getStaticOptions({ data_source: dataSource })
  if (!opts.length) return value
  const hit = opts.find((o) => String(o.value) === String(value))
  return hit && hit.label != null ? hit.label : value
}

/**
 * 详情只读模式（pageType='detail'）下的纯文本展示组件：
 * 作为 FormItem 单子元素接收 Arco 注入的 value，输出数据值对应的 data_source label
 * （数组值逐项映射后以 ", " 连接），空值显示 '-'。
 * elementType 为时间/日期类型时，value 经 formatTimeValue 格式化为标准可读的日期/时间字符串。
 */
export const ReadonlyValue = ({ value, elementType, dataSource, el }) => {
  // upload 类型：走 UploadElement 的只读渲染
  if (elementType === 'upload') {
    return renderUploadReadOnly(value, el)
  }
  // deptselect 类型：数据源自加载反查部门名
  if (elementType === 'deptselect') {
    return <DeptReadOnly value={value} el={el} />
  }
  // userselect 类型：数据源自加载反查人员名
  if (elementType === 'userselect') {
    return <UserReadOnly value={value} el={el} />
  }
  let text
  if (value == null || value === '') {
    text = '-'
  } else if (TIME_ELEMENT_TYPES.includes(elementType)) {
    text = formatTimeValue(value, elementType)
  } else if (Array.isArray(value)) {
    text = value.map((v) => labelOfValue(v, dataSource)).join(', ')
  } else {
    text = String(labelOfValue(value, dataSource))
  }
  return <span className="break-all whitespace-pre-wrap">{text}</span>
}
