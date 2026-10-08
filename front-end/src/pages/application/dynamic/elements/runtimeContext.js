import { createContext } from 'react'

/**
 * 运行时表单上下文：向选项型控件提供动态选项、向元素容器提供失焦回调。
 *
 * 独立成文件供 DynamicForm（引擎）与 elements/ 下各渲染组件共享，
 * 避免"元素渲染配置 → DynamicForm → 元素渲染组件"之间的循环依赖。
 */
export const RuntimeFormContext = createContext(null)
