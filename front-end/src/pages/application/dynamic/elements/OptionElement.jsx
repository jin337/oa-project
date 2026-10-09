import {
  Checkbox,
  Radio,
  Select,
  TreeSelect,
} from '@arco-design/web-react'

import { getStaticOptions } from '../utils/formUtils'

/**
 * 选项型元素（select / treeselect / radio / checkbox）：
 * 画布预览（move-*）统一硬编码预览选项，运行时优先动态接口选项（data_source.type=api），
 * 其次静态 JSON 选项（getStaticOptions）。注册结构保留在 elementConfig.jsx 的 ELEMENT_RENDER_CONFIG 中。
 *
 * 导出清单（均为 ELEMENT_RENDER_CONFIG 注册入口）：
 *   - renderSelectPreview      下拉选择（select）
 *   - renderTreeSelectPreview  树形下拉选择（treeselect）
 *   - renderRadioPreview       单选（radio）
 *   - renderCheckboxPreview    多选（checkbox）
 */

// ==================== 常量 ====================

// 画布模式（move-*）下依赖选项组件的统一预览占位选项（不解析真实 data_source）
const PREVIEW_OPTIONS = [
  { label: '选项一', value: 'option1' },
  { label: '选项二', value: 'option2' },
]

// ==================== 渲染入口 ====================

/** 下拉选择（select） */
export const renderSelectPreview = (el, pageType, rt) => {
  // 画布模式（move-*）：统一硬编码预览选项，不解析 data_source
  if (pageType?.startsWith('move-')) {
    return (
      <Select
        style={{ width: '100%' }}
        placeholder={el.placeholder || undefined}
        options={PREVIEW_OPTIONS}
      />
    )
  }
  // 运行时优先使用动态接口选项（data_source.type=api），其次静态 JSON 选项
  const runtimeOptions = rt?.getOptions?.(el)
  const options = runtimeOptions?.length ? runtimeOptions : getStaticOptions(el)
  return (
    <Select
      style={{ width: '100%' }}
      options={options.length ? options : undefined}
      placeholder={el.placeholder || undefined}
    />
  )
}

/** 树形下拉选择（treeselect） */
export const renderTreeSelectPreview = (el, pageType, rt) => {
  // 画布模式（move-*）：统一硬编码预览选项，不解析 data_source
  if (pageType?.startsWith('move-')) {
    return (
      <TreeSelect
        style={{ width: '100%' }}
        placeholder={el.placeholder || undefined}
        treeData={PREVIEW_OPTIONS}
      />
    )
  }
  // 运行时优先动态接口选项，其次静态 JSON；data_source 支持扁平 [{label,value}] 与树形 [{label,value,children}]
  const runtimeOptions = rt?.getOptions?.(el)
  const options = runtimeOptions?.length ? runtimeOptions : getStaticOptions(el)
  return (
    <TreeSelect
      style={{ width: '100%' }}
      treeData={options.length ? options : undefined}
      // Arco TreeSelect 的 treeData 字段名为 key/title（Select 为 value/label），
      // extractOptions 统一输出 value/title，此处通过 fieldNames 映射，
      fieldNames={{ key: 'value', title: 'title', children: 'children' }}
      placeholder={el.placeholder || undefined}
    />
  )
}

/** 单选（radio） */
export const renderRadioPreview = (el, pageType, rt) => {
  // 画布模式（move-*）：统一硬编码预览选项，不解析 data_source
  if (pageType?.startsWith('move-')) {
    return <Radio.Group style={{ width: '100%' }} options={PREVIEW_OPTIONS} />
  }
  const runtimeOptions = rt?.getOptions?.(el)
  const options = runtimeOptions?.length ? runtimeOptions : getStaticOptions(el)
  return (
    <Radio.Group style={{ width: '100%' }} options={options.length ? options : undefined} />
  )
}

/** 多选（checkbox） */
export const renderCheckboxPreview = (el, pageType, rt) => {
  // 画布模式（move-*）：统一硬编码预览选项，不解析 data_source
  if (pageType?.startsWith('move-')) {
    return <Checkbox.Group style={{ width: '100%' }} options={PREVIEW_OPTIONS} />
  }
  const runtimeOptions = rt?.getOptions?.(el)
  const options = runtimeOptions?.length ? runtimeOptions : getStaticOptions(el)
  return (
    <Checkbox.Group style={{ width: '100%' }} options={options.length ? options : undefined} />
  )
}
