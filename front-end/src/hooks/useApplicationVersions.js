import { Message } from '@arco-design/web-react'
import { useCallback, useState } from 'react'
import * as applicationApi from 'src/api/application'

/** 版本列表不展示当前「设计中」行（status=3） */
const filterVisibleVersions = (data) => (data || []).filter((v) => v.status !== 3)

/**
 * 应用版本列表弹窗的共用状态与动作。
 *
 * @param {string|number|undefined} appId 设计页从路由取得的应用 id；
 *   应用列表页没有固定 id，打开某个应用的版本弹窗时通过 openVersions(record) 传入。
 */
export function useApplicationVersions(appId) {
  const [versionVisible, setVersionVisible] = useState(false)
  const [versionLoading, setVersionLoading] = useState(false)
  const [versionList, setVersionList] = useState([])
  const [versionApp, setVersionApp] = useState(null)
  const [editingVersion, setEditingVersion] = useState(null)
  const [editingEffectiveAt, setEditingEffectiveAt] = useState(null)
  const [editingRemark, setEditingRemark] = useState('')

  const targetAppId = versionApp?.id ?? appId

  const loadVersions = useCallback(
    async (targetId = appId) => {
      if (!targetId) {
        setVersionList([])
        return
      }
      setVersionLoading(true)
      try {
        const res = await applicationApi.listApplicationVersions(targetId)
        setVersionList(filterVisibleVersions(res.data))
      } catch (e) {
        setVersionList([])
      } finally {
        setVersionLoading(false)
      }
    },
    [appId],
  )

  const openVersions = useCallback(
    (record) => {
      setVersionApp(record || null)
      setVersionVisible(true)
      setEditingVersion(null)
      return loadVersions(record?.id ?? appId)
    },
    [appId, loadVersions],
  )

  const closeVersions = useCallback(() => {
    setVersionVisible(false)
    setEditingVersion(null)
  }, [])

  const cancelEditVersion = useCallback(() => setEditingVersion(null), [])

  const startEditVersion = useCallback((record) => {
    setEditingVersion(record)
    setEditingEffectiveAt(record.effective_at)
    setEditingRemark(record.remark || '')
  }, [])

  const saveEditVersion = useCallback(async () => {
    if (!targetAppId || !editingVersion || !editingEffectiveAt) return
    try {
      await applicationApi.updateApplicationVersionEffectiveAt(targetAppId, editingVersion.id, {
        effective_at: new Date(editingEffectiveAt).toISOString(),
        remark: editingRemark,
      })
      Message.success('已更新')
      setEditingVersion(null)
      await loadVersions(targetAppId)
    } catch (e) {
      // 错误已在请求层提示
    }
  }, [targetAppId, editingVersion, editingEffectiveAt, editingRemark, loadVersions])

  const deleteVersion = useCallback(
    async (record) => {
      if (!targetAppId) return
      try {
        await applicationApi.deleteApplicationVersion(targetAppId, record.id)
        Message.success('已删除')
        await loadVersions(targetAppId)
      } catch (e) {
        // 错误已在请求层提示
      }
    },
    [targetAppId, loadVersions],
  )

  return {
    versionVisible,
    versionLoading,
    versionList,
    versionApp,
    editingVersion,
    editingEffectiveAt,
    editingRemark,
    setEditingEffectiveAt,
    setEditingRemark,
    loadVersions,
    openVersions,
    closeVersions,
    startEditVersion,
    cancelEditVersion,
    saveEditVersion,
    deleteVersion,
  }
}
