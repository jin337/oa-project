import { Button, Drawer, Message } from '@arco-design/web-react'
import { useState } from 'react'
import SqlEditor, { scanForbidden } from 'src/components/SqlEditor'

/**
 * 流程结束事件设置抽屉：配置流程全部通过后执行的脚本（与申请提交后事件一致）。
 * @param {{
 *   event: string,
 *   tableNames: string[],
 *   onCancel: () => void,
 *   onSave: (event: string) => void,
 * }} props
 */
export function EndEventEditDrawer({ event = '', tableNames = [], onCancel, onSave }) {
  const [script, setScript] = useState(event || '')
  // 流程结束事件允许 CREATE / ALTER 建表/改表（仍禁 DROP/TRUNCATE/权限/事务/文件读写）
  const forbiddenHits = scanForbidden(script, { allowDDL: true })

  const handleSave = () => {
    if (forbiddenHits.length > 0) {
      Message.error('脚本包含禁用语句，请移除后再保存')
      return
    }
    onSave(script)
  }

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
          <Button type="primary" loading={false} disabled={forbiddenHits.length > 0} onClick={handleSave}>
            保存
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <div className="text-xs leading-relaxed text-gray-500">
          流程审批全部通过后执行
        </div>
        <SqlEditor
          value={script}
          onChange={setScript}
          placeholder={'-- 流程结束后执行的 SQL / 脚本'}
          extraSuggestions={tableNames}
          allowDDL
        />
      </div>
    </Drawer>
  )
}
