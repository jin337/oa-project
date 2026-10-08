import {
  Button,
  Empty,
  InputNumber,
  Message,
  Popconfirm,
  Radio,
  Tabs,
  Tooltip,
} from '@arco-design/web-react'
import { IconDelete, IconSave, IconSync } from '@arco-design/web-react/icon'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useParams } from 'react-router-dom'
import * as applicationApi from 'src/api/application'
import { fetchAll } from 'src/api/fetchAll'
import DynamicForm, {
  BASE_LAYOUT_ELEMENTS,
  DEFAULT_FORM_CONFIG,
  parseLayoutJson,
  renderElementSettings,
} from 'src/pages/application/dynamic/DynamicForm'
import { useTabs } from 'src/store/tab-context'

const TabPane = Tabs.TabPane

const MODULE_LABEL = '布局管理'

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

export default function LayoutManage() {
  const location = useLocation()
  const { id } = useParams()
  const { addTab, updateTab } = useTabs()

  // 左侧组件库（来自当前流程的表单元素接口）
  const [library, setLibrary] = useState([])
  const [libraryLoading, setLibraryLoading] = useState(false)
  // 流程的主表 / 子表信息（用于组件库分组）
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

  // 加载指定表下的字段列表（表单元素接口，按 table_key 过滤），并缓存
  const loadTableFields = useCallback(
    async (tableKey) => {
      if (!tableKey) return
      setFieldLoadingKeys((prev) => ({ ...prev, [tableKey]: true }))
      try {
        const res = await fetchAll((p) => applicationApi.listApplicationElements(id, { ...p, table_key: tableKey }))
        const list = (res.data?.list || []).filter((f) => !tableKey || f.table_key === tableKey)
        setTableFieldsMap((prev) => ({ ...prev, [tableKey]: list }))
      } catch (e) {
        setTableFieldsMap((prev) => ({ ...prev, [tableKey]: [] }))
      } finally {
        setFieldLoadingKeys((prev) => ({ ...prev, [tableKey]: false }))
      }
    },
    [id],
  )

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

  // 挂载：确保页签存在、获取流程名更新标题、加载已有布局配置
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
  }, [id, location.pathname, addTab, updateTab, loadTableFields])

  // 加载左侧组件库：获取当前流程关联的表单元素并映射为可拖拽项
  useEffect(() => {
    let cancelled = false
    setLibraryLoading(true)
    fetchAll((p) => applicationApi.listApplicationElements(id, p))
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
      // 表格组件：表单页默认可编辑，详情页默认只读
      ...(libItem.element_type === 'table' && { editable: activePage === 'form' }),
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

  // 将表单页布局深拷贝后完整覆盖到详情页：过滤 table 的操作列（action）
  // 布局数据本质为 JSON 序列化结构（保存到后端 form_layout_json），这里用 JSON 深拷贝与后端
  // 序列化口径保持一致；避免 structuredClone 在数据中混入不可序列化值（函数 / Symbol / React 元素）时
  // 抛出 DataCloneError，也能防止克隆破坏元素内部引用导致渲染异常
  const handleSyncLayout = () => {
    setLayouts((prev) => {
      const cloned = JSON.parse(JSON.stringify(prev.form))
      cloned.elements = (cloned.elements || []).map((el) => {
        if (el.element_type === 'table') {
          return {
            ...el,
            columns: Array.isArray(el.columns)
              ? el.columns.filter((c) => c.key !== 'action')
              : el.columns,
          }
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
    // 表格"合计"配置需要主表字段选项：确保主表字段缓存也已加载
    const mainKey = appTables?.tableName
    if (selectedElement?.element_type === 'table' && mainKey && !tableFieldsMap[mainKey]) {
      loadTableFields(mainKey)
    }
  }, [selectedElement, tableFieldsMap, appTables?.tableName, loadTableFields])

  // 选择字段：自动将字段的 label 赋给 title、field_key 赋给 dataIndex
  const handleColumnFieldChange = (colId, tableKey, fieldKey) => {
    if (!tableKey) return
    const fields = tableFieldsMap[tableKey] || []
    const field = fields.find((f) => f.field_key === fieldKey || String(f.id) === fieldKey)
    updateSelectedElementColumns((cols) =>
      cols.map((c) =>
        c.id === colId
          ? {
              ...field,
              ...c,
              dataIndex: field?.field_key || fieldKey,
              title: field?.label || field?.name || fieldKey,
            }
          : c,
      ),
    )
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
    updateSelectedElementColumns,
  }

  return (
    <div className="flex h-full items-stretch border border-gray-200 bg-white">
      {/* ========== 左侧：组件库（按表分组，两列网格） ========== */}
      <div className="flex w-83 shrink-0 flex-col">
        <div className="shrink-0 border-b border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-800">
          组件库
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          {libraryLoading ? (
            <Empty description="加载中..." />
          ) : (
            libraryGroups?.map((group) => (
              <div key={group.title} className="mb-3 last:mb-0">
                <div className="mb-2 text-xs font-medium text-gray-500">{group.title}</div>
                <div className="grid grid-cols-2 gap-2">
                  {group?.items?.map((item) => {
                    // 子表元素禁止直接拖拽（需通过表格组件配置），主表 / 基础分组不受影响
                    const isSubTableItem = appTables.subTables.includes(item.table_key)
                    const dragProps = isSubTableItem
                      ? { draggable: false }
                      : {
                          draggable: true,
                          onDragStart: (e) => {
                            dragType.current = 'new'
                            dragNewItem.current = item
                            e.dataTransfer.setData('text/plain', item.key)
                            e.dataTransfer.effectAllowed = 'copy'
                          },
                          onDragEnd: () => {
                            dragType.current = null
                            dragNewItem.current = null
                            setDragOverIndex(null)
                          },
                        }

                    const itemNode = (
                      <div
                        key={item.key + '_' + item.field_key}
                        {...dragProps}
                        title={item.label}
                        className={`flex items-center justify-center rounded border px-1 py-2 text-center text-xs transition-colors ${
                          isSubTableItem
                            ? 'cursor-not-allowed border-gray-100 bg-gray-50 text-gray-400'
                            : 'cursor-grab border-gray-200 bg-gray-50 text-gray-700 hover:border-[rgb(var(--arcoblue-6))] hover:bg-[rgb(var(--arcoblue-1))]'
                        }`}
                      >
                        <span className="w-full truncate">{item.label}</span>
                      </div>
                    )
                    return isSubTableItem ? (
                      <Tooltip key={item.key + '_' + item.field_key} content="请从表格添加子表项">
                        {itemNode}
                      </Tooltip>
                    ) : (
                      itemNode
                    )
                  })}
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

        {/* 中间画布：渲染逻辑与拖拽/选中/删除交互统一由 DynamicForm（move-* 模式）承载 */}
        <DynamicForm
          app={{ form_layout_json: { formConfig, elements } }}
          pageType={activePage === 'form' ? 'move-form' : 'move-detail'}
          selectedId={selectedId}
          dragOverIndex={dragOverIndex}
          onSelectElement={(el) => {
            setSelectedId(el.id)
            setActivePanel('element')
          }}
          onRemoveElement={removeElement}
          onElementDragStart={(e, el) => {
            dragType.current = 'move'
            dragSourceId.current = el.id
            e.dataTransfer.effectAllowed = 'move'
            e.stopPropagation()
          }}
          onElementDragOver={(e, index) => {
            e.preventDefault()
            e.stopPropagation()
            setDragOverIndex(index)
          }}
          onElementDrop={(e, index) => handleCanvasDrop(e, index)}
          onDragEnd={() => {
            dragType.current = null
            dragSourceId.current = null
            setDragOverIndex(null)
          }}
          onCanvasDragOver={(e) => {
            e.preventDefault()
            e.dataTransfer.dropEffect = dragType.current === 'move' ? 'move' : 'copy'
          }}
          onCanvasDrop={(e) => handleCanvasDrop(e, -1)}
          onCanvasClick={() => {
            setSelectedId(null)
            setActivePanel('form')
          }}
        />
      </div>

      {/* ========== 右侧：属性配置面板（Tabs 作为顶部导航） ========== */}
      <div className="flex w-83 shrink-0 flex-col overflow-hidden">
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

          {/* 元素属性设置：未选中元素时不渲染该 Tab，内容统一由配置中心分发（常规控件通用面板 + 基础组件专属面板） */}
          {selectedElement && (
            <TabPane key="element" title="元素属性">
              <div className="flex flex-col gap-4 py-2">
                {renderElementSettings(selectedElement, settingsCtx)}
              </div>
            </TabPane>
          )}
        </Tabs>
      </div>
    </div>
  )
}
