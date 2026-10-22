import { Message } from '@arco-design/web-react'
import * as approvalApi from 'src/api/approval'
import { PersonSelectModalWithData } from 'src/components/PersonSelectModalWithData'
import { userIdFromKey } from 'src/pages/application/examine/flowModel'

/**
 * 审批列表通用「手动抄送」弹窗。
 * 各列表页（待办 / 发起 / 已办 / 抄送我的）共用：
 *   - 多选组织架构用户
 *   - 调用 POST /approval/instance/:id/manual-cc
 *   - 成功后 Message.success 并触发 onSuccess（通常用于刷新列表）
 *
 * 使用：
 *   const [ccRecord, setCCRecord] = useState(null)
 *   <CCModal record={ccRecord} onClose={() => setCCRecord(null)} onSuccess={fetchList} />
 */
export default function CCModal({ record, onClose, onSuccess }) {
  if (!record) return null
  return (
    <PersonSelectModalWithData
      title="选择抄送人"
      selectMode={2}
      onChange={async (items) => {
        const userIds = items?.map((it) => userIdFromKey(it?.key)).filter(Boolean)
        if (!userIds?.length) {
          Message.warning('请选择至少一位抄送人')
          return
        }
        try {
          await approvalApi.manualCCApprovalInstance(record.instance_id || record.id, userIds)
          Message.success('已发送抄送')
          onClose?.()
          onSuccess?.()
        } catch (e) {
          // 错误已在请求层提示
        }
      }}
      onCancel={onClose}
    />
  )
}
