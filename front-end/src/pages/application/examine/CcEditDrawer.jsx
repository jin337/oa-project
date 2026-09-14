import { useState } from 'react'
import { Button, Drawer, Radio } from '@arco-design/web-react'
import { APPROVER_TYPE_OPTIONS, CC_TIMING_OPTIONS, SELF_SELECT_OPTIONS } from 'src/pages/application/examine/constants'
import { normalizeMembers } from 'src/pages/application/examine/flowModel'
import { PersonPicker } from 'src/pages/application/examine/PersonSelectorModal'

/**
 * 抄送人节点设置抽屉：配置抄送对象（指定人员 / 指定角色 / 发起人自选）与抄送时机。
 * @param {{
 *   node: Object,
 *   onCancel: () => void,
 *   onSave: (node: Object) => void,
 * }} props
 */
export function CcEditDrawer({ node, onCancel, onSave }) {
  // 抄送对象：1-指定人员 / 2-指定角色 / 3-发起人自选
  const [approverType, setApproverType] = useState(node.approverType || 1)
  const [members, setMembers] = useState(normalizeMembers(node.members))
  // 发起人自选类型：1-单选 / 2-多选
  const [selfSelect, setSelfSelect] = useState(node.selfSelect || 1)
  // 抄送时机：1-审批通过后抄送 / 2-流程结束时统一抄送
  const [ccTiming, setCcTiming] = useState(node.ccTiming || 1)
  return (
    <Drawer
      width={480}
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
        {/* 抄送对象：1-指定人员 / 2-指定角色 / 3-发起人自选 */}
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
          {approverType !== 3 ? ( // 3-发起人自选：自选时不展示成员选择器，改为选择类型
            <div className="mt-3">
              <PersonPicker
                modes={approverType === 2 ? [2] : [1]} // 2-指定角色：仅角色维度（2-角色 / 1-组织架构）
                checkTarget={1} // 1-人员
                value={members}
                onChange={setMembers}
                placeholder="请选择"
              />
            </div>
          ) : (
            <div className="mt-3">
              <div className="mb-1 text-sm text-gray-500">选择类型</div>
              <Radio.Group type="button" value={selfSelect} onChange={setSelfSelect}>
                {SELF_SELECT_OPTIONS.map((o) => (
                  <Radio key={o.value} value={o.value}>
                    {o.label}
                  </Radio>
                ))}
              </Radio.Group>
            </div>
          )}
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
