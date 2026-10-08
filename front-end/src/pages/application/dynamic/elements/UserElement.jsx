import { Input, Modal } from '@arco-design/web-react'
import { IconCheck } from '@arco-design/web-react/icon'
import { useEffect, useMemo, useState } from 'react'
import request from 'src/api/request'
import { API_PREFIX } from 'src/utils/constants'
import { findOptionByValue, getStaticOptions } from '../utils/formUtils'

/**
 * 人员选择元素（userselect）
 *
 * 呈现方式参考部门选择（deptselect）：Input.Search 只读 + 「选择」按钮唤起弹窗，
 * 弹窗内为人员列表单选（支持关键字搜索），已选人员回填名称。
 *
 * 数据源支持（与 select/deptselect 一致）：
 *   - data_source.type='api'  动态接口（如接口管理中的人员列表 GET /user-list）。
 *     运行时（form 模式）优先取 rt.getOptions 已加载的选项（支持 ${form.xxx} 参数 / 标签表达式）；
 *     详情（detail 模式）rt 不可用时自加载接口并映射为 {value, title} 扁平列表。
 *   - data_source.type='json' 静态选项 [{label, value}]
 *
 * pageType 渲染策略：
 *   - form        可交互选择（实际表单填写，FormItem 注入 value/onChange/disabled）
 *   - move-form   画布预览（禁用占位，不解析真实数据源）
 *   - detail      只读：展示已选人员名（数据源自加载反查）
 *   - move-detail 画布只读预览（占位）
 */

// ==================== 工具 ====================

/** 将任意来源数据转为扁平选项 {value, title}（兼容 value/id/uid/user_id、title/nickname/name/username/label） */
const toListOptions = (list) =>
  Array.isArray(list)
    ? list
        .map((n) => {
          if (n == null) return null
          const value = n.value ?? n.id ?? n.uid ?? n.user_id
          const title = n.title ?? n.label ?? n.nickname ?? n.name ?? n.username ?? String(value ?? '')
          if (value === undefined || value === null || value === '') return null
          return { value, title: String(title ?? '') }
        })
        .filter(Boolean)
    : []

/** 按关键字过滤扁平选项 */
const filterOptions = (options, keyword) => {
  if (!keyword) return options
  const k = String(keyword).toLowerCase()
  return options.filter((o) => String(o.title || '').toLowerCase().includes(k))
}

/**
 * 人员选项 Hook：
 * 1. 运行时 rt 已加载选项（form 模式，DynamicForm loadOptions 提供）→ 优先使用；
 * 2. 否则 data_source.type='api' 且配置了 url → 自加载（detail 等 rt 不可用场景）；
 * 3. 最后回退静态 json 选项。
 */
const useUserOptions = (el, rt) => {
  const rtOptions = rt?.getOptions?.(el)
  const hasRt = Array.isArray(rtOptions) && rtOptions.length > 0
  const [selfOptions, setSelfOptions] = useState([])
  const ds = el?.data_source

  useEffect(() => {
    if (hasRt || ds?.type !== 'api' || !ds?.url) return
    let alive = true
    const load = async () => {
      try {
        // 引用接口管理（api_ref=1）→ 走统一分发端点 /interfaces{path}
        const isRef = ds?.api_ref === 1 || ds?.api_ref === '1'
        let rawUrl = ds.url
        if (isRef) rawUrl = '/interfaces' + rawUrl
        const url = rawUrl.startsWith(API_PREFIX) ? rawUrl.slice(API_PREFIX.length) : rawUrl
        const method = (ds?.method || 'GET').toUpperCase()
        const params = ds?.params && typeof ds?.params === 'object' ? ds.params : {}
        const res = await request({
          url,
          method,
          params: method === 'GET' ? params : undefined,
          data: method === 'GET' ? undefined : params,
        })
        if (alive) setSelfOptions(toListOptions(res?.data ?? res))
      } catch {
        // 加载失败保留空选项，不打断表单
      }
    }
    load()
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [el?.id, ds?.type, ds?.url, hasRt])

  const options = hasRt ? rtOptions : selfOptions.length ? selfOptions : getStaticOptions(el)
  return options
}

// ==================== 弹窗单选控件 ====================

/**
 * Input.Search 形式：输入框只读（展示已选人员名，不可手动输入），点「选择」按钮唤起弹窗，
 * 弹窗内人员列表单选（点击选中高亮，可关键字搜索），确定后回填选中人员 value。
 * value：人员 id（单选标量）；onChange：选中人员 id（未选传 ''）。
 */
function UserPicker({ value, onChange, options, placeholder, disabled }) {
  const [visible, setVisible] = useState(false)
  const [selectedValue, setSelectedValue] = useState('')
  const [searchValue, setSearchValue] = useState('')

  // 已选人员名：从选项列表反查
  const selectedLabel = useMemo(() => {
    if (value == null || value === '') return ''
    return findOptionByValue(options, value)?.title || String(value)
  }, [options, value])

  const filtered = useMemo(() => filterOptions(options, searchValue.trim()), [options, searchValue])

  const open = () => {
    setSearchValue('')
    setSelectedValue(value == null || value === '' ? '' : value)
    setVisible(true)
  }

  return (
    <>
      <Input.Search
        value={selectedLabel}
        readOnly
        placeholder={placeholder || '选择人员'}
        searchButton="选择"
        onSearch={open}
        disabled={disabled}
      />
      {visible && (
        <Modal
          title={placeholder || '选择人员'}
          visible
          onCancel={() => setVisible(false)}
          onOk={() => {
            onChange(selectedValue)
            setVisible(false)
          }}
          style={{ width: 480 }}
          autoFocus={false}
        >
          <div className="mb-2">
            <Input.Search
              allowClear
              value={searchValue}
              onChange={setSearchValue}
              placeholder="搜索人员"
            />
          </div>
          <div className="h-80 overflow-auto rounded border border-gray-200">
            {filtered.length ? (
              filtered.map((o) => {
                const active = String(o.value) === String(selectedValue)
                return (
                  <div
                    key={o.value}
                    className={`flex cursor-pointer items-center justify-between px-3 py-2 text-sm hover:bg-[var(--color-fill-2)] ${
                      active ? 'bg-[var(--color-primary-light-1)]' : ''
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
                {searchValue ? '无匹配人员' : '暂无人员数据'}
              </div>
            )}
          </div>
        </Modal>
      )}
    </>
  )
}

// ==================== 只读展示（detail 模式） ====================

/** 详情只读：显示已选人员名（数据源自加载反查），空值显示 '-' */
export function UserReadOnly({ value, el, rt }) {
  const options = useUserOptions(el, rt)
  if (value == null || value === '') {
    return <span className="break-all whitespace-pre-wrap">-</span>
  }
  const label = findOptionByValue(options, value)?.title || String(value)
  return <span className="break-all whitespace-pre-wrap">{label}</span>
}

// ==================== 主组件与渲染入口 ====================

/**
 * 人员选择主组件（受控）：value/onChange 由 Arco FormItem 注入。
 * 作为 renderPreview 渲染时接收 el/pageType/rt；作为 FormItem 子元素时额外接收 value/onChange/disabled。
 */
export function UserSelect({ el, pageType, rt, value, onChange, disabled }) {
  const options = useUserOptions(el, rt)

  // 画布详情占位（move-detail）：仅一个只读输入框
  if (pageType === 'move-detail') {
    return <Input placeholder={el.placeholder || undefined} />
  }

  // 画布表单占位（move-form）：只读输入框 + 禁用的「选择」按钮
  if (pageType === 'move-form') {
    return (
      <Input.Search
        placeholder={el.placeholder || undefined}
        searchButton="选择"
        disabled
      />
    )
  }

  // detail 只读：展示已选人员名
  if (pageType === 'detail') {
    return <UserReadOnly value={value} el={el} rt={rt} />
  }

  // form / 可编辑：弹窗单选
  return (
    <UserPicker
      value={value}
      onChange={onChange}
      options={options}
      placeholder={el?.placeholder}
      disabled={disabled}
    />
  )
}

/** ELEMENT_RENDER_CONFIG.userselect.renderPreview 入口 */
export function renderUserPreview(el, pageType, rt) {
  return <UserSelect el={el} pageType={pageType} rt={rt} />
}
