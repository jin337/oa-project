import { Button, Drawer, Radio } from '@arco-design/web-react'
import { useState } from 'react'
import { APPROVER_TYPE_OPTIONS, CC_TIMING_OPTIONS, SELF_SELECT_OPTIONS } from 'src/pages/application/design/constants'
import { normalizeMembers } from 'src/pages/application/examine/flowModel'
import { PersonPicker } from 'src/pages/application/examine/PersonSelectorModal'

/**
 * 抄送人节点设置抽屉：配置抄送对象（指定人员 / 指定角色 / 发起人自选 / 审核人员组）与抄送时机。
 * 审核人员组数据源由页面级 SelectorDataContext 提供（ExamineManage 统一加载）。
 * @param {{
 *   node: Object,
 *   onCancel: () => void,
 *   onSave: (node: Object) => void,
 * }} props
 */
export function CcEditDrawer({ node, onCancel, onSave }) {
  // 抄送对象：1-指定人员 / 2-指定角色 / 3-发起人自选 / 4-审核人员组
  const [approverType, setApproverType] = useState(node.approverType || 1)
  const [members, setMembers] = useState(normalizeMembers(node.members))
  // 发起人自选类型：1-单选 / 2-多选
  const [selfSelect, setSelfSelect] = useState(node.selfSelect || 1)
  // 抄送时机：1-审批通过后抄送 / 2-流程结束时统一抄送
  const [ccTiming, setCcTiming] = useState(node.ccTiming || 1)
  return (
    <Drawer
      width={600}
      title="抄送人设置"
      visible
      onCancel={onCancel}
      footer={
        <div className="flex justify-end gap-2">
          <Button onClick={onCancel}>取消</Button>
          <Button
            type="primary"
            onClick={() => onSave({ ...node, approverType, members, selfSelect, ccTiming })}
          >
            保存
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        {/* 抄送对象：1-指定人员 / 2-指定角色 / 3-发起人自选 / 4-审核人员组 */}
        <div>
          <div className="mb-2 font-medium">抄送对象</div>
          <Radio.Group
            value={approverType}
            onChange={(value) => {
              setApproverType(value)
              setMembers([])
            }}
          >
            {APPROVER_TYPE_OPTIONS.map((o) => (
              <Radio key={o.value} value={o.value}>
                {o.label}
              </Radio>
            ))}
          </Radio.Group>
          <div className="mt-3">
            {approverType === 1 && ( // 1-指定人员
              <PersonPicker
                modes={[1]} // 1-组织架构
                selectMode={2} // 2-多选（与审批人一致）
                value={members}
                onChange={setMembers}
                placeholder="请选择"
              />
            )}
            {approverType === 2 && ( // 2-指定角色
              <PersonPicker
                modes={[2]} // 2-角色
                selectMode={1} // 1-单选（与审批人一致）
                value={members}
                onChange={setMembers}
                placeholder="请选择"
              />
            )}
            {approverType === 3 && ( // 3-发起人自选：自选时不展示成员选择器，改为选择类型
              <>
                <div className="mb-1 text-sm text-gray-500">选择类型</div>
                <Radio.Group type="button" value={selfSelect} onChange={setSelfSelect}>
                  {SELF_SELECT_OPTIONS.map((o) => (
                    <Radio key={o.value} value={o.value}>
                      {o.label}
                    </Radio>
                  ))}
                </Radio.Group>
              </>
            )}
            {approverType === 4 && ( // 4-审核人员组：复用 PersonPicker（单选，数据源来自页面级 Context，与审批人一致）
              <PersonPicker
                modes={[4]} // 4-审核人员组：仅审核人员组维度
                selectMode={1} // 1-单选（与审批人一致）
                value={members}
                onChange={setMembers}
                placeholder="选择审核人员组"
              />
            )}
          </div>
        </div>
        {/* 抄送时机：1-审批通过后抄送 / 2-流程结束时统一抄送 */}
        <div>
          <div className="mb-2 font-medium">抄送时机</div>
          <Radio.Group direction="vertical" value={ccTiming} onChange={setCcTiming}>
            {CC_TIMING_OPTIONS.map((o) => (
              <Radio key={o.value} value={o.value}>
                {o.label}
              </Radio>
            ))}
          </Radio.Group>
        </div>
      </div>
    </Drawer>
  )
}
