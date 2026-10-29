import { Button, Drawer, Message, Radio } from '@arco-design/web-react'
import { useState } from 'react'
import JsEditor from 'src/components/JsEditor'
import { PersonPicker } from 'src/components/PersonSelectorModal'
import { INITIATOR_TYPE_OPTIONS } from 'src/pages/application/design/constants'
import { normalizeMembers } from 'src/pages/application/examine/flowModel'

/**
 * 发起人节点设置抽屉：发起对象 + 申请提交前事件 + 申请提交后事件。
 * initiatorType: 1-指定人员 / 2-指定角色 / 3-所有人。
 * @param {{
 *   node: Object,
 *   onCancel: () => void,
 *   onSave: (node: Object) => void,
 * }} props
 */
export function InitiatorEditDrawer({ node, onCancel, onSave }) {
  const members = normalizeMembers(node.members)
  const [initiatorType, setInitiatorType] = useState(
    node.initiatorType || (members.some((m) => m.type === 3) ? 2 : members.length ? 1 : 3),
  )
  const [selectedMembers, setSelectedMembers] = useState(members)
  const [onSubmitBefore, setOnSubmitBefore] = useState(node.onSubmitBefore || '')
  const [onSubmitAfter, setOnSubmitAfter] = useState(node.onSubmitAfter || '')

  const handleSave = () => {
    if ((initiatorType === 1 || initiatorType === 2) && !selectedMembers.length) {
      Message.warning(initiatorType === 1 ? '请选择发起人' : '请选择可发起角色')
      return
    }
    onSave({
      ...node,
      initiatorType,
      members: initiatorType === 3 ? [] : selectedMembers,
      onSubmitBefore,
      onSubmitAfter,
    })
  }

  return (
    <Drawer
      width={600}
      title="发起人设置"
      visible
      maskClosable={false}
      onCancel={onCancel}
      footer={
        <div className="flex justify-end gap-2">
          <Button onClick={onCancel}>取消</Button>
          <Button type="primary" onClick={handleSave}>
            保存
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        <div>
          <div className="mb-2 font-medium">发起对象</div>
          <Radio.Group
            value={initiatorType}
            onChange={(value) => {
              setInitiatorType(value)
              setSelectedMembers([])
            }}
          >
            {INITIATOR_TYPE_OPTIONS.map((o) => (
              <Radio key={o.value} value={o.value}>
                {o.label}
              </Radio>
            ))}
          </Radio.Group>
          <div className="mt-3">
            {initiatorType === 1 && (
              <PersonPicker
                modes={[1]} // 1-组织架构（仅取人员）
                selectMode={2}
                value={selectedMembers}
                onChange={setSelectedMembers}
                placeholder="请选择发起人"
              />
            )}
            {initiatorType === 2 && (
              <PersonPicker
                modes={[2]} // 2-角色
                selectMode={1}
                value={selectedMembers}
                onChange={setSelectedMembers}
                placeholder="请选择可发起角色"
              />
            )}
          </div>
        </div>
        <div>
          <div className="mb-2 text-sm text-gray-600">申请提交前事件</div>
          <JsEditor
            value={onSubmitBefore}
            onChange={setOnSubmitBefore}
            placeholder={
              '// 第二个参数 request 为自动携带登录态的请求助手\n' +
              '// (form, request) => {\n' +
              '//   const res = await request.get(\'/depts\')\n' +
              '//   if (res.code !== 0) return false\n' +
              '// }'
            }
            minRows={6}
            maxRows={12}
          />
        </div>
        <div>
          <div className="mb-2 text-sm text-gray-600">申请提交后事件</div>
          <JsEditor
            value={onSubmitAfter}
            onChange={setOnSubmitAfter}
            placeholder={
              '// 第三个参数 request 为自动携带登录态的请求助手\n' +
              '// (form, result, request) => {\n' +
              '//   await request.post(\'/xxx\', form)\n' +
              '// }'
            }
            minRows={6}
            maxRows={12}
          />
        </div>
      </div>
    </Drawer>
  )
}
