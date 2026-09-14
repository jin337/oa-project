import {
  Button,
  Card,
  Drawer,
  Form,
  Message,
  Popconfirm,
  Space,
  Spin,
  Table,
} from '@arco-design/web-react'
import { useCallback, useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import * as applicationApi from 'src/api/application'
import * as approvalApi from 'src/api/approval'
import DynamicFlowView from 'src/pages/application/dynamic/DynamicFlowView'
import DynamicForm from 'src/pages/application/dynamic/DynamicForm'
import { ApprovalStatusTag } from 'src/pages/approval/approvalStatus.jsx'
import DetailDrawer from 'src/pages/approval/DetailDrawer.jsx'
import { useTabs } from 'src/store/tab-context'

const PAGE_TITLE = '草稿箱'

/** 草稿箱：展示当前用户状态为「草稿」的申请记录，支持继续编辑 / 提交审核 / 删除 */
export default function Drafts() {
  const location = useLocation()
  const { addTab } = useTabs()
  const [list, setList] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(10)
  const [loading, setLoading] = useState(false)

  // 继续编辑 Drawer：加载应用配置 + 草稿详情回填动态表单
  const [drawerVisible, setDrawerVisible] = useState(false)
  const [drawerLoading, setDrawerLoading] = useState(false)
  const [drawerSaving, setDrawerSaving] = useState(false)
  const [drawerApp, setDrawerApp] = useState(null)
  const [draftRecord, setDraftRecord] = useState(null)
  const [drawerForm] = Form.useForm()

  // 动态详情 Drawer（查看详情）
  const [detailRecord, setDetailRecord] = useState(null)

  useEffect(() => {
    addTab({ path: location.pathname, title: PAGE_TITLE })
  }, [location.pathname, addTab])

  const fetchList = useCallback(async () => {
    setLoading(true)
    try {
      const res = await approvalApi.getApprovalList({ page, size, scope: 'drafts' })
      setList(res.data?.list || [])
      setTotal(res.data?.total || 0)
    } catch (e) {
      // 错误已在请求层提示
    } finally {
      setLoading(false)
    }
  }, [page, size])

  useEffect(() => {
    fetchList()
  }, [fetchList])

  // 继续编辑：预请求应用配置 + 草稿详情，回填动态表单
  const openDraftEdit = async (record) => {
    setDraftRecord(record)
    setDrawerVisible(true)
    setDrawerLoading(true)
    setDrawerApp(null)
    drawerForm.resetFields()
    try {
      const dataId = record.data_id ?? record.id
      const [appRes, dataRes] = await Promise.all([
        applicationApi.getApplication(record.app_id),
        applicationApi.getApplicationDataDetail(record.app_id, dataId),
      ])
      setDrawerApp(appRes.data)
      drawerForm.setFieldsValue(dataRes.data || {})
    } catch (e) {
      Message.error('草稿加载失败，请稍后重试')
      setDrawerVisible(false)
    } finally {
      setDrawerLoading(false)
    }
  }

  // 保存草稿编辑：更新动态业务数据（状态保持草稿）
  const handleDraftSave = async () => {
    let values
    try {
      values = await drawerForm.validate()
    } catch (e) {
      return
    }
    setDrawerSaving(true)
    try {
      await applicationApi.updateApplicationData(
        drawerApp.id,
        draftRecord.data_id ?? draftRecord.id,
        values,
      )
      Message.success('草稿更新成功')
      setDrawerVisible(false)
      fetchList()
    } catch (e) {
      // 错误已在请求层提示
    } finally {
      setDrawerSaving(false)
    }
  }

  // 提交审核：审核状态流转为「待审核」
  const handleSubmit = async (record) => {
    try {
      await applicationApi.updateApplicationDataApproval(
        record.app_id,
        record.data_id ?? record.id,
        1,
      )
      Message.success('提交成功，等待审核')
      fetchList()
    } catch (e) {
      // 错误已在请求层提示
    }
  }

  // 删除草稿
  const handleDelete = async (record) => {
    try {
      await applicationApi.deleteApplicationData(record.app_id, record.data_id ?? record.id)
      Message.success('草稿删除成功')
      fetchList()
    } catch (e) {
      // 错误已在请求层提示
    }
  }

  const columns = [
    {
      title: '序号',
      key: 'index',
      width: 62,
      align: 'center',
      render: (_, __, index) => index + 1,
    },
    { title: '模块', dataIndex: 'app_name', render: (v) => v || '-' },
    { title: '部门', dataIndex: 'dept_name', render: (v) => v || '-' },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      width: 170,
      render: (v) => v?.slice(0, 19).replace('T', ' ') || '-',
    },
    {
      title: '状态',
      dataIndex: 'approval_status',
      width: 110,
      render: (v) => <ApprovalStatusTag status={v} />,
    },
    {
      title: '操作',
      key: 'action',
      width: 300,
      render: (_, r) => (
        <Space>
          <Button type="text" size="small" onClick={() => setDetailRecord(r)}>
            详情
          </Button>
          <Button type="text" size="small" onClick={() => openDraftEdit(r)}>
            编辑
          </Button>
          <Button type="text" size="small" onClick={() => handleSubmit(r)}>
            提交
          </Button>
          <Popconfirm position='lb' title="确定删除该草稿吗？" onOk={() => handleDelete(r)}>
            <Button type="text" size="small" status="danger">
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <Card title={PAGE_TITLE}>
      <Table
        rowKey={(r) => r.data_id ?? r.id}
        columns={columns}
        data={list}
        loading={loading}
        pagination={{
          total,
          current: page,
          pageSize: size,
          showTotal: true,
          sizeCanChange: true,
          onChange: (p, s) => {
            setPage(p)
            setSize(s)
          },
        }}
      />

      {/* 继续编辑 Drawer：注入动态表单并回填草稿数据 */}
      <Drawer
        width="50%"
        visible={drawerVisible}
        onCancel={() => setDrawerVisible(false)}
        title={`编辑草稿 - ${drawerApp?.item_name || drawerApp?.name || ''}`}
        unmountOnExit
        footer={
          <div className="flex justify-end gap-2">
            <Button onClick={() => setDrawerVisible(false)}>取消</Button>
            <Button type="primary" loading={drawerSaving} onClick={handleDraftSave}>
              保存草稿
            </Button>
          </div>
        }
      >
        {drawerLoading ? (
          <div className="flex h-40 items-center justify-center">
            <Spin />
          </div>
        ) : drawerApp ? (
          <>
            <DynamicForm app={drawerApp} form={drawerForm} pageType="form" />
            {/* 审批流程：抽屉内独立渲染审批流配置只读还原 */}
            <DynamicFlowView raw={drawerApp?.approval_flow_json} />
          </>
        ) : null}
      </Drawer>

      {/* 查看详情 Drawer：按记录的页面编码请求应用配置，渲染动态详情 */}
      <DetailDrawer
        record={detailRecord}
        visible={Boolean(detailRecord)}
        onCancel={() => setDetailRecord(null)}
      />
    </Card>
  )
}
