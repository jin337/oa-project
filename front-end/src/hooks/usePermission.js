import { useAuth } from 'src/store/auth-context'

/**
 * 按钮级权限判断 Hook
 *
 * @returns {{ hasPerm: (perm: string) => boolean, hasAnyPerm: (...perms: string[]) => boolean, hasAllPerms: (...perms: string[]) => boolean }}
 *
 * @example
 *   const { hasPerm } = usePermission()
 *   {hasPerm('system:user:add') && <Button>新增</Button>}
 *
 *   // 满足任一权限即显示
 *   const { hasAnyPerm } = usePermission()
 *   {hasAnyPerm('system:user:add', 'system:user:edit') && <Button>操作</Button>}
 *
 *   // 必须同时满足所有权限
 *   const { hasAllPerms } = usePermission()
 *   {hasAllPerms('system:user:add', 'system:user:edit') && <Button>操作</Button>}
 */
export function usePermission() {
  const { hasPerm } = useAuth()

  /** 是否拥有指定权限 */
  const check = (perm) => hasPerm(perm)

  /** 是否拥有任一权限（OR 逻辑） */
  const hasAnyPerm = (...perms) => perms.some((p) => hasPerm(p))

  /** 是否同时拥有所有权限（AND 逻辑） */
  const hasAllPerms = (...perms) => perms.every((p) => hasPerm(p))

  return { hasPerm: check, hasAnyPerm, hasAllPerms }
}
