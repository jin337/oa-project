import { Button, Input, Radio, Tag, Upload } from '@arco-design/web-react'
import { useContext } from 'react'
import { RuntimeFormContext } from '../DynamicForm'

/**
 * 上传组件
 *
 * pageType 渲染策略：
 *   - form        可交互上传（实际表单填写）
 *   - move-form   画布预览（可交互形态占位）
 *   - detail      只读：展示已上传文件列表（图片用 Image，其他用链接）
 *   - move-detail 画布只读预览（占位）
 */
export function UploadElement({ el, pageType, value, onChange }) {
  // Arco FormItem 注入 value：直接作为受控值
  const fileList = normalizeValue(value)
  const rt = useContext(RuntimeFormContext)

  // detail / move-detail：只读展示
  if (pageType === 'detail') {
    return renderUploadReadOnly(fileList)
  }
  if (pageType === 'move-detail') {
    if (fileList.length > 0) return renderUploadReadOnly(fileList)
    return renderUploadReadOnly([
      { uid: '-1', name: '文件1.pdf', url: '' },
      { uid: '-2', name: '文件2.pdf', url: '' },
    ])
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

  return (
    <Upload
      action="/api/v1/upload"
      headers={{ Authorization: `Bearer ${token}` }}
      data={{ app_code: appCode }}
      tip={el?.placeholder || undefined}
      defaultFileList={fileList}
      onChange={handleChange}
      multiple={el?.multiple !== false}
      accept={el?.accept || undefined}
      limit={el?.multiple !== false ? undefined : 1}
    >
      <Button type="primary">{el?.buttonText || '点击上传'}</Button>
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
export function renderUploadReadOnly(value) {
  let list = value
  if (typeof list === 'string') {
    try {
      list = JSON.parse(list)
    } catch {
      list = null
    }
  }
  if (!Array.isArray(list) || list.length === 0) return <span className="text-gray-400">-</span>
  return (
    <div className="flex flex-col gap-1">
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

// 元素宽度占比（24 栅格，短标签适配按钮式 Radio）
const WIDTH_OPTIONS = [
  { value: 24, label: '整行' },
  { value: 12, label: '1/2' },
  { value: 8, label: '1/3' },
  { value: 16, label: '2/3' },
  { value: 6, label: '1/4' },
  { value: 18, label: '3/4' },
]

/** 运行时 renderPreview 入口：供 ELEMENT_RENDER_CONFIG 注册 */
export function renderUploadPreview(el, pageType) {
  return <UploadElement el={el} pageType={pageType} />
}

/**
 * upload 元素专属属性配置（布局管理右侧面板）：
 * 除通用的元素类型/字段名称/宽度占比外，额外提供上传模式、文件类型、大小限制。
 */
export function renderUploadSettings({ selectedElement, updateSelectedElement }) {
  return (
    <>
      <div>
        <div className="mb-2 text-sm text-gray-600">元素类型</div>
        <Tag color="arcoblue" size="mini">
          文件上传
        </Tag>
      </div>
      <div>
        <div className="mb-2 text-sm text-gray-600">字段名称</div>
        <Input
          size="mini"
          value={selectedElement.label || ''}
          onChange={(v) => updateSelectedElement({ label: v })}
          placeholder="请输入字段名称"
        />
      </div>
      <div>
        <div className="mb-2 text-sm text-gray-600">宽度占比</div>
        <Radio.Group
          size="mini"
          type="button"
          value={selectedElement.width}
          onChange={(v) => updateSelectedElement({ width: v })}
        >
          {WIDTH_OPTIONS.map((opt) => (
            <Radio key={opt.value} value={opt.value}>
              {opt.label}
            </Radio>
          ))}
        </Radio.Group>
      </div>
      <div>
        <div className="mb-2 text-sm text-gray-600">按钮文字</div>
        <Input
          size="mini"
          value={selectedElement.buttonText || ''}
          onChange={(v) => updateSelectedElement({ buttonText: v })}
          placeholder="留空默认：点击上传"
        />
      </div>
      <div>
        <div className="mb-2 text-sm text-gray-600">上传模式</div>
        <Radio.Group
          size="mini"
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
          size="mini"
          value={selectedElement.accept || ''}
          onChange={(v) => updateSelectedElement({ accept: v })}
          placeholder="如 .png,.jpg,.pdf，留空不限制"
        />
      </div>
    </>
  )
}
