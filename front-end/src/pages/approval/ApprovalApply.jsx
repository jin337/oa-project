import {
  Button,
  Card,
  Empty,
  Form,
  Grid,
  Input,
  InputNumber,
  Message,
  Modal,
  Popconfirm,
  Select,
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
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as approvalApi from '../../api/approval'

const FormItem = Form.Item
const Row = Grid.Row
const Col = Grid.Col

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
 * 审批申请页：左侧分类管理 + 右侧申请项卡片。
 * 申请项通过「页面编码（code）」关联 ApplicationManage 中已配置的应用页面，
 * 点击申请项卡片跳转到对应的动态表单页面（/application/render/:code）。
 */
export default function ApprovalApply() {
  const navigate = useNavigate()

  // 分类 & 申请项数据
  const [categories, setCategories] = useState([])
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  // 当前选中的分类（默认选中第一个）
  const [activeCategoryId, setActiveCategoryId] = useState(null)

  // 分类弹窗
  const [catModalVisible, setCatModalVisible] = useState(false)
  const [editingCategory, setEditingCategory] = useState(null)
  const [catForm] = Form.useForm()

  // 申请项弹窗
  const [itemModalVisible, setItemModalVisible] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [saving, setSaving] = useState(false)
  const [itemForm] = Form.useForm()

  // 当前选中的分类对象
  const activeCategory = useMemo(
    () => categories.find((c) => c.id === activeCategoryId) || null,
    [categories, activeCategoryId],
  )

  // 当前分类下的申请项
  const activeItems = useMemo(
    () => items.filter((it) => it.category_id === activeCategoryId),
    [items, activeCategoryId],
  )

  // 加载分类列表（选中项失效时回退到第一个）
  const fetchCategories = useCallback(async () => {
    try {
      const res = await approvalApi.listApprovalCategories({ page: 1, size: 9999 })
      const list = res.data?.list || []
      setCategories(list)
      setActiveCategoryId((prev) =>
        prev && list.some((c) => c.id === prev) ? prev : (list[0]?.id ?? null),
      )
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
      if (activeCategoryId === record.id) setActiveCategoryId(null)
      fetchCategories()
    } catch (e) {
      // 错误已在请求层提示
    }
  }

  // ==================== 申请项管理 ====================

  const openCreateItem = () => {
    if (!activeCategoryId) {
      Message.warning('请先创建并选择分类')
      return
    }
    setEditingItem(null)
    itemForm.resetFields()
    itemForm.setFieldsValue({ category_id: activeCategoryId, sort: 0 })
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
      description: record.description || '',
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

  // 点击申请项卡片：按关联的页面编码跳转到动态表单页面
  const handleItemClick = (record) => {
    const code = (record.code || '').trim()
    if (!code) {
      Message.warning('该申请项未关联页面编码，请先编辑配置')
      return
    }
    navigate(`/application/render/${code}`)
  }

  return (
    <Card title="审批申请">
      <div className="flex gap-4">
        {/* 左侧：分类管理 */}
        <div className="w-64 shrink-0">
          <div className="mb-3 flex items-center justify-between">
            <span className="font-medium">分类管理</span>
            <Button size="mini" type="primary" icon={<IconPlus />} onClick={openCreateCategory}>
              新增分类
            </Button>
          </div>
          <div className="space-y-2">
            {categories.map((c) => (
              <div
                key={c.id}
                className={`group flex cursor-pointer items-center justify-between rounded border px-3 py-2 transition-colors ${
                  activeCategoryId === c.id
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
                onClick={() => setActiveCategoryId(c.id)}
              >
                <span className="text-sm">{c.name}</span>
                <span className="hidden items-center group-hover:flex">
                  <Button
                    size="mini"
                    type="text"
                    icon={<IconEdit />}
                    onClick={(e) => {
                      e.stopPropagation()
                      openEditCategory(c)
                    }}
                  />
                  <Popconfirm
                    content="确定删除该分类吗？"
                    onOk={() => handleCategoryDelete(c)}
                    position="br"
                  >
                    <Button
                      size="mini"
                      type="text"
                      status="danger"
                      icon={<IconDelete />}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </Popconfirm>
                </span>
              </div>
            ))}
            {!categories.length && (
              <Empty description="暂无分类，请先新增" className="py-6" />
            )}
          </div>
        </div>

        {/* 右侧：申请项管理 */}
        <div className="min-w-0 flex-1">
          <div className="mb-3 flex items-center justify-between">
            <span className="font-medium">
              申请项管理{activeCategory ? `（${activeCategory.name}）` : ''}
            </span>
            <Button type="primary" icon={<IconPlus />} onClick={openCreateItem}>
              新增申请项
            </Button>
          </div>

          {activeItems.length ? (
            <Row gutter={[16, 16]}>
              {activeItems.map((item) => (
                <Col span={8} key={item.id}>
                  <Card hoverable className="cursor-pointer" onClick={() => handleItemClick(item)}>
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-lg text-blue-600">
                        {getIcon(item.icon)}
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium">{item.name}</div>
                        <div className="mt-1 line-clamp-2 text-xs text-gray-500">
                          {item.description || '暂无描述'}
                        </div>
                        <div className="mt-2 text-xs text-gray-400">
                          编码：{item.code || '-'}
                        </div>
                      </div>
                    </div>
                  </Card>
                </Col>
              ))}
            </Row>
          ) : (
            <Empty description={loading ? '加载中...' : '该分类下暂无申请项，点击右上角新增'} />
          )}
        </div>
      </div>

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
          <FormItem
            label="排序"
            field="sort"
            rules={[{ required: true, message: '请输入排序值' }]}
          >
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
          <FormItem
            label="页面编码（code）"
            field="code"
            rules={[{ required: true, message: '请输入关联的应用页面编码' }]}
          >
            <Input placeholder="关联 ApplicationManage 中配置的应用页面编码" />
          </FormItem>
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
          <Row gutter={16}>
            <Col span={12}>
              <FormItem label="图标（可选）" field="icon">
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
          <FormItem label="描述（可选）" field="description">
            <Input.TextArea
              placeholder="申请项说明，如：适用于月度加班时长登记"
              autoSize={{ minRows: 2, maxRows: 4 }}
            />
          </FormItem>
        </Form>
      </Modal>
    </Card>
  )
}
