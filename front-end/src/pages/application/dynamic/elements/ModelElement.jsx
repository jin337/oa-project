import { Input, Modal } from '@arco-design/web-react'
import { IconCheck } from '@arco-design/web-react/icon'
import { useEffect, useMemo, useState } from 'react'
import { findOptionByValue, getStaticOptions } from '../utils/formUtils'
import { loadDataSourceOptions } from '../utils/optionLoader'
import { applyScroll, markScroll } from '../utils/scrollGuard'

/**
 * 弹窗选择元素（modelselect）
 *
 * 呈现方式与项目选择（projectselect）一致：Input.Search 只读 + 「选择」按钮唤起弹窗，
 * 弹窗内为数据列表单选（支持关键字搜索），已选记录回填展示名。
 *
 * 与 projectselect 的唯一区别：本类型不声明 meta.dataSourceDefaults，
 * 数据源完全由使用方在「表单元素管理 - 数据源配置」中自行配置，不做任何默认值注入。
 *
 * 数据源支持（与 select/deptselect/userselect/projectselect 一致）：
 *   - data_source.type='api'  动态接口（接口管理中的任意列表接口）。
 *     运行时（form 模式）优先取 rt.getOptions 已加载的选项（支持 ${form.xxx} 参数 / 标签表达式）；
 *     详情（detail 模式）rt 不可用时自加载接口并映射为 {value, title} 扁平列表。
 *   - data_source.type='json' 静态选项 [{label, value}]
 *
 * pageType 渲染策略：
 *   - form        可交互选择（实际表单填写，FormItem 注入 value/onChange/disabled）
 *   - move-form   画布预览（禁用占位，不解析真实数据源）
 *   - detail / move-detail 只读回显由 renderFormItemElement 统一拦截：经 ReadonlyValue →
 *     ModelReadOnly 反查展示名（move-detail 注入模拟值，反查不到回退原值）
 *
 * 导出清单：
 *   - ModelSelect        弹窗选择主组件（form / move-form 分派）
 *   - ModelReadOnly      只读展示（READONLY_RENDERERS 注册）
 *   - renderModelPreview ELEMENT_RENDER_CONFIG 注册入口
 */

// ==================== 工具 ====================

/** 将任意来源数据转为扁平选项 {value, title}（兼容 value/id/uid、title/label/name/username） */
const toListOptions = (list) =>
  Array.isArray(list)
    ? list
        .map((n) => {
          if (n == null) return null
          const value = n.value ?? n.id ?? n.uid
          const title =
            n.title ?? n.label ?? n.name ?? n.username ?? n.project_name ?? String(value ?? '')
          if (value === undefined || value === null || value === '') return null
          return { value, title: String(title ?? '') }
        })
        .filter(Boolean)
    : []

/** 按关键字过滤扁平选项 */
const filterOptions = (options, keyword) => {
  if (!keyword) return options
  const k = String(keyword).toLowerCase()
  return options.filter((o) =>
    String(o.title || '')
      .toLowerCase()
      .includes(k),
  )
}

/**
 * 弹窗选择选项 Hook：
 * 1. 运行时 rt 已加载选项（form 模式，DynamicForm loadOptions 提供）→ 优先使用；
 * 2. rt.managesOptions 为真时（form 运行时）由 DynamicForm 统一加载，此处不再自请求，
 *    避免同一字段被两条路径各加载一次；
 * 3. 否则 data_source.type='api' 且配置了 url → 自加载（detail 等 rt 不可用场景）；
 * 4. 最后回退静态 json 选项。
 */
const useModelOptions = (el, rt) => {
  const rtOptions = rt?.getOptions?.(el)
  const hasRt = Array.isArray(rtOptions) && rtOptions.length > 0
  const [selfOptions, setSelfOptions] = useState([])
  const ds = el?.data_source

  useEffect(() => {
    if (hasRt || rt?.managesOptions || ds?.type !== 'api' || !ds?.url) return
    let alive = true
    // 走共享加载器：同一时刻相同请求（method+url+params）会合并为一次网络往返，
    // 避免子表多行 / 多个字段引用同一接口时重复请求。失败返回 null，保留空选项。
    loadDataSourceOptions(ds).then((data) => {
      if (alive && data != null) setSelfOptions(toListOptions(data))
    })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [el?.id, ds?.type, ds?.url, hasRt])

  const options = hasRt ? rtOptions : selfOptions.length ? selfOptions : getStaticOptions(el)
  return options
}

// ==================== 选择控件 ====================

/**
 * Input.Search 形式：输入框只读（展示已选记录名，不可手动输入），点「选择」按钮唤起弹窗，
 * 弹窗内数据列表单选（点击选中高亮，可关键字搜索），确定后回填选中记录 value。
 * value：选中记录的 id（单选标量）；onChange：选中记录 id（未选传 ''）。
 */
function ModelPicker({ value, onChange, options, placeholder, label, disabled }) {
  const [visible, setVisible] = useState(false)
  const [selectedValue, setSelectedValue] = useState('')
  const [searchValue, setSearchValue] = useState('')

  // 已选记录名：从选项列表反查
  const selectedLabel = useMemo(() => {
    if (value == null || value === '') return ''
    return findOptionByValue(options, value)?.title || String(value)
  }, [options, value])

  const filtered = useMemo(() => filterOptions(options, searchValue.trim()), [options, searchValue])

  const open = () => {
    markScroll() // Modal 开合会改写 body overflow 并可能重置滚动位置，先记下来
    setSearchValue('')
    setSelectedValue(value == null || value === '' ? '' : value)
    setVisible(true)
  }

  return (
    <>
      <Input.Search
        value={selectedLabel}
        readOnly
        placeholder={placeholder || undefined}
        searchButton="选择"
        onSearch={open}
        disabled={disabled}
      />
      {visible && (
        <Modal
          title={label ? `请选择${label}` : '弹窗选择'}
          visible
          onCancel={() => {
            setVisible(false)
            applyScroll()
          }}
          onOk={() => {
            onChange(selectedValue)
            setVisible(false)
            applyScroll()
          }}
          style={{ width: 480 }}
          autoFocus={false}
        >
          <div className="mb-2">
            <Input.Search
              allowClear
              value={searchValue}
              onChange={setSearchValue}
              placeholder={label ? `搜索${label}` : '搜索'}
            />
          </div>
          <div className="h-80 overflow-auto rounded border border-gray-200">
            {filtered.length ? (
              filtered.map((o) => {
                const active = String(o.value) === String(selectedValue)
                return (
                  <div
                    key={o.value}
                    className={`flex cursor-pointer items-center justify-between px-3 py-2 text-sm hover:bg-(--color-fill-2) ${
                      active ? 'bg-(--color-primary-light-1)' : ''
                    }`}
                    onClick={() => setSelectedValue(o.value)}
                  >
                    <span>{o.title}</span>
                    {active && <IconCheck className="text-[rgb(var(--primary-6))]" />}
                  </div>
                )
              })
            ) : (
              <div className="py-8 text-center text-xs text-gray-400">
                {searchValue ? '无匹配内容' : '暂无数据'}
              </div>
            )}
          </div>
        </Modal>
      )}
    </>
  )
}

// ==================== 只读展示 ====================

/** 详情只读：显示已选记录名（数据源自加载反查），空值显示 '-' */
export function ModelReadOnly({ value, el, rt }) {
  const options = useModelOptions(el, rt)
  if (value == null || value === '') {
    return <span className="break-all whitespace-pre-wrap">-</span>
  }
  const label = findOptionByValue(options, value)?.title || String(value)
  return <span className="break-all whitespace-pre-wrap">{label}</span>
}

// ==================== 主组件与渲染入口 ====================

/**
 * 弹窗选择主组件（受控）：value/onChange 由 Arco FormItem 注入。
 * 作为 renderPreview 渲染时接收 el/pageType/rt；作为 FormItem 子元素时额外接收 value/onChange/disabled。
 */
export function ModelSelect({ el, pageType, rt, value, onChange, disabled }) {
  const options = useModelOptions(el, rt)

  // 画布表单占位（move-form）：只读输入框 + 禁用的「选择」按钮
  if (pageType === 'move-form') {
    return <Input.Search placeholder={el.placeholder || undefined} searchButton="选择" disabled />
  }

  // detail 只读：展示已选记录名
  if (pageType === 'detail') {
    return <ModelReadOnly value={value} el={el} rt={rt} />
  }

  // form / 可编辑：弹窗单选
  return (
    <ModelPicker
      value={value}
      onChange={onChange}
      options={options}
      placeholder={el?.placeholder}
      label={el?.label}
      disabled={disabled}
    />
  )
}

/** ELEMENT_RENDER_CONFIG.modelselect.renderPreview 入口 */
export function renderModelPreview(el, pageType, rt) {
  return <ModelSelect el={el} pageType={pageType} rt={rt} />
}
