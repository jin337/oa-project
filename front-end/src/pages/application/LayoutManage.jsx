import {
  Button,
  Checkbox,
  DatePicker,
  Empty,
  Form,
  Grid,
  Input,
  InputNumber,
  Message,
  Popconfirm,
  Radio,
  Select,
  Switch,
  Tabs,
  Tag,
  TimePicker,
} from '@arco-design/web-react'
import { IconDelete, IconDragArrow, IconSave } from '@arco-design/web-react/icon'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useParams } from 'react-router-dom'
import * as applicationApi from '../../api/application'
import { ELEMENT_TYPE_OPTIONS } from '../../config/app.js'
import { useTabs } from '../../store/tab-context'

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
  if (!raw || typeof raw !== 'string') return null
  try {
    const parsed = JSON.parse(raw)
    return {
      formConfig: { ...DEFAULT_FORM_CONFIG, ...(parsed.formConfig || {}) },
      elements: Array.isArray(parsed.elements) ? parsed.elements : [],
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
        setLayouts((prev) => ({
          form: parseLayoutJson(data?.form_layout_json) || prev.form,
          detail: parseLayoutJson(data?.detail_layout_json) || prev.detail,
        }))
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
        setLibrary(
          list.map((item) => ({...item,element_id:item.id})),
        )
      })
      .catch(() => setLibrary([]))
      .finally(() => {
        if (!cancelled) setLibraryLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [id])

  // 组件库按表分组：主表 / 子表 / 其他
  const libraryGroups = useMemo(() => {
    const { tableName, subTables } = appTables
    const groups = []
    if (tableName) {
      const items = library.filter((i) => i.tableKey === tableName)
      if (items.length) groups.push({ title: `主表 · ${tableName}`, items })
    }
    subTables.forEach((tb) => {
      const items = library.filter((i) => i.tableKey === tb)
      if (items.length) groups.push({ title: `子表 · ${tb}`, items })
    })
    const others = library.filter(
      (i) => i.tableKey !== tableName && !subTables.includes(i.tableKey),
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
      width: 12,
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
      await applicationApi.updateApplication(id, { [key]: JSON.stringify(layoutData) })
      Message.success(`${activePage === 'form' ? '表单页' : '详情页'}布局配置已保存`)
    } catch (e) {
      Message.error('保存失败，请稍后重试')
    } finally {
      setSaving(false)
    }
  }

  // ==================== 元素预览渲染 ====================

  const renderElementPreview = (el) => {
    const disabledProps = { disabled: true, placeholder: el.placeholder || undefined }
    switch (el.type) {
      case 'textarea':
        return <Input.TextArea {...disabledProps} autoSize={{ minRows: 2 }} />
      case 'number':
        return <InputNumber {...disabledProps} style={{ width: '100%' }} />
      case 'select':
        return <Select {...disabledProps} placeholder={el.placeholder || '请选择'} />
      case 'radio':
        return (
          <Radio.Group disabled>
            <Radio>选项一</Radio>
            <Radio>选项二</Radio>
          </Radio.Group>
        )
      case 'checkbox':
        return (
          <Checkbox.Group disabled>
            <Checkbox>选项一</Checkbox>
            <Checkbox>选项二</Checkbox>
          </Checkbox.Group>
        )
      case 'date':
      case 'datepicker':
        return <DatePicker {...disabledProps} />
      case 'time':
      case 'timepicker':
        return <TimePicker {...disabledProps} style={{ width: '100%' }} />
      case 'switch':
        return <Switch disabled />
      case 'upload':
        return <Input {...disabledProps} placeholder="点击上传" />
      default:
        return <Input {...disabledProps} />
    }
  }

  const isHorizontal = formConfig.layout === 'horizontal'

  return (
    <div className="flex items-start">
      {/* ========== 左侧：组件库（按表分组，两列网格） ========== */}
      <div className="w-56 shrink-0 self-stretch border border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-800">
          组件库
        </div>
        <div className="max-h-[calc(100vh-220px)] overflow-y-auto p-3">
          {libraryLoading ? (
            <Empty description="加载中..." />
          ) : library.length === 0 ? (
            <Empty description="暂无表单元素" />
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
      <div className="min-w-0 flex-1 self-stretch border-y border-gray-200 bg-white">
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-2">
          <span className="text-sm font-medium text-gray-800">预览画布</span>
          {/* 表单页 / 详情页切换 */}
          <Radio.Group
            type="button"
            size="mini"
            value={activePage}
            onChange={handlePageChange}
            options={PAGE_OPTIONS}
          />
          <div className="flex items-center gap-2">
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
          className="m-4 min-h-105 border-2 border-dashed border-gray-200 p-4"
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
            <div className="flex h-95 items-center justify-center">
              <Empty description="从左侧拖拽表单元素到此处开始设计" />
            </div>
          ) : (
            <Form
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
                          label={el.label}
                          required={Boolean(el.required)}
                          className="mb-0!"
                        >
                          {renderElementPreview(el)}
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
                              className="absolute! -top-2 -right-2 shadow"
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
      <div className="w-80 shrink-0 self-stretch border border-gray-200 bg-white">
        <Tabs
          activeTab={panelKey}
          onChange={setActivePanel}
          className="py-px [&_.arco-tabs-content]:px-3"
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
              </div>
            </TabPane>
          )}
        </Tabs>
      </div>
    </div>
  )
}
