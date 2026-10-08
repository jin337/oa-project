import { Button, Input, Radio, Upload } from '@arco-design/web-react'
import { IconUpload } from '@arco-design/web-react/icon'
import { useContext } from 'react'
import { API_PREFIX } from 'src/utils/constants'
import { RuntimeFormContext } from '../DynamicForm'

/**
 * 上传组件
 *
 * pageType 渲染策略：
 *   - form        可交互上传（实际表单填写）
 *   - move-form   画布预览（可交互形态占位）
 *   - detail      只读：展示已上传文件列表（图片用 Image，其他用链接）
 *   - move-detail 画布详情预览由 renderFormItemElement 统一拦截渲染为模拟数据（MockDetailValue）
 */
export function UploadElement({ el, pageType, value, onChange }) {
  // Arco FormItem 注入 value：直接作为受控值
  const fileList = normalizeValue(value)
  const rt = useContext(RuntimeFormContext)

  // detail：只读展示
  if (pageType === 'detail') {
    return renderUploadReadOnly(fileList, el)
  }

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
      defaultFileList={fileList}
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

// —— 工具 ——

function normalizeValue(val) {
  if (!val) return []
  if (Array.isArray(val)) return val.map(normalizeOne)
  return [normalizeOne(val)]
}

function normalizeOne(item) {
  if (typeof item === 'string') return { name: item, url: item }
  return {
    name: item.name || item.filename || '文件',
    url: item.url || item.path || '',
    uid: item.uid || '',
  }
}

/** 只读渲染：解析 JSON 字符串/数组，渲染文件链接/图片预览（供 detail 模式调用） */
export function renderUploadReadOnly(value, el) {
  let list = value
  if (typeof list === 'string') {
    try {
      list = JSON.parse(list)
    } catch {
      list = null
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

/** 运行时 renderPreview 入口：供 ELEMENT_RENDER_CONFIG 注册 */
export function renderUploadPreview(el, pageType) {
  return <UploadElement el={el} pageType={pageType} />
}

/**
 * upload 元素专属属性配置（布局管理右侧面板，作为通用配置 renderCommonSettings 的追加项）：
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
