import {
  Button,
  Card,
  Drawer,
  Input,
  Message,
  Popconfirm,
  Space,
  Table,
} from '@arco-design/web-react'
import { useCallback, useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import * as approvalApi from 'src/api/approval'
import { ApprovalStatusTag } from 'src/pages/approval/approvalStatus.jsx'
import ApprovalTimeline from 'src/pages/approval/ApprovalTimeline'
import ApprovalDetailDrawer from 'src/pages/approval/DetailDrawer'
import { useTabs } from 'src/store/tab-context'

const PAGE_TITLE = '我的待办'

/** 我的待办：展示当前用户待处理的审批任务，提供审批操作（同意/拒绝/驳回）与查看详情 */
export default function Todo() {
  const location = useLocation()
  const { addTab } = useTabs()
  const [list, setList] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(10)
  const [loading, setLoading] = useState(false)
  const [detailRecord, setDetailRecord] = useState(null)

  // 审批操作 Drawer
  const [approveDrawerVisible, setApproveDrawerVisible] = useState(false)
  const [currentTask, setCurrentTask] = useState(null)
  const [comment, setComment] = useState('')
  const [operating, setOperating] = useState(false)
  // 审批时间线预加载数据：打开 Drawer 时一次请求，通过 initialData 传递给 ApprovalTimeline 跳过自身请求
  const [timelineInstance, setTimelineInstance] = useState(null)
  const [timelineLoading, setTimelineLoading] = useState(false)

  useEffect(() => {
    addTab({ path: location.pathname, title: PAGE_TITLE })
  }, [location.pathname, addTab])

  const fetchList = useCallback(async () => {
    setLoading(true)
    try {
      const res = await approvalApi.getApprovalList({ page, size, scope: 'todo' })
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

  // 打开审批操作 Drawer：预加载实例数据，供 ApprovalTimeline 复用
  const handleOpenApprove = async (record) => {
    setCurrentTask(record)
    setComment('')
    setApproveDrawerVisible(true)
    setTimelineInstance(null)
    setTimelineLoading(true)
    try {
      const res = await approvalApi.getApprovalInstanceDetail(record.instance_id)
      setTimelineInstance(res.data)
    } catch {
      // 错误已在请求层提示
    } finally {
      setTimelineLoading(false)
    }
  }

  // 执行审批操作（1-通过 2-拒绝 3-驳回）
  const handleApprovalAction = async (action) => {
    if (!currentTask) return
    setOperating(true)
    try {
      await approvalApi.approveApprovalTask(currentTask.instance_id, currentTask.id, {
        action,
        comment: comment.trim() || undefined,
      })
      const actionNames = { 1: '通过', 2: '拒绝', 3: '驳回' }
      Message.success(`已${actionNames[action]}`)
      setApproveDrawerVisible(false)
      setCurrentTask(null)
      setTimelineInstance(null)
      fetchList()
    } catch (e) {
      // 错误已在请求层提示
    } finally {
      setOperating(false)
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
    { title: '审批节点', dataIndex: 'node_name', render: (v) => v || '-' },
    { title: '部门', dataIndex: 'dept_name', render: (v) => v || '-' },
    { title: '申请人', dataIndex: 'created_name', render: (v) => v || '-' },
    {
      title: '申请时间',
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
      width: 160,
      render: (_, r) => (
        <Space>
          <Button type="text" size="small" onClick={() => setDetailRecord(r)}>
            详情
          </Button>
          <Button type="primary" size="small" onClick={() => handleOpenApprove(r)}>
            审批
          </Button>
        </Space>
      ),
    },
  ]

  return (
    <Card title={PAGE_TITLE}>
      <Table
        rowKey={(r) => r.instance_id ? `${r.instance_id}_${r.id}` : r.id}
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

      {/* 详情 Drawer */}
      <ApprovalDetailDrawer
        record={detailRecord}
        visible={Boolean(detailRecord)}
        onCancel={() => setDetailRecord(null)}
      />

      {/* 审批操作 Drawer */}
      <Drawer
        width="50%"
        title={`审批 - ${currentTask?.app_name || ''}`}
        visible={approveDrawerVisible}
        onCancel={() => setApproveDrawerVisible(false)}
        unmountOnExit
        footer={
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-500">
              节点：{currentTask?.node_name || '-'}
            </div>
            <Space>
              <Popconfirm
                title="确定拒绝该申请吗？"
                onOk={() => handleApprovalAction(2)}
                position="top"
              >
                <Button status="danger" loading={operating}>
                  拒绝
                </Button>
              </Popconfirm>
              <Popconfirm
                title="确定驳回该申请吗？（退回修改）"
                onOk={() => handleApprovalAction(3)}
                position="top"
              >
                <Button status="warning" loading={operating}>
                  驳回
                </Button>
              </Popconfirm>
              <Popconfirm
                title="确定通过该申请吗？"
                onOk={() => handleApprovalAction(1)}
                position="top"
              >
                <Button type="primary" loading={operating}>
                  同意
                </Button>
              </Popconfirm>
            </Space>
          </div>
        }
      >
        {currentTask && (
          <>
            {/* 审批意见输入 */}
            <div className="mb-4">
              <div className="mb-2 text-sm font-medium text-gray-700">审批意见</div>
              <Input.TextArea
                placeholder="请输入审批意见（可选）"
                value={comment}
                onChange={setComment}
                maxLength={500}
                showWordLimit
                autoSize={{ minRows: 2, maxRows: 4 }}
              />
            </div>

            {/* 审批流程时间线：数据预加载完成后渲染，通过 initialData 跳过自身 API 请求 */}
            {timelineLoading ? (
              <div className="py-4 text-center text-gray-400">加载审批流程...</div>
            ) : (
              <ApprovalTimeline
                instanceId={currentTask.instance_id}
                visible={approveDrawerVisible}
                initialData={timelineInstance}
                assigneeNameMap={timelineInstance?.assignee_name_map}
              />
            )}
          </>
        )}
      </Drawer>
    </Card>
  )
}
