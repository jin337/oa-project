import { usePermission } from 'src/hooks/usePermission'

/**
 * 权限按钮组件：无权限时不渲染（或渲染为 disabled）
 *
 * @param {object} props
 * @param {string | string[]} props.perm - 所需权限标识，单个字符串或字符串数组
 * @param {'hide' | 'disable'} [props.fallback='hide'] - 无权限时的行为：hide=不渲染，disable=渲染为禁用
 * @param {'any' | 'all'} [props.mode='any'] - 多权限时的匹配模式：any=满足任一，all=全部满足
 * @param {React.ReactNode} props.children - 按钮内容
 * @param {React.ReactNode} [props.placeholder] - fallback='hide' 时的占位内容（默认 null，即不渲染）
 *
 * @example
 *   // 无权限时不渲染
 *   <AuthButton perm="system:user:add" onClick={handleAdd}>新增</AuthButton>
 *
 *   // 无权限时显示为禁用按钮
 *   <AuthButton perm="system:user:delete" fallback="disable" onClick={handleDel}>删除</AuthButton>
 *
 *   // 多权限 OR 匹配
 *   <AuthButton perm={['system:user:add', 'system:user:edit']} onClick={handleSave}>保存</AuthButton>
 *
 *   // 多权限 AND 匹配
 *   <AuthButton perm={['system:user:add', 'system:user:audit']} mode="all">高级操作</AuthButton>
 */
export default function AuthButton({
  perm,
  fallback = 'hide',
  mode = 'any',
  children,
  placeholder = null,
  ...restProps
}) {
  const { hasAnyPerm, hasAllPerms } = usePermission()

  // 标准化 perm 为数组
  const permList = Array.isArray(perm) ? perm : perm ? [perm] : []

  // 判断是否有权限
  let authorized = true
  if (permList.length > 0) {
    if (mode === 'all') {
      authorized = hasAllPerms(...permList)
    } else {
      authorized = hasAnyPerm(...permList)
    }
  }

  // 无权限
  if (!authorized) {
    if (fallback === 'disable') {
      // 渲染为禁用按钮：透传所有 props 给子元素，注入 disabled
      const child = Array.isArray(children) ? children[0] : children
      if (child && typeof child === 'object' && child.props) {
        return { ...child, props: { ...child.props, disabled: true } }
      }
      return children
    }
    // hide 模式：不渲染
    return placeholder
  }

  return children
}
