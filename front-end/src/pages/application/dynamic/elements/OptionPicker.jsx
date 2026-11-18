import { Input, Modal } from '@arco-design/web-react'
import { IconCheck } from '@arco-design/web-react/icon'
import { useEffect, useMemo, useState } from 'react'
import { findOptionByValue, getStaticOptions } from '../utils/formUtils'
import { loadDataSourceOptions } from '../utils/optionLoader'
import { applyScroll, markScroll } from '../utils/scrollGuard'

/**
 * 动态表单「弹窗单选」元素共用实现。
 *
 * modelselect / projectselect / userselect 的交互完全一致，差异只在：
 * - 接口数据映射成选项时取哪个字段作为 value/title；
 * - 弹窗标题、搜索框占位文案；
 * - 只读态如何从选项反查展示名。
 *
 * 具体差异集中在本文件的 OPTION_VARIANTS，元素文件只保留自己的导出包装。
 */

const firstDefined = (obj, keys) => {
  for (const key of keys) {
    const value = obj?.[key]
    if (value !== undefined && value !== null) return value
  }
  return undefined
}

/** 将任意来源数据转为扁平选项 {value, title} */
const toListOptions = (list, shape) =>
  Array.isArray(list)
    ? list
        .map((item) => {
          if (item == null) return null
          const value = firstDefined(item, shape.valueKeys)
          const title = firstDefined(item, shape.titleKeys) ?? String(value ?? '')
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

const MODEL_SHAPE = {
  valueKeys: ['value', 'id', 'uid'],
  titleKeys: ['title', 'label', 'name', 'username', 'project_name'],
}

const PROJECT_SHAPE = {
  valueKeys: ['value', 'id', 'uid'],
  titleKeys: ['project_name', 'title', 'name'],
}

const USER_SHAPE = {
  valueKeys: ['value', 'id', 'uid', 'user_id'],
  titleKeys: ['title', 'label', 'nickname', 'name', 'username'],
}

const OPTION_VARIANTS = {
  model: {
    shape: MODEL_SHAPE,
    dialogTitle: (label) => (label ? `请选择${label}` : '弹窗选择'),
    searchPlaceholder: (label) => (label ? `搜索${label}` : '搜索'),
    readonlyLabel: (option, value) => option?.title || String(value),
  },
  project: {
    shape: PROJECT_SHAPE,
    dialogTitle: (label) => (label ? `${label}选择` : '项目选择'),
    searchPlaceholder: (label) => (label ? `搜索${label}` : '搜索项目'),
    readonlyLabel: (option, value) => option?.project_name || String(value),
  },
  user: {
    shape: USER_SHAPE,
    dialogTitle: (label) => (label ? `${label}选择` : '人员选择'),
    searchPlaceholder: (label) => (label ? `搜索${label}` : '搜索人员'),
    readonlyLabel: (option, value) => option?.title || String(value),
  },
}

/**
 * 选项加载 Hook：
 * 1. 运行时 rt 已加载选项（form 模式，DynamicForm loadOptions 提供）→ 优先使用；
 * 2. rt.managesOptions 为真时（form 运行时）由 DynamicForm 统一加载，此处不再自请求；
 * 3. 否则 data_source.type='api' 且配置了 url → 自加载（detail 等 rt 不可用场景）；
 * 4. 最后回退静态 json 选项。
 */
export function useOptionOptions(el, rt, pageType, mapOptions) {
  const rtOptions = rt?.getOptions?.(el)
  const hasRt = Array.isArray(rtOptions) && rtOptions.length > 0
  const [selfOptions, setSelfOptions] = useState([])
  const ds = el?.data_source

  // 画布预览（move-form / move-detail）一律走静态默认数据，不请求接口
  const isPreview = pageType === 'move-form' || pageType === 'move-detail'

  useEffect(() => {
    if (isPreview || hasRt || rt?.managesOptions || ds?.type !== 'api' || !ds?.url) return
    let alive = true
    // 走共享加载器：同一时刻相同请求会合并为一次网络往返，失败返回 null 并保留空选项。
    loadDataSourceOptions(ds).then((data) => {
      if (alive && data != null) setSelfOptions(mapOptions(data))
    })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [el?.id, ds?.type, ds?.url, hasRt, isPreview])

  return hasRt ? rtOptions : selfOptions.length ? selfOptions : getStaticOptions(el)
}

/** 只读展示：从选项反查展示名，空值显示 '-' */
function ReadonlyText({ options, value, variant }) {
  if (value == null || value === '') {
    return <span className="break-all whitespace-pre-wrap">-</span>
  }
  const label = OPTION_VARIANTS[variant].readonlyLabel(findOptionByValue(options, value), value)
  return <span className="break-all whitespace-pre-wrap">{label}</span>
}

/**
 * 只读入口：详情页 / 画布详情预览共用。
 * 需要自行加载选项，因此保留独立组件，不能复用 OptionSelect 的交互分支。
 */
export function OptionReadOnly({ variant, value, el, rt, pageType }) {
  const options = useOptionOptions(el, rt, pageType, (data) =>
    toListOptions(data, OPTION_VARIANTS[variant].shape),
  )
  return <ReadonlyText options={options} value={value} variant={variant} />
}

/**
 * Input.Search 形式：只读输入框 + 「选择」按钮唤起弹窗，弹窗内列表单选。
 * value：选中记录 id；onChange：选中记录 id（未选传 ''）。
 */
function OptionPicker({
  value,
  onChange,
  options,
  placeholder,
  title,
  searchPlaceholder,
  disabled,
}) {
  const [visible, setVisible] = useState(false)
  const [selectedValue, setSelectedValue] = useState('')
  const [searchValue, setSearchValue] = useState('')

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
          title={title}
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
              placeholder={searchPlaceholder}
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

/**
 * 弹窗单选元素主组件（受控）：value/onChange 由 Arco FormItem 注入。
 * 作为 renderPreview 渲染时接收 el/pageType/rt；作为 FormItem 子元素时额外接收 value/onChange/disabled。
 */
export function OptionSelect({ variant, el, pageType, rt, value, onChange, disabled }) {
  const config = OPTION_VARIANTS[variant]
  const options = useOptionOptions(el, rt, pageType, (data) => toListOptions(data, config.shape))

  // 画布表单占位（move-form）：只读输入框 + 禁用的「选择」按钮
  if (pageType === 'move-form') {
    return <Input.Search placeholder={el.placeholder || undefined} searchButton="选择" disabled />
  }

  // move-detail（画布详情预览）：纯文本回显
  if (pageType === 'move-detail') {
    return <ReadonlyText options={options} value={value} variant={variant} />
  }

  // form / detail 可编辑：弹窗单选
  return (
    <OptionPicker
      value={value}
      onChange={onChange}
      options={options}
      placeholder={el?.placeholder}
      title={config.dialogTitle(el?.label)}
      searchPlaceholder={config.searchPlaceholder(el?.label)}
      disabled={disabled}
    />
  )
}
