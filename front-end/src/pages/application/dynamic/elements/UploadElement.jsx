import { Button, Input, Radio, Upload } from '@arco-design/web-react'
import { IconUpload } from '@arco-design/web-react/icon'
import { useContext } from 'react'
import { ELEMENT_TYPE_OPTIONS } from 'src/config/app.js'
import { API_PREFIX } from 'src/utils/constants'
import { RuntimeFormContext } from '../DynamicForm'

/**
 * 上传组件（upload 元素完整实现，独立文件与渲染配置中心 elementConfig 解耦）：
 *
 * pageType 渲染策略：
 *   - form        可交互上传（实际表单填写）
 *   - move-form   画布预览（可交互形态占位，禁用交互）
 *   - detail / move-detail 只读回显由 renderFormItemElement 统一拦截：经 ReadonlyValue →
 *     UploadReadOnly 渲染文件列表（move-detail 注入 UploadMockValue 模拟文件数组）
 *
 * 导出清单：
 *   - UploadElement         表单渲染主组件（含 detail 只读分派）
 *   - renderUploadPreview   ELEMENT_RENDER_CONFIG 注册入口
 *   - UploadReadOnly        只读展示（READONLY_RENDERERS 注册）
 *   - UploadMockValue       模拟值生成器（MOCK_GENERATORS 注册，按 multiple 派生 1/2 条）
 *   - renderUploadSettings  表单设置布局右侧属性面板（renderCommonSettings 追加项）
 */

// ==================== 数据工具 ====================

/** 将受控值归一为文件数组（真实存储可能是 JSON 字符串 / 数组 / 单个对象） */
function normalizeValue(val) {
  if (val == null || val === '') return []
  // 数据库里可能是 JSON 字符串：'[{...}]' 或 '{...}'
  if (typeof val === 'string') {
    const s = val.trim()
    if (s.startsWith('[') || s.startsWith('{')) {
      try {
        const parsed = JSON.parse(s)
        return normalizeValue(parsed)
      } catch (e) {
        // 不是合法 JSON，按普通字符串路径处理
      }
    }
    return [normalizeOne(val)]
  }
  if (Array.isArray(val)) return val.map(normalizeOne)
  return [normalizeOne(val)]
}

/** 单个文件对象归一：兼容 {name,url,uid,size} 与 {filename,path} 两种形态，缺省补 uid */
function normalizeOne(item, i) {
  if (item == null) return { name: '', url: '', uid: `f_${i}_${Date.now()}` }
  if (typeof item === 'string') return { name: item, url: item, uid: `f_${i}_${Date.now()}` }
  return {
    name: item.name || item.filename || '文件',
    url: item.url || item.path || '',
    uid: item.uid || item.uid === 0 ? item.uid : `f_${i}_${item.url || item.name || Math.random().toString(36).slice(2)}`,
    size: item.size || 0,
  }
}

// ==================== 表单渲染 ====================

export function UploadElement({ el, pageType, value, onChange }) {
  // Arco FormItem 注入 value：直接作为受控值
  const fileList = normalizeValue(value)
  const rt = useContext(RuntimeFormContext)

  // move-detail（画布详情预览）：只读展示
  if (pageType === 'move-detail') {
    return <UploadReadOnly value={fileList} el={el} />
  }

  // detail：审批待办 perm=2 时由上游直接走本渲染入口（否则统一拦截为 ReadonlyValue），
  // 这里渲染可交互上传控件；form / detail 可编辑共用下方 Upload
  // form / move-form：可交互上传
  const token = localStorage.getItem('rbac_token') || ''
  const appCode = rt?.appCode || 'common'

  // onChange(fileList, file)：file 是当前操作的文件，上传成功后 file.response 含后端返回
  // 用 file（带 response）直接替换 list 里对应项，避免受控模式下 list 里 file 过期
  const handleChange = (list) => {
    // 每个文件都检查自己的 response，合并 url/name/size
    const merged = (list || []).map((f) => {
      const data = f?.response?.data || {}
      return {
        uid: f.uid,
        name: data.name || f.name,
        url: data.url || f.url || '',
        size: data.size || f.size || 0,
      }
    })
    onChange?.(merged)
  }

  // 处理 tip：如果有换行符，就用 div 包裹每一行
  const renderTip = () => {
    const placeholder = el?.placeholder
    if (!placeholder) return undefined
    // 如果包含换行符，就按换行分割并用 div 包裹
    if (placeholder.includes('\n')) {
      return (
        <div>
          {placeholder.split('\n').map((line, index) => (
            <div key={index}>{line}</div>
          ))}
        </div>
      )
    }
    // 没有换行符，直接返回文本
    return placeholder
  }

  return (
    <Upload
      action={`${API_PREFIX}/upload`}
      headers={{ Authorization: `Bearer ${token}` }}
      data={{ app_code: appCode }}
      tip={renderTip()}
      fileList={fileList}
      onChange={handleChange}
      multiple={el?.multiple !== false}
      accept={el?.accept || undefined}
      limit={el?.multiple !== false ? undefined : 1}
      disabled={pageType === 'move-form'}
    >
      <Button type="primary" icon={<IconUpload />}>{el?.buttonText || '添加文件'}</Button>
    </Upload>
  )
}

/** 运行时 renderPreview 入口：供 ELEMENT_RENDER_CONFIG 注册 */
export function renderUploadPreview(el, pageType) {
  return <UploadElement el={el} pageType={pageType} />
}

// ==================== 只读展示 ====================

/** 上传只读展示（与 DeptReadOnly / UserReadOnly 同款命名）：
 * 解析 JSON 字符串/数组，渲染文件链接/图片预览（供 detail / move-detail 模式调用）；
 * 非 JSON 的普通字符串（如画布 mock 示例值）兜底为单条文件链接，避免显示空态 */
export function UploadReadOnly({ value, el }) {
  let list = value
  if (typeof list === 'string') {
    try {
      list = JSON.parse(list)
    } catch {
      list = [{ name: value }]
    }
  }

  // 处理 placeholder：如果有换行符，就按换行分割并用 div 包裹
  const renderPlaceholder = () => {
    const placeholder = el?.placeholder
    if (!placeholder) return null
    if (placeholder.includes('\n')) {
      return (
        <div className="mt-1 text-xs text-gray-400">
          {placeholder.split('\n').map((line, index) => (
            <div key={index}>{line}</div>
          ))}
        </div>
      )
    }
    return <div className="mt-1 text-xs text-gray-400">{placeholder}</div>
  }

  if (!Array.isArray(list) || list.length === 0) {
    return (
      <div>
        {renderPlaceholder()}
        <span className="text-gray-400">-</span>
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-1">
      {renderPlaceholder()}
      {list.map((f, i) => {
        const url = f?.url || ''
        const name = f?.name || url
        const isImg = /\.(png|jpg|jpeg|gif|webp|bmp)$/i.test(name)
        return isImg ? (
          <a
            key={i}
            href={url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1"
          >
            <img src={url} alt={name} className="h-6 w-6 rounded border object-cover" /> {name}
          </a>
        ) : (
          <a
            key={i}
            href={url}
            target="_blank"
            rel="noreferrer"
            className="break-all text-blue-600"
          >
            {name}
          </a>
        )
      })}
    </div>
  )
}

// ==================== 模拟数据 ====================

/** 上传类型专属模拟值生成器（供 getMockDetailValue 注册表按 element_type 分派）：
 * 接收元素配置 el，按 multiple（上传模式）派生条数：单选返回 1 条、多选返回 2 条；
 * 返回文件数组（与真实上传存储结构同构，UploadReadOnly 走正常数组路径渲染蓝色链接）；
 * 文件名取 ELEMENT_TYPE_OPTIONS 注册的 upload mockDetailValue，多选第二条带序号派生 */
export const UploadMockValue = (el) => {
  const base =
    ELEMENT_TYPE_OPTIONS.find((o) => o.value === 'upload')?.mockDetailValue ?? '示例附件.pdf'
  const count = el?.multiple ? 2 : 1
  return Array.from({ length: count }, (_, i) => ({
    name: i === 0 ? base : base.replace(/\.(\w+)$/, '2.$1'),
    url: '',
  }))
}

// ==================== 配置面板 ====================

/**
 * upload 元素专属属性配置（表单设置布局右侧面板，作为通用配置 renderCommonSettings 的追加项）：
 * 按钮文字、上传模式、允许文件类型。
 * 通用三项（元素类型 / 字段名称 / 宽度占比）由 renderElementSettings 组合 renderCommonSettings 渲染。
 */
export function renderUploadSettings({ selectedElement, updateSelectedElement }) {
  return (
    <>
      <div>
        <div className="mb-2 text-sm text-gray-600">按钮文字</div>
        <Input
          value={selectedElement.buttonText || ''}
          onChange={(v) => updateSelectedElement({ buttonText: v })}
          placeholder="留空默认：添加文件"
        />
      </div>
      <div>
        <div className="mb-2 text-sm text-gray-600">上传模式</div>
        <Radio.Group
          type="button"
          value={selectedElement.multiple ? 'multiple' : 'single'}
          onChange={(v) => updateSelectedElement({ multiple: v === 'multiple' })}
          options={[
            { label: '单选', value: 'single' },
            { label: '多选', value: 'multiple' },
          ]}
        />
      </div>
      <div>
        <div className="mb-2 text-sm text-gray-600">允许文件类型</div>
        <Input
          value={selectedElement.accept || ''}
          onChange={(v) => updateSelectedElement({ accept: v })}
          placeholder="如 .png,.jpg,.pdf，留空不限制"
        />
      </div>
    </>
  )
}
