import {
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Message,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  TreeSelect,
} from '@arco-design/web-react'
import { IconPlus, IconRefresh } from '@arco-design/web-react/icon'
import { useCallback, useEffect, useState } from 'react'
import * as deptApi from '../../api/dept'

const FormItem = Form.Item

function toTreeData(depts, excludeId) {
  return (depts || [])
    .filter((d) => d.id !== excludeId)
    .map((d) => ({
      key: String(d.id),
      title: d.name,
      value: d.id,
      children: d.children ? toTreeData(d.children, excludeId) : undefined,
    }))
}

const EMPTY_FORM = {
  parent_id: 0,
  name: '',
  leader: '',
  sort: 0,
  status: 1,
}

export default function DeptManage() {
  const [tree, setTree] = useState([])
  const [loading, setLoading] = useState(false)
  const [modalVisible, setModalVisible] = useState(false)
  const [editing, setEditing] = useState(null)
  const [saving, setSaving] = useState(false)
  const [form] = Form.useForm()

  const fetchTree = useCallback(async () => {
    setLoading(true)
    try {
      const res = await deptApi.getDeptTree()
      setTree(res.data || [])
    } catch (e) {
      // 错误已在请求层提示
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchTree()
  }, [fetchTree])

  const openCreate = (parent = null) => {
    setEditing(null)
    form.setFieldsValue({ ...EMPTY_FORM, parent_id: parent ? parent.id : 0 })
    setModalVisible(true)
  }

  const openEdit = (record) => {
    setEditing(record)
    form.setFieldsValue({
      parent_id: record.parent_id,
      name: record.name,
      leader: record.leader,
      sort: record.sort,
      status: record.status,
    })
    setModalVisible(true)
  }

  const handleSave = async () => {
    const values = await form.validate()
    setSaving(true)
    try {
      const payload = { ...values, parent_id: values.parent_id || 0 }
      if (editing) {
        await deptApi.updateDept(editing.id, payload)
        Message.success('保存成功')
      } else {
        await deptApi.createDept(payload)
        Message.success('创建成功')
      }
      setModalVisible(false)
      fetchTree()
    } catch (e) {
      // 错误已在请求层提示
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (record) => {
    try {
      await deptApi.deleteDept(record.id)
      Message.success('删除成功')
      fetchTree()
    } catch (e) {
      // 错误已在请求层提示
    }
  }

  const columns = [
    { title: '部门名称', dataIndex: 'name', width: 240 },
    { title: '负责人', dataIndex: 'leader', render: (v) => v || '-' },
    { title: '排序', dataIndex: 'sort', width: 80 },
    {
      title: '状态',
      dataIndex: 'status',
      width: 80,
      render: (status) =>
        status === 1 ? <Tag color="green">启用</Tag> : <Tag color="red">停用</Tag>,
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      render: (v) => v?.slice(0, 19).replace('T', ' ') || '-',
    },
    {
      title: '操作',
      width: 250,
      render: (_, record) => (
        <Space wrap>
          <Button size="mini" onClick={() => openCreate(record)}>
            新增子部门
          </Button>
          <Button size="mini" onClick={() => openEdit(record)}>
            编辑
          </Button>
          <Popconfirm focusLock title="确认删除该部门？" onOk={() => handleDelete(record)}>
            <Button size="mini" status="danger">
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <Card title="部门管理">
      <div className="flex justify-between mb-4">
        <Button icon={<IconRefresh />} onClick={fetchTree}>
          刷新
        </Button>
        <Button type="primary" icon={<IconPlus />} onClick={() => openCreate()}>
          新增部门
        </Button>
      </div>
      <Table
        rowKey="id"
        columns={columns}
        data={tree}
        loading={loading}
        pagination={false}
        defaultExpandAllRows
      />
      <Modal
        title={editing ? '编辑部门' : '新增部门'}
        visible={modalVisible}
        onOk={handleSave}
        confirmLoading={saving}
        onCancel={() => setModalVisible(false)}
        unmountOnExit
        className="w-120! max-w-[90vw]"
      >
        <Form form={form} layout="vertical" autoComplete="off">
          <FormItem label="上级部门" field="parent_id" triggerPropName="value">
            <TreeSelect
              placeholder="不选则为顶级部门"
              allowClear
              treeData={toTreeData(tree, editing?.id)}
            />
          </FormItem>
          <FormItem
            label="部门名称"
            field="name"
            rules={[{ required: true, message: '请输入部门名称' }]}
          >
            <Input placeholder="请输入部门名称" />
          </FormItem>
          <FormItem label="负责人" field="leader">
            <Input placeholder="选填" />
          </FormItem>
          <FormItem label="排序" field="sort" triggerPropName="value">
            <InputNumber min={0} placeholder="数字越小越靠前" />
          </FormItem>
          <FormItem label="状态" field="status" triggerPropName="value">
            <Select>
              <Select.Option value={1}>启用</Select.Option>
              <Select.Option value={0}>停用</Select.Option>
            </Select>
          </FormItem>
        </Form>
      </Modal>
    </Card>
  )
}
