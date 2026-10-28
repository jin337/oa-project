import { Button, Drawer } from '@arco-design/web-react'
import { useState } from 'react'
import SqlEditor from 'src/components/SqlEditor'

/**
 * 流程结束事件设置抽屉：配置流程全部通过后执行的脚本（与表单提交后事件一致）。
 * @param {{
 *   event: string,
 *   tableNames: string[],
 *   onCancel: () => void,
 *   onSave: (event: string) => void,
 * }} props
 */
export function EndEventEditDrawer({ event = '', tableNames = [], onCancel, onSave }) {
  const [script, setScript] = useState(event || '')

  return (
    <Drawer
      width={600}
      title="流程结束事件"
      visible
      maskClosable={false}
      onCancel={onCancel}
      footer={
        <div className="flex justify-end gap-2">
          <Button onClick={onCancel}>取消</Button>
          <Button type="primary" onClick={() => onSave(script)}>
            保存
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <div className="text-xs leading-relaxed text-gray-500">
          流程审批全部通过后执行。
        </div>
        <SqlEditor
          value={script}
          onChange={setScript}
          placeholder={'-- 流程结束后执行的 SQL / 脚本'}
          extraSuggestions={tableNames}
        />
      </div>
    </Drawer>
  )
}
