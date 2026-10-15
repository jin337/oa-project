import { Input, Modal, Tree } from '@arco-design/web-react'
import { useEffect, useMemo, useState } from 'react'
import { findOptionByValue, getStaticOptions } from '../utils/formUtils'
import { loadDataSourceOptions } from '../utils/optionLoader'
import { applyScroll, markScroll } from '../utils/scrollGuard'

/**
 * 部门选择元素（deptselect）
 *
 * 呈现方式参考审批流配置中"发起人选择"：已选标签 + 「选择部门」按钮唤起弹窗，弹窗内部门树单选（支持搜索）。
 *
 * 数据源支持（与 select/treeselect 一致）：
 *   - data_source.type='api'  动态接口（如接口管理的部门树 GET /depts）。
 *     运行时（form 模式）优先取 rt.getOptions 已加载的选项（支持 ${form.xxx} 参数 / 标签表达式）；
 *     详情（detail 模式）rt 不可用时自加载接口并映射为 {value, title, children} 树。
 *   - data_source.type='json' 静态选项 [{label, value, children?}]
 *
 * pageType 渲染策略：
 *   - form        可交互选择（实际表单填写，FormItem 注入 value/onChange/disabled）
 *   - move-form   画布预览（禁用占位，不解析真实数据源）
 *   - detail / move-detail 只读回显由 renderFormItemElement 统一拦截：经 ReadonlyValue →
 *     DeptReadOnly 反查部门名（move-detail 注入模拟值，反查不到回退原值）
 *
 * 导出清单：
 *   - DeptSelect        部门选择主组件（form / move-form / detail 分派）
 *   - DeptReadOnly      只读展示（READONLY_RENDERERS 注册）
 *   - renderDeptPreview ELEMENT_RENDER_CONFIG 注册入口
 */

// ==================== 工具 ====================

/** 递归将任意来源数据转为部门树选项 {value, title, children}（兼容 id/name、value/title、label/value） */
const toTreeOptions = (list) =>
  Array.isArray(list)
    ? list.map((n) => mapNode(n)).filter(Boolean)
    : []

const mapNode = (n) => {
  if (n == null) return null
  const value = n.value ?? n.id ?? n.key ?? n.code
  const title = n.title ?? n.label ?? n.name ?? String(value ?? '')
  if (value === undefined || value === null || value === '') return null
  return {
    value,
    title: String(title ?? ''),
    children: Array.isArray(n.children) && n.children.length ? n.children.map(mapNode).filter(Boolean) : undefined,
  }
}

/** 按标题关键字过滤树（保留命中节点及其子孙，命中节点的子级保留原状） */
const filterTree = (nodes, keyword) => {
  if (!keyword) return nodes
  const k = String(keyword).toLowerCase()
  const walk = (list) =>
    list
      .map((n) => {
        const hit = String(n.title || '').toLowerCase().includes(k)
        const kids = Array.isArray(n.children) && n.children.length ? walk(n.children) : []
        if (hit) return { ...n, children: kids && kids.length ? kids : n.children }
        return kids && kids.length ? { ...n, children: kids } : null
      })
      .filter(Boolean)
  return walk(nodes)
}

/**
 * 部门选项 Hook：
 * 1. 运行时 rt 已加载选项（form 模式，DynamicForm loadOptions 提供）→ 优先使用；
 * 2. rt.managesOptions 为真时（form 运行时）由 DynamicForm 统一加载，此处不再自请求，
 *    避免同一字段被两条路径各加载一次；
 * 3. 否则 data_source.type='api' 且配置了 url → 自加载（detail 等 rt 不可用场景）；
 * 4. 最后回退静态 json 选项。
 */
const useDeptOptions = (el, rt, pageType) => {
  const rtOptions = rt?.getOptions?.(el)
  const hasRt = Array.isArray(rtOptions) && rtOptions.length > 0
  const [selfOptions, setSelfOptions] = useState([])
  const ds = el?.data_source

  // 画布预览（move-form / move-detail）一律走静态默认数据，不请求接口
  const isPreview = pageType === 'move-form' || pageType === 'move-detail'

  useEffect(() => {
    if (isPreview || hasRt || rt?.managesOptions || ds?.type !== 'api' || !ds?.url) return
    let alive = true
    // 走共享加载器：同一时刻相同请求（method+url+params）会合并为一次网络往返，
    // 避免子表多行 / 多个字段引用同一接口时重复请求。失败返回 null，保留空选项。
    loadDataSourceOptions(ds).then((data) => {
      if (alive && data != null) setSelfOptions(toTreeOptions(data))
    })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [el?.id, ds?.type, ds?.url, hasRt, isPreview])

  const options = hasRt ? rtOptions : selfOptions.length ? selfOptions : getStaticOptions(el)
  return options
}

// ==================== 选择控件 ====================

/**
 * Input.Search 形式：输入框只读（展示已选部门名，不可手动输入），点「选择」按钮唤起弹窗，
 * 弹窗内部门树勾选单选（父子独立勾选，仅取最后勾选项；取消全部勾选后确定即清空）。
 * value：部门 id（单选标量）；onChange：选中部门 id（未选传 ''）。
 */
function DeptPicker({ value, onChange, options, placeholder, label, disabled }) {
  const [visible, setVisible] = useState(false)
  const [checkedKeys, setCheckedKeys] = useState([])
  const [searchValue, setSearchValue] = useState('')

  // 已选部门名：递归反查树选项
  const selectedLabel = useMemo(() => {
    if (value == null || value === '') return ''
    return findOptionByValue(options, value)?.title || String(value)
  }, [options, value])

  // options → Arco Tree treeData（key/title 结构）
  const treeData = useMemo(() => {
    const map = (nodes) =>
      (nodes || []).map((n) => ({
        key: n.value,
        title: n.title ?? n.label ?? String(n.value ?? ''),
        children: Array.isArray(n.children) && n.children.length ? map(n.children) : undefined,
      }))
    return map(filterTree(options, searchValue.trim()))
  }, [options, searchValue])

  const open = () => {
    markScroll() // Modal 开合会改写 body overflow 并可能重置滚动位置，先记下来
    setSearchValue('')
    setCheckedKeys(value == null || value === '' ? [] : [value])
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
          title={label ? `${label}选择` : '部门选择'}
          visible
          onCancel={() => {
            setVisible(false)
            applyScroll()
          }}
          onOk={() => {
            onChange(checkedKeys.length ? checkedKeys[checkedKeys.length - 1] : '')
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
              placeholder={label ? `搜索${label}` : '搜索部门'}
            />
          </div>
          <div className="h-80 overflow-auto rounded border border-gray-200 p-3">
            {treeData.length ? (
              <Tree
                checkable
                checkStrictly
                checkedKeys={checkedKeys}
                onCheck={(keys) => {
                  // checkStrictly 下父子独立勾选：keys 为 { checked, halfChecked } 或数组
                  const arr = Array.isArray(keys) ? keys : keys?.checked || []
                  // 单选：仅保留最后勾选的节点
                  setCheckedKeys(arr.slice(-1))
                }}
                treeData={treeData}
              />
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

/** 详情只读：显示已选部门名（数据源自加载反查），空值显示 '-' */
export function DeptReadOnly({ value, el, rt, pageType }) {
  const options = useDeptOptions(el, rt, pageType)
  if (value == null || value === '') {
    return <span className="break-all whitespace-pre-wrap">-</span>
  }
  const label = findOptionByValue(options, value)?.title || String(value)
  return <span className="break-all whitespace-pre-wrap">{label}</span>
}

// ==================== 主组件与渲染入口 ====================

/**
 * 部门选择主组件（受控）：value/onChange 由 Arco FormItem 注入。
 * 作为 renderPreview 渲染时接收 el/pageType/rt；作为 FormItem 子元素时额外接收 value/onChange/disabled。
 */
export function DeptSelect({ el, pageType, rt, value, onChange, disabled }) {
  const options = useDeptOptions(el, rt, pageType)

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

  // detail 只读：展示已选部门名
  if (pageType === 'detail') {
    return <DeptReadOnly value={value} el={el} rt={rt} />
  }

  // form / 可编辑：弹窗单选
  return (
    <DeptPicker
      value={value}
      onChange={onChange}
      options={options}
      placeholder={el?.placeholder||undefined}
      label={el?.label}
      disabled={disabled}
    />
  )
}

/** ELEMENT_RENDER_CONFIG.deptselect.renderPreview 入口 */
export function renderDeptPreview(el, pageType, rt) {
  return <DeptSelect el={el} pageType={pageType} rt={rt} />
}
