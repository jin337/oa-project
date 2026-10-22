import { useEffect, useState } from 'react'
import * as deptApi from 'src/api/dept'
import { fetchAll } from 'src/api/fetchAll'
import * as roleApi from 'src/api/role'
import { PersonSelectorModal } from 'src/components/PersonSelectorModal'
import {
  buildOrgItemMap,
  buildRoleItemMap,
  buildUserDeptMap,
  transformDeptTree,
  transformRoleList,
} from 'src/pages/application/examine/flowModel'
import { SelectorDataContext } from 'src/pages/application/examine/selector-context'

/**
 * 带数据加载的人员选择弹窗：
 * - 自动加载组织架构树（dept tree）+ 角色列表
 * - 注入 SelectorDataContext，供 PersonSelectorModal 消费
 * - 用于在审批列表等独立页面唤起人员选择（不依赖外层 Drawer 已注入 Context）
 */
export function PersonSelectModalWithData({
  title = '选择人员',
  selectMode = 2,
  onChange,
  onCancel,
}) {
  const [data, setData] = useState({
    orgTree: [],
    roleList: [],
    groupList: [],
    orgItemMap: {},
    roleItemMap: {},
    userDeptMap: {},
    loading: false,
  })

  useEffect(() => {
    let cancelled = false
    setData((d) => ({ ...d, loading: true }))
    Promise.all([
      deptApi.getDeptUsersTree({ status: 1 }),
      fetchAll(roleApi.listRoles, { status: 1 }),
    ])
      .then(([deptRes, roleRes]) => {
        if (cancelled) return
        const orgTree = transformDeptTree(deptRes.data?.list || deptRes.data || [])
        const roleList = transformRoleList(roleRes.data?.list || roleRes.data || [])
        setData({
          orgTree,
          roleList,
          groupList: [],
          orgItemMap: buildOrgItemMap(orgTree),
          roleItemMap: buildRoleItemMap(roleList),
          userDeptMap: buildUserDeptMap(orgTree),
          loading: false,
        })
      })
      .catch(() => {
        if (!cancelled) setData((d) => ({ ...d, loading: false }))
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <SelectorDataContext.Provider value={data}>
      <PersonSelectorModal
        title={title}
        modes={[1]}
        selectMode={selectMode}
        onChange={onChange}
        onCancel={onCancel}
      />
    </SelectorDataContext.Provider>
  )
}
