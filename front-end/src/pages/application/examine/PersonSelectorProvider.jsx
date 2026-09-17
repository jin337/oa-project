import { useEffect, useMemo, useState } from 'react'
import * as deptApi from 'src/api/dept'
import * as roleApi from 'src/api/role'
import { SelectorDataContext } from 'src/pages/application/examine/selector-context'
import {
  buildOrgItemMap,
  buildRoleItemMap,
  buildUserDeptMap,
  transformDeptTree,
  transformRoleList,
} from 'src/pages/application/examine/flowModel'

/**
 * 人员选择器数据提供者：加载组织架构树 + 角色列表并注入 SelectorDataContext，
 * 供页面内任意位置的 PersonSelectorModal / PersonPicker 统一读取数据源。
 *
 * 用法（在需要使用选人弹窗的页面根节点包裹一次即可）：
 *   <PersonSelectorProvider>
 *     ...页面内容（含 <PersonSelectorModal visible={...} .../>）...
 *   </PersonSelectorProvider>
 */
export default function PersonSelectorProvider({ children }) {
  const [orgTree, setOrgTree] = useState([])
  const [roleList, setRoleList] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([deptApi.getDeptUsersTree(), roleApi.listRoles({ page: 1, size: 999 })])
      .then(([deptRes, roleRes]) => {
        if (cancelled) return
        setOrgTree(transformDeptTree(deptRes.data?.list || deptRes.data || []))
        setRoleList(transformRoleList(roleRes.data?.list || roleRes.data || []))
      })
      .catch(() => {
        // 错误已在请求层提示，数据为空时选择器显示"暂无组织架构数据"兜底
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const value = useMemo(
    () => ({
      orgTree,
      roleList,
      orgItemMap: buildOrgItemMap(orgTree),
      roleItemMap: buildRoleItemMap(roleList),
      userDeptMap: buildUserDeptMap(orgTree),
      loading,
    }),
    [orgTree, roleList, loading],
  )

  return <SelectorDataContext.Provider value={value}>{children}</SelectorDataContext.Provider>
}
