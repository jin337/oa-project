import { createContext, useContext } from 'react'

/**
 * 对象选择器数据上下文：组织架构树 / 角色-用户树 / 派生映射 / 加载态，
 * 由主组件请求后注入，各弹层（PersonSelectorModal / PersonPicker / 各编辑抽屉）统一从 Context 读取，避免多层 props 透传。
 * @type {React.Context<{
 *   orgTree: Object[],
 *   roleList: Object[],
 *   orgItemMap: Record<string, Object>,
 *   roleItemMap: Record<string, Object>,
 *   userDeptMap: Record<string, string>,
 *   loading: boolean,
 * }>}
 */
export const SelectorDataContext = createContext(null)

/** 读取对象选择器数据（未注入时返回空对象，各消费方均有默认值兜底） */
export const useSelectorData = () => useContext(SelectorDataContext) || {}
