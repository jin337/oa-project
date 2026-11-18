/**
 * 将后端返回的树结构（id/name/children）转换为 Arco TreeSelect 需要的
 * key/title/value 结构。
 *
 * 部门树与菜单树字段一致，统一走这里，避免页面各维护一份递归实现。
 */
export function toTreeData(nodes) {
  return (nodes || []).map((node) => ({
    key: String(node.id),
    title: node.name,
    value: node.id,
    children: node.children ? toTreeData(node.children) : undefined,
  }))
}
