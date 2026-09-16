import { Drawer, Empty, Spin } from '@arco-design/web-react'
import { useEffect, useState } from 'react'
import * as approvalApi from 'src/api/approval'
import DynamicDetail from 'src/pages/application/dynamic/DynamicDetail'
import ApprovalTimeline from 'src/pages/approval/ApprovalTimeline.jsx'

/**
 * 审批记录动态详情 Drawer：通过 record.instance_id 一次性请求流程实例详情接口，
 * 复用接口返回的 business_data（含子表）渲染动态详情，复用 detail_layout_json 构建布局配置，
 * 复用 assignee_name_map 传递给 ApprovalTimeline 消除额外用户查询请求。
 * 无 instance_id 时（旧业务数据）回退为按 code + dataId 分别请求应用配置与业务数据。
 */
export default function DetailDrawer({ record, visible, onCancel }) {
  const [loading, setLoading] = useState(false)
  const [instance, setInstance] = useState(null)
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    if (!visible || !record) return
    let cancelled = false
    setLoading(true)
    setInstance(null)
    setLoadError(false)

    // 有实例 ID 时走优化路径：一次请求获取全部数据
    if (record.instance_id) {
      approvalApi
        .getApprovalInstanceDetail(record.instance_id)
        .then((res) => {
          if (!cancelled) setInstance(res.data)
        })
        .catch(() => {
          if (!cancelled) setLoadError(true)
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    } else {
      // 无实例 ID：回退为旧路径（按 code 查询应用配置，DynamicDetail 自行请求业务数据）
      if (!cancelled) setLoading(false)
    }

    return () => {
      cancelled = true
    }
  }, [visible, record])

  const dataId = record?.data_id ?? record?.id

  // 从实例响应中构造 DynamicDetail 所需的 app 配置
  // hook 内部会将 detail_layout_json 映射为 form_layout_json 供 DynamicForm 使用
  const appFromInstance = instance
    ? {
        id: instance.app_id,
        name: instance.app_name,
        detail_layout_json: instance.detail_layout_json,
      }
    : null

  const title = instance?.app_name || record?.item_name || record?.name || ''

  return (
    <Drawer
      width="50%"
      title={`详情 - ${title}`}
      visible={visible}
      onCancel={onCancel}
      footer={null}
      unmountOnExit
    >
      {loading ? (
        <div className="flex h-40 items-center justify-center">
          <Spin />
        </div>
      ) : instance ? (
        <>
          <DynamicDetail
            app={appFromInstance}
            dataId={dataId}
            initialData={instance?.business_data}
          />
          <ApprovalTimeline
            instanceId={record?.instance_id}
            visible={visible}
            initialData={instance}
            assigneeNameMap={instance?.assignee_name_map}
          />
        </>
      ) : !record?.instance_id ? (
        // 无实例 ID 的回退态：仅渲染应用配置（DynamicDetail 自行请求业务数据）
        loadError ? (
          <Empty description="数据加载失败" />
        ) : (
          <Empty description="该记录未关联审批流程" />
        )
      ) : (
        <Empty description={loadError ? '数据加载失败' : '暂无数据'} />
      )}
    </Drawer>
  )
}
