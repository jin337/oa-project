import {
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
  Spin,
} from '@arco-design/web-react'
import {
  IconAlipayCircle,
  IconCalendar,
  IconDelete,
  IconEdit,
  IconFile,
  IconPlus,
  IconUser,
} from '@arco-design/web-react/icon'
import { useCallback, useEffect, useState } from 'react'
import * as applicationApi from '../../api/application'
import * as approvalApi from '../../api/approval'
import DynamicForm from '../application/DynamicForm'

const FormItem = Form.Item
const Row = Grid.Row
const Col = Grid.Col

// 审核状态映射（列表 / 详情页状态展示复用；0 草稿，1 待审核）
const APPROVAL_STATUS = {
  0: '草稿',
  1: '待审核',
  2: '审核中',
  3: '已通过',
  4: '不通过',
  5: '已驳回',
  6: '已作废',
  7: '已删除',
}

// 申请项图标映射（icon 字段存图标名，未匹配时使用默认图标）
const ICON_MAP = {
  user: <IconUser />,
  money: <IconAlipayCircle />,
  calendar: <IconCalendar />,
  file: <IconFile />,
  edit: <IconEdit />,
}
const getIcon = (icon) => ICON_MAP[(icon || '').toLowerCase()] || <IconFile />

/**
 * 审批申请页：上下按行排列的流式布局——每个分类独占一行（左侧名称与编辑/删除，右侧新增申请项），
 * 分类行下方以网格卡片展示该分类下的申请项。
 * 申请项通过「页面编码（code）」关联 ApplicationManage 中已配置的应用页面，
 * 点击申请项卡片时预请求应用配置，并在 Drawer 中注入动态表单组件进行展示。
 */
export default function Apply() {
  // 分类 & 申请项数据
  const [categories, setCategories] = useState([])
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)

  // 分类弹窗
  const [catModalVisible, setCatModalVisible] = useState(false)
  const [editingCategory, setEditingCategory] = useState(null)
  const [catForm] = Form.useForm()

  // 申请项弹窗
  const [itemModalVisible, setItemModalVisible] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [saving, setSaving] = useState(false)
  const [itemForm] = Form.useForm()

  // 动态表单 Drawer（点击申请项卡片打开）
  const [drawerVisible, setDrawerVisible] = useState(false)
  const [drawerLoading, setDrawerLoading] = useState(false)
  const [drawerApp, setDrawerApp] = useState(null)
  const [drawerSaving, setDrawerSaving] = useState(false)
  const [drawerForm] = Form.useForm()

  // 加载分类列表
  const fetchCategories = useCallback(async () => {
    try {
      const res = await approvalApi.listApprovalCategories({ page: 1, size: 9999 })
      setCategories(res.data?.list || [])
    } catch (e) {
      // 错误已在请求层提示
    }
  }, [])

  // 加载申请项列表
  const fetchItems = useCallback(async () => {
    try {
      const res = await approvalApi.listApprovalItems({ page: 1, size: 9999 })
      setItems(res.data?.list || [])
    } catch (e) {
      // 错误已在请求层提示
    }
  }, [])

  useEffect(() => {
    setLoading(true)
    Promise.all([fetchCategories(), fetchItems()]).finally(() => setLoading(false))
  }, [fetchCategories, fetchItems])

  // ==================== 分类管理 ====================

  const openCreateCategory = () => {
    setEditingCategory(null)
    catForm.resetFields()
    catForm.setFieldsValue({ sort: 0 })
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
    itemForm.setFieldsValue({ category_id: category.id, sort: 0 })
    setItemModalVisible(true)
  }

  const openEditItem = (record) => {
    setEditingItem(record)
    itemForm.setFieldsValue({
      name: record.name,
      code: record.code,
      category_id: record.category_id,
      icon: record.icon || '',
      sort: record.sort ?? 0,
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

  // 点击申请项卡片：预请求关联的应用配置，完成后在 Drawer 中注入动态表单组件
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
    drawerForm.resetFields()
    try {
      const res = await applicationApi.getApplicationByCode(code.trim(), state.trim() || 'form')
      setDrawerApp(res.data)
    } catch (e) {
      Message.error('应用配置加载失败，请稍后重试')
      setDrawerVisible(false)
    } finally {
      setDrawerLoading(false)
    }
  }

  // 校验动态表单并落库为草稿（approval_status 强制为 0），返回保存记录（含 dataId）
  const saveDraftData = async () => {
    if (!drawerApp) return null
    let values
    try {
      values = await drawerForm.validate()
    } catch (e) {
      return null
    }
    const res = await applicationApi.createApplicationData(drawerApp.id, {
      ...values,
      approval_status: 0, // 强制草稿状态
    })
    return res.data
  }

  // 保存草稿：仅落库，状态保持草稿
  const handleSaveDraft = async () => {
    setDrawerSaving(true)
    try {
      const data = await saveDraftData()
      if (!data) return
      Message.success('草稿保存成功')
      setDrawerVisible(false)
    } catch (e) {
      Message.error('草稿保存失败，请稍后重试')
    } finally {
      setDrawerSaving(false)
    }
  }

  // 提交审核：先落库草稿，再调用审核状态变更接口流转为「待审核」
  const handleSubmitApproval = async () => {
    setDrawerSaving(true)
    try {
      const data = await saveDraftData()
      if (!data) return
      const dataId = data.id ?? data.dataId
      if (!dataId) {
        Message.warning('数据已保存，但未能获取数据 ID，审核状态未流转')
        setDrawerVisible(false)
        return
      }
      await applicationApi.updateApplicationDataApproval(drawerApp.id, dataId, 1)
      Message.success('提交成功，等待审核')
      setDrawerVisible(false)
    } catch (e) {
      Message.error('提交审核失败，请稍后重试')
    } finally {
      setDrawerSaving(false)
    }
  }

  return (
    <Card
      title="审批申请"
      extra={
        <Button type="primary" icon={<IconPlus />} onClick={openCreateCategory}>
          新增分类
        </Button>
      }
    >
      {/* 分类流式区块：每个分类独占一行，行下展示该分类的申请项网格 */}
      {categories.length ? (
        <div className="space-y-4">
          {categories.map((c) => {
            const catItems = items.filter((it) => it.category_id === c.id)
            return (
              <div key={c.id}>
                {/* 分类行：左侧名称 + 编辑/删除图标，右侧新增申请项按钮 */}
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <span className="text-base font-medium">{c.name}</span>
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
                  </div>
                  <Button
                    size="small"
                    type="secondary"
                    icon={<IconPlus />}
                    onClick={() => openCreateItem(c)}
                  >
                    新增申请项
                  </Button>
                </div>

                {/* 申请项网格卡片 */}
                {catItems.length ? (
                  <Row gutter={[16, 16]}>
                    {catItems.map((item) => (
                      <Col span={4} key={item.id}>
                        <Card
                          hoverable
                          className="group relative cursor-pointer"
                          bodyStyle={{ padding: '10px' }}
                          onClick={() => handleItemClick(item)}
                        >
                          {/* 卡片右上角操作区：编辑 / 删除（hover 显示） */}
                          <div
                            className="absolute top-2 right-2 z-10 hidden items-center group-hover:flex"
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
                          <div className="flex items-center gap-3">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-lg text-blue-600">
                              {getIcon(item.icon)}
                            </div>
                            <div className="min-w-0 font-medium">{item.name}</div>
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
            <InputNumber style={{ width: '100%' }} min={0} placeholder="数字越小越靠前" />
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
      >
        <Form form={itemForm} layout="vertical" autoComplete="off">
          <FormItem
            label="申请项名称"
            field="name"
            rules={[{ required: true, message: '请输入申请项名称' }]}
          >
            <Input placeholder="如：加班申请、差旅费报销" maxLength={30} showWordLimit />
          </FormItem>
          <Row gutter={16}>
            <Col span={12}>
              <FormItem
                label="页面编码"
                field="code"
                rules={[{ required: true, message: '请输入关联的应用页面编码' }]}
              >
                <Input placeholder="关联应用编码" />
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
                <Input placeholder="如：user / money / calendar" />
              </FormItem>
            </Col>
            <Col span={12}>
              <FormItem
                label="排序"
                field="sort"
                rules={[{ required: true, message: '请输入排序值' }]}
              >
                <InputNumber style={{ width: '100%' }} min={0} placeholder="数字越小越靠前" />
              </FormItem>
            </Col>
          </Row>
        </Form>
      </Modal>

      {/* 动态表单 Drawer：点击申请项卡片后加载应用配置并注入动态表单组件 */}
      <Drawer
        width="50%"
        visible={drawerVisible}
        onCancel={() => setDrawerVisible(false)}
        title={drawerApp?.name || '申请表单'}
        unmountOnExit
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
          <DynamicForm app={drawerApp} form={drawerForm} pageType="form" />
        ) : null}
      </Drawer>
    </Card>
  )
}
