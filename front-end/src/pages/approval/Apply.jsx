import {
  AutoComplete,
  Button,
  Card,
  Drawer,
  Empty,
  Form,
  Grid,
  Input,
  InputNumber,
  Message,
  Modal,
  Popconfirm,
  Select,
  Space,
  Spin,
} from '@arco-design/web-react'
import {
  IconDelete,
  IconDoubleLeft,
  IconDoubleRight,
  IconEdit,
  IconPlus,
  IconSettings,
} from '@arco-design/web-react/icon'
import { useCallback, useEffect, useState } from 'react'
import * as applicationApi from 'src/api/application'
import * as approvalApi from 'src/api/approval'
import { fetchAll } from 'src/api/fetchAll'
import DynamicFlowView from 'src/pages/application/dynamic/DynamicFlowView.jsx'
import DynamicForm, {
  parseLayoutJson,
  runOnSubmitAfter,
  runOnSubmitBefore,
  serializeTimeFields,
} from 'src/pages/application/dynamic/DynamicForm'
import { buildSelfSelectUserIDs } from 'src/pages/application/examine/flowModel'

import IconSelect, { MenuIcon } from 'src/components/icon-select'
import { usePermission } from 'src/hooks/usePermission'

const FormItem = Form.Item
const Row = Grid.Row
const Col = Grid.Col

/**
 * 方案1（校验错误归因）：表单校验失败时，若失败字段是由其他字段的 set_value 联动生成的
 * （如可见的「项目」on_change 直接赋值 → 隐藏必填的「项目 id」），该字段的必填错误提示
 * 渲染在隐藏字段上看不见，导致用户"必填都填了却提交不了"。
 * 这里构建 target → 触发字段 的映射，把提示追加到可见的触发字段上，引导用户先操作触发字段。
 */
function remapLinkedFieldErrors(errors, form, app) {
  if (!errors || typeof errors !== 'object' || !form || !app) return
  const layout = parseLayoutJson(app?.form_layout_json)
  const elements = layout?.elements || []
  if (!elements.length) return
  // target 字段 → { 触发字段 key / label }；同时收集字段 label 便于文案
  const targetToSource = {}
  const fieldLabels = {}
  elements.forEach((el) => {
    if (el.field_key) fieldLabels[el.field_key] = el.label || el.field_key
    const actions = el.actions || {}
    Object.values(actions).forEach((list) => {
      if (!Array.isArray(list)) return
      list.forEach((a) => {
        if (a?.action_type !== 'set_value' || !Array.isArray(a.value) || !el.field_key) return
        a.value.forEach((m) => {
          if (m?.target) {
            targetToSource[m.target] = {
              sourceField: el.field_key,
              sourceLabel: el.label || el.field_key,
            }
          }
        })
      })
    })
  })
  const setObj = {}
  Object.keys(errors).forEach((field) => {
    const src = targetToSource[field]
    if (!src) return
    const targetLabel = fieldLabels[field] || field
    const msg = `请先选择「${src.sourceLabel}」：必填项「${targetLabel}」由「${src.sourceLabel}」联动生成`
    // Arco FormItem 渲染错误时对错误项取 .message，且 store 按「单错误对象」结构消费
    // （validate 原生错误为 { field: errObj }）；数组会导致 Object.values 后 item.message 为空
    const prev = setObj[src.sourceField]?.error?.message
    setObj[src.sourceField] = {
      error: { message: prev ? `${prev}；${msg}` : msg },
    }
  })
  if (Object.keys(setObj).length) {
    form.setFields(setObj)
  }
}

/**
 * 审批申请页：上下按行排列的流式布局——每个分类独占一行（左侧名称与编辑/删除，右侧新增申请项），
 * 分类行下方以网格卡片展示该分类下的申请项。
 * 申请项通过「页面编码（code）」关联 ApplicationManage 中已配置的流程页面，
 * 点击申请项卡片时预请求流程配置，并在 Drawer 中注入动态表单组件进行展示。
 *
 * 管理模式：头部「管理」按钮（受 approval:edit 权限控制）切换 isManaging，
 * 进入管理模式后展示「新增分类」/「新增申请项」/分类与申请项的编辑删除操作，退出后隐藏。
 */
export default function Apply() {
  const { hasPerm } = usePermission()
  // 分类 & 申请项数据
  const [categories, setCategories] = useState([])
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  // 管理模式开关：true 时展示分类/申请项的管理操作按钮
  const [isManaging, setIsManaging] = useState(false)

  // 分类弹窗
  const [catModalVisible, setCatModalVisible] = useState(false)
  const [editingCategory, setEditingCategory] = useState(null)
  const [catForm] = Form.useForm()

  // 申请项弹窗
  const [itemModalVisible, setItemModalVisible] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [saving, setSaving] = useState(false)
  const [itemForm] = Form.useForm()
  // 流程配置列表：新增/编辑申请项时，申请项名称改为从此列表选择，
  // 选中后自动填充申请项名称与流程编码
  const [appOptions, setAppOptions] = useState([])

  // 动态表单 Drawer（点击申请项卡片打开）
  const [drawerVisible, setDrawerVisible] = useState(false)
  const [drawerLoading, setDrawerLoading] = useState(false)
  const [drawerApp, setDrawerApp] = useState(null)
  const [drawerTitle, setDrawerTitle] = useState('')
  const [drawerSaving, setDrawerSaving] = useState(false)
  const [drawerForm] = Form.useForm()
  // 抽屉内动态表单实时值（供审批流程条件分支命中评估使用）
  const [formValues, setFormValues] = useState({})
  // 发起人自选审批人（nodeId -> [{ type, key, label }]），提交时转为 nodeId -> [userId] 传给后端
  const [selfSelectMembers, setSelfSelectMembers] = useState({})
  // 自选审批人/抄送人节点是否已全部选择（DynamicFlowView 上报，未选齐时禁止提交）
  const [selfSelectReady, setSelfSelectReady] = useState(true)
  const [flowCollapsed, setFlowCollapsed] = useState(false)

  // 加载分类列表
  const fetchCategories = useCallback(async () => {
    try {
      const res = await fetchAll(approvalApi.listApprovalCategories)
      setCategories(res.data?.list || [])
    } catch (e) {
      // 错误已在请求层提示
    }
  }, [])

  // 加载申请项列表
  const fetchItems = useCallback(async () => {
    try {
      const res = await fetchAll(approvalApi.listApprovalItems)
      setItems(res.data?.list || [])
    } catch (e) {
      // 错误已在请求层提示
    }
  }, [])

  // 加载流程配置列表（申请项名称的可选项）
  const fetchApplications = useCallback(async () => {
    try {
      // 通过接口参数只取启用的流程配置，停用的不可申请
      const res = await fetchAll(applicationApi.listApplications, { status: 1 })
      setAppOptions(res.data?.list || [])
    } catch (e) {
      // 错误已在请求层提示
    }
  }, [])

  useEffect(() => {
    setLoading(true)
    Promise.all([fetchCategories(), fetchItems(), fetchApplications()]).finally(() =>
      setLoading(false),
    )
  }, [fetchCategories, fetchItems, fetchApplications])

  // ==================== 分类管理 ====================

  const openCreateCategory = () => {
    setEditingCategory(null)
    catForm.resetFields()
    catForm.setFieldsValue({ sort: 1 })
    setCatModalVisible(true)
  }

  const openEditCategory = (record) => {
    setEditingCategory(record)
    catForm.setFieldsValue({ name: record.name, sort: record.sort })
    setCatModalVisible(true)
  }

  const handleCategorySave = async () => {
    const values = await catForm.validate()
    setSaving(true)
    try {
      if (editingCategory) {
        await approvalApi.updateApprovalCategory(editingCategory.id, values)
      } else {
        await approvalApi.createApprovalCategory(values)
      }
      Message.success('分类保存成功')
      setCatModalVisible(false)
      fetchCategories()
    } catch (e) {
      // 错误已在请求层提示
    } finally {
      setSaving(false)
    }
  }

  // 删除分类前检查是否仍有申请项
  const handleCategoryDelete = async (record) => {
    if (items.some((it) => it.category_id === record.id)) {
      Message.warning('该分类下存在申请项，请先删除申请项')
      return
    }
    try {
      await approvalApi.deleteApprovalCategory(record.id)
      Message.success('分类删除成功')
      fetchCategories()
    } catch (e) {
      // 错误已在请求层提示
    }
  }

  // ==================== 申请项管理 ====================

  // 新增申请项：默认归属传入的分类
  const openCreateItem = (category) => {
    setEditingItem(null)
    itemForm.resetFields()
    itemForm.setFieldsValue({ category_id: category.id, sort: 1 })
    setItemModalVisible(true)
  }

  const openEditItem = (record) => {
    setEditingItem(record)
    itemForm.setFieldsValue({
      name: record.name,
      code: record.code,
      category_id: record.category_id,
      icon: record.icon || '',
      sort: record.sort ?? 1,
    })
    setItemModalVisible(true)
  }

  const handleItemSave = async () => {
    const values = await itemForm.validate()
    setSaving(true)
    try {
      if (editingItem) {
        await approvalApi.updateApprovalItem(editingItem.id, values)
      } else {
        await approvalApi.createApprovalItem(values)
      }
      Message.success('申请项保存成功')
      setItemModalVisible(false)
      fetchItems()
    } catch (e) {
      // 错误已在请求层提示
    } finally {
      setSaving(false)
    }
  }

  const handleItemDelete = async (record) => {
    try {
      await approvalApi.deleteApprovalItem(record.id)
      Message.success('申请项删除成功')
      fetchItems()
    } catch (e) {
      // 错误已在请求层提示
    }
  }

  // 点击申请项卡片：预请求关联的流程配置，完成后在 Drawer 中注入动态表单组件
  const handleItemClick = async (record) => {
    const raw = (record.code || '').trim()
    if (!raw) {
      Message.warning('该申请项未关联页面编码，请先编辑配置')
      return
    }
    // 兼容 "页面编码:页面状态"（如 app_1788413612:form）与旧格式（纯页面编码）：
    // 无 ":" 或 state 为空时降级为 form；多余冒号只取前两段
    const [code = '', state = 'form'] = raw.split(':')
    if (!code.trim()) {
      Message.warning('该申请项页面编码格式无效，请先编辑配置')
      return
    }
    setDrawerVisible(true)
    setDrawerLoading(true)
    setDrawerApp(null)
    setDrawerTitle(record.name || '申请表单')
    drawerForm.resetFields()
    try {
      const res = await applicationApi.getApplicationByCode(code.trim(), state.trim() || 'form')
      setDrawerApp(res.data)
    } catch (e) {
      Message.error('流程配置加载失败，请稍后重试')
      setDrawerVisible(false)
    } finally {
      setDrawerLoading(false)
    }
  }

  // 校验动态表单并返回序列化后的 payload（不再单独创建业务数据，由后端审批接口一步完成）
  const validateAndBuildPayload = async () => {
    if (!drawerApp) return null
    let values
    try {
      values = await drawerForm.validate()
    } catch (e) {
      // 方案1：set_value 联动目标字段（如隐藏的必填「项目 id」）校验失败时，
      // 错误提示在隐藏字段上看不见，这里把提示归因到触发它的可见字段（如「项目」）
      // 注意：Arco validate reject 的是 ValidateError，字段错误对象在其 .errors 上
      remapLinkedFieldErrors(e?.errors || e, drawerForm, drawerApp)
      return null
    }
    // 时间字段（date/datetime/time 等）统一序列化为 MySQL 兼容格式
    // （YYYY-MM-DD / YYYY-MM-DD HH:mm:ss / HH:mm:ss），避免前端 ISO 8601
    // （如 2026-09-14T00:00:00+08:00）导致 MySQL Error 1292 更新失败
    const layout = parseLayoutJson(drawerApp?.form_layout_json)
    const result = serializeTimeFields(values, layout?.elements || [])
    // 清理子表空行：过滤掉所有值都为空的行（避免提交 [{}]）
    Object.keys(result).forEach((key) => {
      const val = result[key]
      if (Array.isArray(val)) {
        result[key] = val.filter((row) => {
          if (!row || typeof row !== 'object') return false
          // 判断是否所有字段都为空
          return Object.values(row).some((v) => v !== '' && v !== null && v !== undefined)
        })
      }
    })
    return result
  }

  // 保存草稿：校验表单 + 一次调用保存审批草稿实例（后端自动创建业务数据）
  const handleSaveDraft = async () => {
    setDrawerSaving(true)
    try {
      const payload = await validateAndBuildPayload()
      if (!payload) return
      const selfSelectUserIDs = buildSelfSelectUserIDs(selfSelectMembers)
      await approvalApi.saveDraftInstance({
        app_id: drawerApp.id,
        business_data: payload,
        approval_draft_members: Object.keys(selfSelectUserIDs).length
          ? selfSelectUserIDs
          : undefined,
      })
      Message.success('草稿保存成功')
      setDrawerVisible(false)
    } catch (e) {
      Message.error('草稿保存失败，请稍后重试')
    } finally {
      setDrawerSaving(false)
    }
  }

  // 提交审核：校验表单 + 自选必填 + 一次调用发起审批（后端自动创建业务数据）
  const handleSubmitApproval = async () => {
    if (!selfSelectReady) {
      Message.error('请先为自选的审批人/抄送人节点选择人员后再提交')
      return
    }
    setDrawerSaving(true)
    try {
      const payload = await validateAndBuildPayload()
      if (!payload) return
      // 提交前事件：return false 阻止提交
      const layout = parseLayoutJson(drawerApp?.form_layout_json)
      const formConfig = layout?.formConfig || {}
      const ok = await runOnSubmitBefore(formConfig, payload)
      if (!ok) {
        Message.info('表单提交前事件已拦截本次提交')
        return
      }
      const selfSelectUserIDs = buildSelfSelectUserIDs(selfSelectMembers)
      const res = await approvalApi.createApprovalInstance({
        app_id: drawerApp.id,
        business_data: payload,
        approval_draft_members: Object.keys(selfSelectUserIDs).length
          ? selfSelectUserIDs
          : undefined,
      })
      // 提交成功后事件
      await runOnSubmitAfter(formConfig, payload, res?.data)
      Message.success('提交成功')
      setDrawerVisible(false)
      setSelfSelectMembers({})
    } catch (e) {
      Message.error('提交审核失败，请稍后重试')
    } finally {
      setDrawerSaving(false)
    }
  }

  return (
    <Card
      className="h-full"
      title="审批申请"
      extra={
        hasPerm('approval:edit') && (
          <Space>
            {/* 管理模式开关：进入后展示管理操作，退出后恢复普通浏览 */}
            <Button
              type={isManaging ? 'primary' : 'default'}
              icon={<IconSettings />}
              onClick={() => setIsManaging((v) => !v)}
            >
              {isManaging ? '完成管理' : '管理'}
            </Button>
            {isManaging && (
              <Button type="primary" icon={<IconPlus />} onClick={openCreateCategory}>
                新增分类
              </Button>
            )}
          </Space>
        )
      }
    >
      {/* 分类流式区块：每个分类独占一行，行下展示该分类的申请项网格 */}
      {categories.length ? (
        <div className="space-y-4">
          {categories.map((c) => {
            const catItems = items.filter((it) => it.category_id === c.id)
            // 没有管理权限时，如果分类下无申请项，就隐藏这个分类
            if (!hasPerm('approval:edit') && catItems.length === 0) {
              return null
            }
            return (
              <div key={c.id}>
                {/* 分类行：左侧名称 + 编辑/删除图标，右侧新增申请项按钮（管理模式展示） */}
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <span className="text-base font-medium">{c.name}</span>
                    {isManaging && hasPerm('approval:edit') && (
                      <>
                        <Button
                          size="mini"
                          type="text"
                          icon={<IconEdit />}
                          onClick={() => openEditCategory(c)}
                        />
                        <Popconfirm
                          title="确定删除该分类吗？"
                          onOk={() => handleCategoryDelete(c)}
                          position="bl"
                        >
                          <Button size="mini" type="text" status="danger" icon={<IconDelete />} />
                        </Popconfirm>
                      </>
                    )}
                  </div>
                  {isManaging && hasPerm('approval:edit') && (
                    <Button
                      size="small"
                      type="secondary"
                      icon={<IconPlus />}
                      onClick={() => openCreateItem(c)}
                    >
                      新增申请项
                    </Button>
                  )}
                </div>

                {/* 申请项网格卡片 */}
                {catItems.length ? (
                  <Row gutter={[16, 16]}>
                    {catItems.map((item) => (
                      <Col span={4} key={item.id}>
                        <Card
                          hoverable
                          className="group cursor-pointer"
                          bodyStyle={{ padding: '10px' }}
                          onClick={() => handleItemClick(item)}
                        >
                          {/* 卡片内容行：左侧图标+名称，右侧编辑/删除，同一行垂直居中对齐 */}
                          <div className="flex items-center justify-between gap-1">
                            <div className="flex min-w-0 items-center gap-3">
                              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-lg text-blue-600">
                                <MenuIcon name={item.icon} />
                              </div>
                              <div className="min-w-0 truncate font-medium" title={item.name}>
                                {item.name}
                              </div>
                            </div>
                            {isManaging && hasPerm('approval:edit') && (
                              <div
                                className="flex shrink-0 items-center"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Button
                                  size="mini"
                                  type="text"
                                  icon={<IconEdit />}
                                  onClick={() => openEditItem(item)}
                                />
                                <Popconfirm
                                  title="确定删除该申请项吗？"
                                  onOk={() => handleItemDelete(item)}
                                  position="br"
                                >
                                  <Button
                                    size="mini"
                                    type="text"
                                    status="danger"
                                    icon={<IconDelete />}
                                  />
                                </Popconfirm>
                              </div>
                            )}
                          </div>
                        </Card>
                      </Col>
                    ))}
                  </Row>
                ) : (
                  <Empty description="该分类下暂无申请项" className="py-4" />
                )}
              </div>
            )
          })}
        </div>
      ) : (
        <Empty description={loading ? '加载中...' : '暂无分类，请先新增'} className="py-10" />
      )}

      {/* 分类新增/编辑弹窗 */}
      <Modal
        title={editingCategory ? '编辑分类' : '新增分类'}
        visible={catModalVisible}
        onOk={handleCategorySave}
        confirmLoading={saving}
        onCancel={() => setCatModalVisible(false)}
        unmountOnExit
      >
        <Form form={catForm} layout="vertical" autoComplete="off">
          <FormItem
            label="分类名称"
            field="name"
            rules={[{ required: true, message: '请输入分类名称' }]}
          >
            <Input placeholder="如：人事类、财务类、行政类" maxLength={20} showWordLimit />
          </FormItem>
          <FormItem label="排序" field="sort" rules={[{ required: true, message: '请输入排序值' }]}>
            <InputNumber style={{ width: '100%' }} min={1} placeholder="数字越小越靠前" />
          </FormItem>
        </Form>
      </Modal>

      {/* 申请项新增/编辑弹窗 */}
      <Modal
        title={editingItem ? '编辑申请项' : '新增申请项'}
        visible={itemModalVisible}
        onOk={handleItemSave}
        confirmLoading={saving}
        onCancel={() => setItemModalVisible(false)}
        unmountOnExit
        autoFocus={false}
        focusLock={false}
      >
        <Form form={itemForm} layout="vertical" autoComplete="off">
          {/* 申请项名称：可从流程配置列表下拉选取（自动带出名称与流程编码），也可直接手动输入自定义名称 */}
          <FormItem
            label="申请项名称"
            field="name"
            rules={[{ required: true, message: '请选择或输入申请项名称' }]}
          >
            <AutoComplete
              placeholder="请选择或输入申请项名称"
              data={appOptions.map((a) => a.name)}
              onChange={(value) => {
                // 命中流程配置时同步带出流程编码；手动输入的自定义名称不改动编码
                const target = appOptions.find((a) => a.name === value)
                if (target) {
                  itemForm.setFieldsValue({ name: target.name, code: target.code })
                }
              }}
            />
          </FormItem>
          <Row gutter={16}>
            <Col span={12}>
              <FormItem
                label="流程编码"
                field="code"
                rules={[{ required: true, message: '请输入关联的流程编码' }]}
              >
                <Input placeholder="关联流程编码" />
              </FormItem>
            </Col>
            <Col span={12}>
              <FormItem
                label="所属分类"
                field="category_id"
                rules={[{ required: true, message: '请选择所属分类' }]}
              >
                <Select
                  placeholder="请选择分类"
                  options={categories.map((c) => ({ label: c.name, value: c.id }))}
                />
              </FormItem>
            </Col>
            <Col span={12}>
              <FormItem label="图标" field="icon">
                <IconSelect placeholder="点击选择图标" />
              </FormItem>
            </Col>
            <Col span={12}>
              <FormItem
                label="排序"
                field="sort"
                rules={[{ required: true, message: '请输入排序值' }]}
              >
                <InputNumber style={{ width: '100%' }} min={1} placeholder="数字越小越靠前" />
              </FormItem>
            </Col>
          </Row>
        </Form>
      </Modal>

      {/* 动态表单 Drawer：点击申请项卡片后加载流程配置并注入动态表单组件 */}
      <Drawer
        className="[&_.arco-drawer-content]:p-0!"
        width="80%"
        visible={drawerVisible}
        onCancel={() => setDrawerVisible(false)}
        title={drawerTitle || '申请表单'}
        unmountOnExit
        maskClosable={false}
        footer={
          <div className="flex justify-end gap-2">
            <Button loading={drawerSaving} onClick={handleSaveDraft}>
              保存草稿
            </Button>
            <Button type="primary" loading={drawerSaving} onClick={handleSubmitApproval}>
              提交审核
            </Button>
          </div>
        }
      >
        {drawerLoading ? (
          <div className="flex h-40 items-center justify-center">
            <Spin />
          </div>
        ) : drawerApp ? (
          <div className="relative flex h-full flex-nowrap items-start">
            <div className={`absolute top-3 right-0 z-10`}>
              <Button
                size="mini"
                type="primary"
                status="success"
                icon={flowCollapsed ? <IconDoubleLeft /> : <IconDoubleRight />}
                onClick={() => setFlowCollapsed((v) => !v)}
              />
            </div>
            <div
              className={`max-h-full flex-1 overflow-y-auto ${flowCollapsed ? 'pl-4 pr-8' : 'px-4'} py-3`}
            >
              <div className="min-w-188">
                <DynamicForm
                  app={drawerApp}
                  form={drawerForm}
                  pageType="form"
                  onValuesChange={setFormValues}
                />
              </div>
            </div>
            <div
              className={`h-full shrink-0 overflow-y-auto border-l border-(--color-neutral-3) px-4 py-3 transition-all ${flowCollapsed ? 'm-0! w-0 border-l-0 p-0!' : 'w-100'}`}
            >
              {!flowCollapsed && (
                <DynamicFlowView
                  raw={drawerApp?.approval_flow_json}
                  formData={formValues}
                  onMembersChange={(nodeId, members) => {
                    setSelfSelectMembers((prev) => ({ ...prev, [nodeId]: members }))
                  }}
                  onReadyStateChange={setSelfSelectReady}
                />
              )}
            </div>
          </div>
        ) : null}
      </Drawer>
    </Card>
  )
}
