import {
  Button,
  Empty,
  Form,
  Grid,
  Input,
  InputNumber,
  Message,
  Popconfirm,
  Radio,
  Tabs,
  Tag,
} from '@arco-design/web-react'
import { IconDelete, IconDragArrow, IconSave, IconSync } from '@arco-design/web-react/icon'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useParams } from 'react-router-dom'
import * as applicationApi from '../../api/application'
import { ELEMENT_TYPE_OPTIONS } from '../../config/app.js'
import { useTabs } from '../../store/tab-context'
import {
  BASE_LAYOUT_ELEMENTS,
  getBaseElementConfig,
  isBaseElement,
  renderPreviewConfig,
} from './elementsConfig'

const FormItem = Form.Item
const Row = Grid.Row
const Col = Grid.Col
const TabPane = Tabs.TabPane

const MODULE_LABEL = '布局管理'

// 元素宽度占比（24 栅格，短标签适配按钮式 Radio）
const WIDTH_OPTIONS = [
  { label: '100%', value: 24, tip: '整行' },
  { label: '50%', value: 12, tip: '1/2' },
  { label: '33%', value: 8, tip: '1/3' },
  { label: '25%', value: 6, tip: '1/4' },
]

// 全局表单配置默认值
const DEFAULT_FORM_CONFIG = {
  layout: 'horizontal', // vertical | horizontal
  labelWidth: 100,
  labelAlign: 'right', // left | right
}

const LAYOUT_OPTIONS = [
  { label: '垂直布局', value: 'vertical' },
  { label: '水平布局', value: 'horizontal' },
]

const ALIGN_OPTIONS = [
  { label: '左对齐', value: 'left' },
  { label: '右对齐', value: 'right' },
]

// 布局页面类型（表单页 / 详情页）
const PAGE_OPTIONS = [
  { label: '表单页', value: 'form' },
  { label: '详情页', value: 'detail' },
]

const genId = () => `el_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

// 解析后端布局 JSON（form_layout_json / detail_layout_json 均为 { formConfig, elements } 结构）
const parseLayoutJson = (raw) => {
  if (!raw) return null
  try {
    return {
      formConfig: { ...DEFAULT_FORM_CONFIG, ...(raw.formConfig || {}) },
      elements: Array.isArray(raw.elements) ? raw.elements : [],
    }
  } catch (e) {
    return null
  }
}

// 根据类型获取中文标签
const getTypeLabel = (type) => ELEMENT_TYPE_OPTIONS.find((c) => c.value === type)?.label || type

export default function LayoutManage() {
  const location = useLocation()
  const { id } = useParams()
  const { tabs, activeTab, addTab, updateTab } = useTabs()

  // 左侧组件库（来自当前应用的表单元素接口）
  const [library, setLibrary] = useState([])
  const [libraryLoading, setLibraryLoading] = useState(false)
  // 应用的主表 / 子表信息（用于组件库分组）
  const [appTables, setAppTables] = useState({ tableName: '', subTables: [] })

  // 布局数据：按页面类型（表单页 / 详情页）分别缓存两套布局配置
  const [activePage, setActivePage] = useState('form') // 'form' | 'detail'
  const [layouts, setLayouts] = useState({
    form: { formConfig: { ...DEFAULT_FORM_CONFIG }, elements: [] },
    detail: { formConfig: { ...DEFAULT_FORM_CONFIG }, elements: [] },
  })

  // 当前激活页的派生数据（画布渲染与右侧属性面板均基于此）
  const { formConfig, elements } = layouts[activePage]

  const updateLayout = (patch) =>
    setLayouts((prev) => ({ ...prev, [activePage]: { ...prev[activePage], ...patch } }))

  // 选中与面板
  const [selectedId, setSelectedId] = useState(null)
  const [activePanel, setActivePanel] = useState('form')
  const [saving, setSaving] = useState(false)

  // 子表字段缓存（表格列级联选择）：{ [tableKey]: fields[] } + 各表加载中状态
  const [tableFieldsMap, setTableFieldsMap] = useState({})
  const [fieldLoadingKeys, setFieldLoadingKeys] = useState({})

  // 拖拽状态
  const dragType = useRef(null) // 'new' | 'move'
  const dragNewItem = useRef(null)
  const dragSourceId = useRef(null)
  const [dragOverIndex, setDragOverIndex] = useState(null)

  // 挂载：确保页签存在、获取应用名更新标题、加载已有布局配置
  useEffect(() => {
    addTab({ path: location.pathname, title: MODULE_LABEL })
    let cancelled = false
    applicationApi
      .getApplication(id)
      .then((res) => {
        if (cancelled) return
        const data = res.data
        if (data?.name) {
          updateTab(location.pathname, { title: `${data.name} - ${MODULE_LABEL}` })
        }
        // 解析主表 / 子表（子表可能为逗号分隔字符串）
        const subTables = (data?.sub_table_name || '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
        setAppTables({ tableName: data?.table_name || '', subTables })
        // 分别回填表单页 / 详情页的布局配置
        const formLayout = parseLayoutJson(data?.form_layout_json)
        const detailLayout = parseLayoutJson(data?.detail_layout_json)
        setLayouts((prev) => ({
          form: formLayout || prev.form,
          detail: detailLayout || prev.detail,
        }))
        // 收集所有表格组件已配置的关联子表，自动加载字段缓存（保证重进/刷新后列配置可回显）
        const tableKeys = [...(formLayout?.elements || []), ...(detailLayout?.elements || [])]
          .filter((el) => el.type === 'table' && el.table_key)
          .map((el) => el.table_key)
        new Set(tableKeys).forEach((tk) => {
          if (tk) loadTableFields(tk)
        })
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [id, location.pathname, addTab, updateTab])

  // 加载左侧组件库：获取当前应用关联的表单元素并映射为可拖拽项
  useEffect(() => {
    let cancelled = false
    setLibraryLoading(true)
    applicationApi
      .listFormElements(id, { page: 1, size: 9999 })
      .then((res) => {
        if (cancelled) return
        const list = res.data?.list || []
        setLibrary(list.map((item) => ({ ...item, element_id: item.id })))
      })
      .catch(() => setLibrary([]))
      .finally(() => {
        if (!cancelled) setLibraryLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [id])

  // 组件库按分组展示：固定"基础"分组（最前）+ 主表 / 子表 / 其他
  const libraryGroups = useMemo(() => {
    const { tableName, subTables } = appTables
    const groups = []
    // 固定的"基础"分组（配置集中维护于 config/app.js，始终显示，不依赖后端表单元素）
    groups.push({
      title: '基础',
      items: BASE_LAYOUT_ELEMENTS,
    })
    if (tableName) {
      const items = library.filter((i) => i.table_key === tableName)
      if (items.length) groups.push({ title: `主表 · ${tableName}`, items })
    }
    subTables.forEach((tb) => {
      const items = library.filter((i) => i.table_key === tb)
      if (items.length) groups.push({ title: `子表 · ${tb}`, items })
    })
    const others = library.filter(
      (i) => i.table_key !== tableName && !subTables.includes(i.table_key),
    )
    if (others.length) groups.push({ title: '其他', items: others })
    return groups
  }, [library, appTables])

  const selectedElement = elements.find((e) => e.id === selectedId) || null
  const panelKey = selectedElement ? activePanel : 'form'

  // ==================== 画布操作 ====================

  const addElement = (libItem, index) => {
    if (!libItem) return
    const el = {
      ...libItem,
      id: genId(),
      width: libItem.width || 12,
    }
    setLayouts((prev) => {
      const cur = prev[activePage]
      const next = [...cur.elements]
      if (index == null || index === -1) next.push(el)
      else next.splice(index, 0, el)
      return { ...prev, [activePage]: { ...cur, elements: next } }
    })
    setSelectedId(el.id)
    setActivePanel('element')
  }

  const moveElement = (sourceId, targetIndex) => {
    if (!sourceId) return
    setLayouts((prev) => {
      const cur = prev[activePage]
      const next = [...cur.elements]
      const from = next.findIndex((e) => e.id === sourceId)
      if (from === -1) return prev
      const [moved] = next.splice(from, 1)
      let to = targetIndex
      if (to == null || to === -1) to = next.length
      else if (from < to) to -= 1
      next.splice(Math.max(0, Math.min(to, next.length)), 0, moved)
      return { ...prev, [activePage]: { ...cur, elements: next } }
    })
  }

  const removeElement = (elId) => {
    setLayouts((prev) => {
      const cur = prev[activePage]
      return {
        ...prev,
        [activePage]: { ...cur, elements: cur.elements.filter((e) => e.id !== elId) },
      }
    })
    if (selectedId === elId) {
      setSelectedId(null)
      setActivePanel('form')
    }
  }

  const handleClear = () => {
    updateLayout({ elements: [] })
    setSelectedId(null)
    setActivePanel('form')
  }

  // 将表单页布局深拷贝后完整覆盖到详情页，并过滤 table 元素中的操作列（action）
  const handleSyncLayout = () => {
    setLayouts((prev) => {
      const cloned = structuredClone(prev.form)
      cloned.elements = (cloned.elements || []).map((el) => {
        if (el.element_type === 'table' && Array.isArray(el.columns)) {
          return { ...el, columns: el.columns.filter((c) => c.key !== 'action') }
        }
        return el
      })
      return { ...prev, detail: cloned }
    })
    Message.success('已同步至详情页')
  }

  const handleCanvasDrop = (e, index) => {
    e.preventDefault()
    e.stopPropagation()
    if (dragType.current === 'new') {
      addElement(dragNewItem.current, index)
    } else if (dragType.current === 'move') {
      moveElement(dragSourceId.current, index)
    }
    dragType.current = null
    dragNewItem.current = null
    dragSourceId.current = null
    setDragOverIndex(null)
  }

  // ==================== 属性编辑 ====================

  const updateFormConfig = (patch) =>
    setLayouts((prev) => {
      const cur = prev[activePage]
      return { ...prev, [activePage]: { ...cur, formConfig: { ...cur.formConfig, ...patch } } }
    })

  const updateSelectedElement = (patch) => {
    if (!selectedId) return
    setLayouts((prev) => {
      const cur = prev[activePage]
      return {
        ...prev,
        [activePage]: {
          ...cur,
          elements: cur.elements.map((e) => (e.id === selectedId ? { ...e, ...patch } : e)),
        },
      }
    })
  }

  // ==================== 表格列配置 ====================

  const genColumn = (cols) => ({
    id: `col_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    table_key: selectedElement?.table_key || '',
    title: `列${(cols || []).length + 1}`,
    dataIndex: null,
  })

  const updateSelectedElementColumns = (fn) => {
    if (!selectedId) return
    setLayouts((prev) => {
      const cur = prev[activePage]
      return {
        ...prev,
        [activePage]: {
          ...cur,
          elements: cur.elements.map((e) =>
            e.id === selectedId ? { ...e, columns: fn(e.columns || []) } : e,
          ),
        },
      }
    })
  }

  const addColumn = () => updateSelectedElementColumns((cols) => [...cols, genColumn(cols)])

  const removeColumn = (colId) =>
    updateSelectedElementColumns((cols) => cols.filter((c) => c.id !== colId))

  const updateColumn = (colId, patch) =>
    updateSelectedElementColumns((cols) =>
      cols.map((c) => (c.id === colId ? { ...c, ...patch } : c)),
    )

  // 加载指定表下的字段列表（表单元素接口，按 table_key 过滤），并缓存
  const loadTableFields = async (tableKey) => {
    if (!tableKey) return
    setFieldLoadingKeys((prev) => ({ ...prev, [tableKey]: true }))
    try {
      const res = await applicationApi.listFormElements(id, {
        page: 1,
        size: 9999,
        table_key: tableKey,
      })
      const list = (res.data?.list || []).filter((f) => !tableKey || f.table_key === tableKey)
      setTableFieldsMap((prev) => ({ ...prev, [tableKey]: list }))
    } catch (e) {
      setTableFieldsMap((prev) => ({ ...prev, [tableKey]: [] }))
    } finally {
      setFieldLoadingKeys((prev) => ({ ...prev, [tableKey]: false }))
    }
  }

  // 全局关联子表：保存到表格元素层级，并联动加载字段缓存
  const handleTableKeyChange = (tableKey) => {
    updateSelectedElement({ table_key: tableKey })
    if (tableKey && !tableFieldsMap[tableKey]) {
      loadTableFields(tableKey)
    }
  }

  // 选中表格元素时：若关联子表字段未缓存则自动加载（兜底，覆盖初始化回填后的懒加载场景）
  useEffect(() => {
    const tk = selectedElement?.table_key
    if (selectedElement?.element_type === 'table' && tk && !tableFieldsMap[tk]) {
      loadTableFields(tk)
    }
  }, [selectedElement, tableFieldsMap])

  // 选择字段：自动将字段的 label 赋给 title、field_key 赋给 dataIndex
  const handleColumnFieldChange = (colId, tableKey, fieldKey) => {
    if (!tableKey) return
    const fields = tableFieldsMap[tableKey] || []
    const field = fields.find((f) => f.field_key === fieldKey || String(f.id) === fieldKey)
    updateColumn(colId, {
      dataIndex: field?.field_key || fieldKey,
      title: field?.label || field?.name || fieldKey,
    })
  }

  // 切换表单页 / 详情页（重置选中与面板状态）
  const handlePageChange = (page) => {
    setActivePage(page)
    setSelectedId(null)
    setActivePanel('form')
  }

  // ==================== 保存 ====================

  const handleSave = async () => {
    setSaving(true)
    try {
      const key = activePage === 'form' ? 'form_layout_json' : 'detail_layout_json'
      const layoutData = { formConfig, elements }
      await applicationApi.updateApplication(id, { [key]: layoutData })
      Message.success(`${activePage === 'form' ? '表单页' : '详情页'}布局配置已保存`)
    } catch (e) {
      Message.error('保存失败，请稍后重试')
    } finally {
      setSaving(false)
    }
  }

  // ==================== 元素预览渲染 ====================

  const renderElementPreview = (el) => {
    // 基础组件（分割线/表格等）：从配置中心分派预览渲染
    const baseCfg = getBaseElementConfig(el.element_type)
    if (baseCfg?.renderPreview) return baseCfg.renderPreview(el, activePage)
    // 常规表单控件：从 renderPreviewConfig 映射查找
    const render = renderPreviewConfig[el.element_type]
    if (render) return render(el)
    // 兜底：单行输入框
    return <Input disabled placeholder={el.placeholder || undefined} />
  }

  const isHorizontal = formConfig.layout === 'horizontal'

  // 注入基础组件属性面板的上下文（组件级状态 + 回调，由配置中心的 renderSettings 按需取用）
  const settingsCtx = {
    selectedElement,
    appTables,
    tableFieldsMap,
    fieldLoadingKeys,
    updateSelectedElement,
    handleTableKeyChange,
    handleColumnFieldChange,
    addColumn,
    removeColumn,
  }

  return (
    <div className="flex h-[calc(100vh-160px)] items-stretch border border-gray-200 bg-white">
      {/* ========== 左侧：组件库（按表分组，两列网格） ========== */}
      <div className="flex w-56 shrink-0 flex-col">
        <div className="shrink-0 border-b border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-800">
          组件库
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          {libraryLoading ? (
            <Empty description="加载中..." />
          ) : (
            libraryGroups.map((group) => (
              <div key={group.title} className="mb-3 last:mb-0">
                <div className="mb-2 text-xs font-medium text-gray-500">{group.title}</div>
                <div className="grid grid-cols-2 gap-2">
                  {group.items.map((item) => (
                    <div
                      key={item.key}
                      draggable
                      onDragStart={(e) => {
                        dragType.current = 'new'
                        dragNewItem.current = item
                        e.dataTransfer.setData('text/plain', item.key)
                        e.dataTransfer.effectAllowed = 'copy'
                      }}
                      onDragEnd={() => {
                        dragType.current = null
                        dragNewItem.current = null
                        setDragOverIndex(null)
                      }}
                      title={item.label}
                      className="flex cursor-grab items-center justify-center rounded border border-gray-200 bg-gray-50 px-1 py-2 text-center text-xs text-gray-700 transition-colors hover:border-[rgb(var(--arcoblue-6))] hover:bg-[rgb(var(--arcoblue-1))]"
                    >
                      <span className="w-full truncate">{item.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ========== 中间：预览画布（自定义 Header，标题靠左 / 按钮靠右） ========== */}
      <div className="flex min-w-0 flex-1 flex-col border-x border-gray-200">
        <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-4 py-2">
          <div className="w-60 text-sm font-medium text-gray-800">预览画布</div>
          {/* 表单页 / 详情页切换 */}
          <Radio.Group
            type="button"
            size="mini"
            value={activePage}
            onChange={handlePageChange}
            options={PAGE_OPTIONS}
          />
          <div className="flex w-60 items-center justify-end gap-2">
            {/* 详情页编辑时：一键将表单页布局同步到详情页 */}
            {activePage === 'detail' && (
              <Button size="mini" icon={<IconSync />} onClick={handleSyncLayout}>
                同步布局
              </Button>
            )}
            <Popconfirm title="确定清空画布中的所有表单元素吗？" onOk={handleClear}>
              <Button size="mini" icon={<IconDelete />}>
                清空
              </Button>
            </Popconfirm>
            <Button
              size="mini"
              type="primary"
              icon={<IconSave />}
              loading={saving}
              onClick={handleSave}
            >
              保存
            </Button>
          </div>
        </div>

        <div
          className="m-4 flex-1 overflow-auto border-2 border-dashed border-gray-200 p-4"
          onDragOver={(e) => {
            e.preventDefault()
            e.dataTransfer.dropEffect = dragType.current === 'move' ? 'move' : 'copy'
          }}
          onDrop={(e) => handleCanvasDrop(e, -1)}
          onClick={() => {
            setSelectedId(null)
            setActivePanel('form')
          }}
        >
          {elements.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <Empty description="从左侧拖拽表单元素到此处开始设计" />
            </div>
          ) : (
            <Form
              className={'mx-auto max-w-187.5'}
              layout={formConfig.layout}
              labelAlign={formConfig.labelAlign}
              labelCol={isHorizontal ? { style: { flexBasis: formConfig.labelWidth } } : undefined}
              wrapperCol={
                isHorizontal
                  ? { style: { flexBasis: `calc(100% - ${formConfig.labelWidth}px)` } }
                  : undefined
              }
            >
              <Row gutter={[12, 12]}>
                {elements.map((el, index) => {
                  const isSelected = el.id === selectedId
                  const isDragOver = dragOverIndex === index
                  return (
                    <Col span={el.width} key={el.id}>
                      <div
                        draggable
                        onClick={(e) => {
                          e.stopPropagation()
                          setSelectedId(el.id)
                          setActivePanel('element')
                        }}
                        onDragStart={(e) => {
                          dragType.current = 'move'
                          dragSourceId.current = el.id
                          e.dataTransfer.effectAllowed = 'move'
                          e.stopPropagation()
                        }}
                        onDragOver={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          setDragOverIndex(index)
                        }}
                        onDrop={(e) => handleCanvasDrop(e, index)}
                        onDragEnd={() => {
                          dragType.current = null
                          dragSourceId.current = null
                          setDragOverIndex(null)
                        }}
                        className={`group relative h-full cursor-pointer border transition-colors ${
                          isSelected
                            ? 'border-[rgb(var(--arcoblue-6))] bg-[rgb(var(--arcoblue-1))]'
                            : isDragOver
                              ? 'border-dashed border-[rgb(var(--arcoblue-6))] bg-[rgb(var(--arcoblue-1))]'
                              : 'border-transparent bg-white hover:border-[rgb(var(--arcoblue-6))]'
                        }`}
                      >
                        {/* 使用 Form.Item 展示字段名称（label）与必填星号，布局/标签宽度/对齐由 Form 统一控制 */}
                        <FormItem
                          label={isBaseElement(el.element_type) ? '\u00A0' : el.label}
                          required={Boolean(el.required)}
                          className="mb-0!"
                        >
                          {renderElementPreview(el)}
                          {/* mask 蒙层 */}
                          <div className="absolute inset-0 z-1"></div>
                        </FormItem>

                        {isSelected && (
                          <>
                            {/* 拖拽图标：绝对定位左下角，hover 显示 */}
                            <span className="absolute bottom-0 left-0 bg-[rgb(var(--arcoblue-6))] px-0.5">
                              <IconDragArrow className="cursor-grab text-white!" />
                            </span>
                            {/* 删除按钮：绝对定位右上角（悬浮于边框上），hover 显示（原生 title 提示，避免 Trigger 组件动态重排崩溃） */}
                            <Button
                              size="mini"
                              status="danger"
                              shape="circle"
                              icon={<IconDelete />}
                              title="删除元素"
                              className="absolute! -top-2 -right-2 z-2 shadow"
                              onClick={(e) => {
                                e.stopPropagation()
                                removeElement(el.id)
                              }}
                            />
                          </>
                        )}
                      </div>
                    </Col>
                  )
                })}
              </Row>
            </Form>
          )}
        </div>
      </div>

      {/* ========== 右侧：属性配置面板（Tabs 作为顶部导航） ========== */}
      <div className="flex w-80 shrink-0 flex-col overflow-hidden">
        <Tabs
          activeTab={panelKey}
          onChange={setActivePanel}
          className="flex min-h-0 flex-1 flex-col py-px [&_.arco-tabs-content]:min-h-0 [&_.arco-tabs-content]:flex-1 [&_.arco-tabs-content]:overflow-y-auto [&_.arco-tabs-content]:px-3"
        >
          {/* 表单全局设置 */}
          <TabPane key="form" title="表单设置">
            <div className="flex flex-col gap-4 py-2">
              <div>
                <div className="mb-2 text-sm text-gray-600">布局方式</div>
                <Radio.Group
                  type="button"
                  value={formConfig.layout}
                  onChange={(v) => updateFormConfig({ layout: v })}
                  options={LAYOUT_OPTIONS}
                />
              </div>
              {isHorizontal && (
                <>
                  <div>
                    <div className="mb-2 text-sm text-gray-600">标签宽度</div>
                    <InputNumber
                      min={40}
                      max={300}
                      value={formConfig.labelWidth}
                      onChange={(v) => updateFormConfig({ labelWidth: v ?? 100 })}
                      style={{ width: '100%' }}
                    />
                  </div>
                  <div>
                    <div className="mb-2 text-sm text-gray-600">标签对齐方式</div>
                    <Radio.Group
                      type="button"
                      value={formConfig.labelAlign}
                      onChange={(v) => updateFormConfig({ labelAlign: v })}
                      options={ALIGN_OPTIONS}
                    />
                  </div>
                </>
              )}
              <div className="rounded bg-gray-50 p-3 text-xs leading-relaxed text-gray-500">
                <div className="mb-1 font-medium text-gray-600">表单配置说明：</div>
                <div>· 垂直布局：标签显示在控件上方</div>
                <div>· 水平布局：标签显示在控件左侧，可调整标签宽度与对齐</div>
              </div>
            </div>
          </TabPane>

          {/* 元素属性设置：未选中元素时不渲染该 Tab */}
          {selectedElement && (
            <TabPane key="element" title="元素属性">
              <div className="flex flex-col gap-4 py-2">
                {!isBaseElement(selectedElement.element_type) && (
                  <>
                    <div>
                      <div className="mb-2 text-sm text-gray-600">元素类型</div>
                      <Tag color="arcoblue" size="medium">
                        {getTypeLabel(selectedElement.element_type)}
                      </Tag>
                    </div>
                    <div>
                      <div className="mb-2 text-sm text-gray-600">字段名称</div>
                      <Input
                        value={selectedElement.label}
                        onChange={(v) => updateSelectedElement({ label: v })}
                        placeholder="请输入字段名称"
                      />
                    </div>
                    <div>
                      <div className="mb-2 text-sm text-gray-600">宽度占比</div>
                      <Radio.Group
                        type="button"
                        value={selectedElement.width}
                        onChange={(v) => updateSelectedElement({ width: v })}
                      >
                        {WIDTH_OPTIONS.map((opt) => (
                          <Radio key={opt.value} value={opt.value}>
                            {opt.tip}
                          </Radio>
                        ))}
                      </Radio.Group>
                    </div>
                  </>
                )}
                {/* 基础组件的专属属性配置（从配置中心动态分发：表格列配置、分割线样式等） */}
                {getBaseElementConfig(selectedElement.element_type)?.renderSettings?.(settingsCtx)}
              </div>
            </TabPane>
          )}
        </Tabs>
      </div>
    </div>
  )
}
