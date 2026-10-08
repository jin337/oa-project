import {
  Button,
  Card,
  Checkbox,
  Collapse,
  Divider,
  Drawer,
  Dropdown,
  Form,
  Grid,
  Input,
  Menu,
  Message,
  Modal,
  Popconfirm,
  Popover,
  Select,
  Space,
  Table,
  Tag,
} from '@arco-design/web-react'
import {
  IconList,
  IconPlus,
  IconQuestionCircle,
  IconRefresh,
  IconSettings,
} from '@arco-design/web-react/icon'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useParams } from 'react-router-dom'
import * as apiDefinitionApi from 'src/api/apiDefinition'
import * as applicationApi from 'src/api/application'
import { fetchAll } from 'src/api/fetchAll'
import { SIZE_OPTIONS } from 'src/config/app'
import { ELEMENT_TYPE_OPTIONS } from 'src/config/app.js'
import { useTabs } from 'src/store/tab-context'
import { formatJsonQuotes } from 'src/utils/json'
import { ELEMENT_RENDER_CONFIG } from './dynamic/DynamicForm'

const FormItem = Form.Item
const Row = Grid.Row
const Col = Grid.Col
const MenuItem = Menu.Item
const CollapseItem = Collapse.Item

const MODULE_LABEL = '表单元素管理'

// 可配置列 key（操作列固定显示，不参与列设置）
const ALL_COL_KEYS = [
  'index',
  'label',
  'field_key',
  'table_key',
  'element_type',
  'default_value',
  'data_source',
  'required',
  'vis_list',
  'vis_search',
]
const EMPTY_FORM = {
  label: '',
  field_key: undefined,
  table_key: undefined,
  element_type: undefined,
  placeholder: '',
  required: false,
  default_value: '',
  validation_rule: '',
  validation_message: '',
  vis_list: true,
  vis_search: false,
  disabled_if: '',
  visible_if: '',
  data_source: {},
  actions: { on_mount: [], on_change: [], on_blur: [] },
}

// 布尔值渲染为 Tag
function BoolTag({ value, yesText = '是', noText = '否' }) {
  return value ? <Tag color="green">{yesText}</Tag> : <Tag color="gray">{noText}</Tag>
}

// JSON 字符串校验
function validateJson(value, cb) {
  if (!value) return cb()
  try {
    JSON.parse(value)
    cb()
  } catch (e) {
    cb('JSON 格式错误：' + e.message)
  }
}

// 安全 JSON 字符串化（用于编辑回填）
function safeStringify(obj) {
  if (!obj || Object.keys(obj).length === 0) return ''
  try {
    return JSON.stringify(obj, null, 2)
  } catch {
    return ''
  }
}

// 事件触发时机配置
const ACTION_TRIGGERS = [
  { key: 'on_change', label: '值改变触发' },
  { key: 'on_mount', label: '初始化触发' },
  { key: 'on_blur', label: '失焦触发' },
]

// Action 类型选项
const ACTION_TYPE_OPTIONS = [
  { value: 'set_value', label: '直接赋值' },
  { value: 'fetch_and_fill', label: '请求并填充' },
]

const ACTION_TRIGGER_KEYS = ['on_mount', 'on_change', 'on_blur']

/**
 * 「配置说明」气泡内容：按 DynamicForm.jsx 运行时的真实行为编写。
 * 说明文字含 ${} / JSON 等大括号内容，统一用字符串字面量包裹，避免被 JSX 当作表达式解析。
 */
const CONFIG_HELP_CONTENT = (
  <div className="text-xs leading-5 text-gray-600" style={{ maxHeight: 460, overflowY: 'auto' }}>
    <div className="mb-2 font-medium text-gray-800">动态表单元素配置说明</div>

    <div className="mb-1 font-medium text-gray-800">一、基础属性</div>
    <ul className="mb-3 list-disc pl-4">
      <li>
        <b className="text-gray-700">字段分类</b>：该元素所属的数据表（主表 /
        子表），决定数据写入哪张表
      </li>
      <li>
        <b className="text-gray-700">对应字段</b>
        {'：'}表中的具体列，决定数据存到哪个字段；切换数据表后需要重新选择
      </li>
      <li>
        <b className="text-gray-700">名称</b>
        {'：'}表单上显示的标签；选择字段后自动带出字段注释，可手动修改
      </li>
      <li>
        <b className="text-gray-700">元素类型</b>：决定渲染成什么控件；下拉选择 / 树选择 / 单选框 /
        多选框需要配置数据源，其余类型不需要
      </li>
      <li>
        <b className="text-gray-700">默认值</b>：新增表单时仅当该字段为空才填充。输入类填文本；下拉
        / 单选填选项的「提交值」；多选类（多选框、树选择多选）填 JSON 数组 {'["a","b"]'} 或逗号分隔
        a,b；如需按其它字段动态生成，请用下方「事件驱动与联动」的「初始化触发 + 直接赋值」
      </li>
      <li>
        <b className="text-gray-700">占位提示</b>
        {'：'}控件内的灰色提示文字；文件上传元素中作为上传区的提示语
      </li>
    </ul>

    <div className="mb-1 font-medium text-gray-800">二、校验与显示控制</div>
    <ul className="mb-3 list-disc pl-4">
      <li>
        <b className="text-gray-700">校验规则</b>：两种写法，留空表示不校验
        <div className="mt-1">① 正则：{'/^1[3-9]\\d{9}$/'}（以 / 开头，可带 i 等修饰符）</div>
        <div>
          ② 表达式：含 {'${}'}，求值为 true 才通过，如 {'${form.end_date} > ${form.start_date}'}
        </div>
      </li>
      <li>
        <b className="text-gray-700">错误提示</b>：校验不通过时的文案，留空使用默认提示
      </li>
      <li>
        <b className="text-gray-700">是否必填</b>：为空时拦截提交（详情 / 审批只读场景不生效）
      </li>
      <li>
        <b className="text-gray-700">列表列显示</b>：勾选后该字段作为列表页的一列
      </li>
      <li>
        <b className="text-gray-700">搜索项显示</b>：勾选后该字段作为列表页的搜索条件
      </li>
    </ul>

    <div className="mb-1 font-medium text-gray-800">三、动态状态控制</div>
    <ul className="mb-3 list-disc pl-4">
      <li>
        <b className="text-gray-700">动态显隐</b>：表达式为 true 时才显示该元素
      </li>
      <li>
        <b className="text-gray-700">动态禁用 / 只读</b>：表达式为 true 时禁用该控件
      </li>
      <li>
        语法：用 {'${form.字段}'} 引用表单字段值（支持点路径，如 {'${form.user.dept_id}'}）；支持{' '}
        {'=== !== == != > < >= <= && || !'} 与算术 {'+ - * / %'}
      </li>
      <li>
        可直接填 {'1'} / {'true'} 为真，{'0'} / {'false'} 为假，不必写比较表达式；也可用 {'${true}'}
        、{'${1000}'} 这类带 {'${}'} 的字面量
      </li>
      <li>
        示例：
        <div className="mt-1">{'1'}（恒为真：始终显示 / 始终禁用）</div>
        <div>{'0'}（恒为假：始终隐藏 / 不禁用）</div>
        <div>{'${form.country_id} === "CN"'}</div>
        <div>{'${form.amount} > 1000 && ${form.type} === "A"'}</div>
        <div>{'${form.user_id} === ""'}（未选择用户时禁用）</div>
      </li>
      <li>
        留空时：动态显隐默认显示、动态禁用默认不禁用；但表达式写错或求值失败按 false
        处理，动态显隐会因此把元素隐藏
      </li>
      <li>
        判断字段值注意类型：数字 {'0'} 直接写 {'${form.字段}'}{' '}
        即为假；选项「提交值」存的是字符串，值为 {'"0"'} 时 {'${form.字段}'} 仍为真，需写{' '}
        {'${form.字段} === "0"'}
      </li>
    </ul>

    <div className="mb-1 font-medium text-gray-800">
      四、数据源配置（仅下拉选择 / 树选择 / 单选框 / 多选框显示）
    </div>
    <ul className="mb-3 list-disc pl-4">
      <li>
        <b className="text-gray-700">静态数据</b>
        {'：'}手动添加选项，「显示标签」是界面文案，「提交值」是实际存库的值
      </li>
      <li>
        <b className="text-gray-700">动态接口</b>：
        <div className="mt-1">
          接口地址：支持 {'${form.xxx}'} 路径模板，如 {'/dept/list?pid=${form.parent_id}'}
        </div>
        <div>请求方法：GET / POST / PUT / DELETE</div>
        <div>
          请求参数：JSON，值支持 {'${form.xxx}'}，如 {'{"user_id":"${form.id}","page":1}'}
        </div>
        <div>
          显示标签：接口返回的单条数据用 {'${item.xxx}'} 取，如 {'${item.id}-${item.name}'}
        </div>
        <div>对应值：写入表单 / 存库的值，如 {'${item.id}'}</div>
      </li>
      <li>参数或标签里引用了 {'${form.xxx}'} 时，该字段变化会自动重新请求刷新选项</li>
      <li>
        无前缀的 {'${xxx}'} 视为表单字段简写（等价 {'${form.xxx}'}）；引用接口数据必须显式写{' '}
        {'${item.xxx}'}
      </li>
    </ul>

    <div className="mb-1 font-medium text-gray-800">五、事件驱动与联动</div>
    <div className="mb-1 text-gray-700">触发时机（每个时机可配置多条规则）</div>
    <ul className="mb-2 list-disc pl-4">
      <li>
        <b className="text-gray-700">初始化触发</b>：表单加载后执行一次，适合打开即带出的数据
      </li>
      <li>
        <b className="text-gray-700">值改变触发</b>：仅当该元素自身字段值变化时执行
      </li>
      <li>
        <b className="text-gray-700">失焦触发</b>：控件失焦时执行
      </li>
    </ul>
    <div className="mb-1 text-gray-700">动作类型</div>
    <ul className="list-disc pl-4">
      <li>
        <b className="text-gray-700">直接赋值</b>：配置多条「来源 →
        目标字段」映射，可一次写入多个字段
        <div className="mt-1">
          来源写 {'item.xxx'}：取当前选中项的字段，如 {'item.city_name'}
        </div>
        <div>来源写 {'form.xxx'}：取表单其它字段；不含前缀时按选中项字段取</div>
        <div>
          含 {'${}'} 时按拼接处理，如 {'${item.id}-${item.name}'}
        </div>
        <div>目标字段从当前数据表的字段中选择；目标等于触发字段自身时会自动跳过</div>
      </li>
      <li>
        <b className="text-gray-700">请求并填充</b>：先请求接口，再按映射填充目标字段
        <div className="mt-1">
          接口地址 / 请求方法 / 请求参数：规则同数据源，参数支持 {'${form.xxx}'} 与 {'${item.xxx}'}
        </div>
        <div>目标字段的来源是「接口响应里的字段路径」（点路径），如 {'user.city_name'}</div>
        <div>公共计算 / 转换接口 {'POST /utils/calculate'} 支持的类型：</div>
        <ul className="list-disc pl-4">
          <li className="mt-1">
            <b className="text-gray-700">{'number_to_upper'}</b>：数字转大写金额，请求{' '}
            {'{"type":"number_to_upper","value":100000}'} → 返回 {'{"result":"壹拾万元整"}'}
          </li>
          <li>
            <b className="text-gray-700">{'calc'}</b>：表达式计算（支持加减乘除取模和括号），请求{' '}
            {'{"type":"calc","value":"(100+2)*3 % 7"}'} → 返回 {'{"result":5}'}
          </li>
          <li>支持的运算：+、-、*、/、%、()；支持小数、负数，空格自动忽略</li>
        </ul>
      </li>
    </ul>
  </div>
)

// 后端 actions 对象 -> 表单结构（params 对象反序列化为 JSON 字符串）
function normalizeActionsForForm(actions) {
  const result = { on_mount: [], on_change: [], on_blur: [] }
  for (const t of ACTION_TRIGGER_KEYS) {
    const list = Array.isArray(actions?.[t]) ? actions[t] : []
    result[t] = list.map((a) => {
      const item = { ...a }
      item.params =
        item.params && typeof item.params === 'object' ? JSON.stringify(item.params, null, 2) : ''
      if (!Array.isArray(item.target_mapping)) item.target_mapping = []
      if (a.action_type === 'set_value') {
        if (Array.isArray(a.value)) {
          item.value = a.value.map((v) => ({ ...v }))
        } else {
          item.value = []
        }
      }
      return item
    })
  }
  return result
}

// 表单 actions 结构 -> 后端对象（按 action_type 只保留对应字段，过滤空项）
function buildActionsFromValues(actions) {
  const result = {}
  for (const t of ACTION_TRIGGER_KEYS) {
    const list = Array.isArray(actions?.[t]) ? actions[t] : []
    const cleaned = list
      .filter((a) => a && a.action_type)
      .map((a) => {
        const item = { action_type: a.action_type }
        if (a.action_type === 'set_value') {
          const value = (Array.isArray(a.value) ? a.value : [])
            .filter((v) => v && (v.source || v.target))
            .map((v) => ({ source: v.source || '', target: v.target || '' }))
          if (value.length) item.value = value
        } else if (a.action_type === 'fetch_and_fill') {
          if (a.api_url) item.api_url = a.api_url
          if (a.method) item.method = a.method
          item.api_ref = a.api_ref === 1 ? 1 : 0
          if (a.params && String(a.params).trim()) {
            try {
              item.params = JSON.parse(a.params)
            } catch (e) {
              // 校验失败忽略
            }
          }
          const tm = (Array.isArray(a.target_mapping) ? a.target_mapping : [])
            .filter((m) => m && (m.source || m.target))
            .map((m) => ({ source: m.source || '', target: m.target || '' }))
          if (tm.length) item.target_mapping = tm
        }
        return item
      })
      .filter((a) => Object.keys(a).length > 1) // 至少含 action_type + 一个配置字段
    if (cleaned.length) result[t] = cleaned
  }
  return result
}

export default function ElementManage() {
  const location = useLocation()
  const { id } = useParams()
  const { tabs, activeTab, addTab, updateTab } = useTabs()

  // 列表与分页
  const [list, setList] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(10)
  const [loading, setLoading] = useState(false)

  // 草稿筛选条件 + 已生效条件（禁止自动触发，手动搜索）
  const [keyword, setKeyword] = useState('')
  const [appliedKeyword, setAppliedKeyword] = useState('')

  // 表格密度 & 列可见性
  const [tableSize, setTableSize] = useState('default')
  const [visibleCols, setVisibleCols] = useState(ALL_COL_KEYS)

  // 抽屉
  const [drawerVisible, setDrawerVisible] = useState(false)
  const [editing, setEditing] = useState(null)
  const [saving, setSaving] = useState(false)
  const [form] = Form.useForm()

  // 请求参数格式化：读当前值 → 补全键值双引号 → 写回表单
  const handleFormatParams = (field) => {
    const cur = form.getFieldValue(field)
    if (cur === undefined || cur === null) return
    form.setFieldValue(field, formatJsonQuotes(cur))
  }

  // 当前选中的元素类型（用于联动控制 placeholder / data_source 的显隐）
  const [currentElementType, setCurrentElementType] = useState()
  // 数据源类型（json / api）：使用 Form.useWatch 直接监听嵌套字段，避免 onValuesChange 扁平 key 问题
  const dataSourceType = Form.useWatch('data_source.type', form)
  // 数据源是否引用接口管理（api_ref=1 时 url/method 由接口管理回填并禁用）
  const dsApiRef = Form.useWatch('data_source.api_ref', form)
  // 事件驱动 actions：监听整个对象以联动渲染每条规则的 action_type 分支
  const actionsWatch = Form.useWatch('actions', form)

  // 接口引用选择弹窗：null=关闭；{ target:'ds' }=数据源；{ target:'action', trigger, index }=联动动作
  const [apiPicker, setApiPicker] = useState(null)

  // 事件面板默认展开：有规则的分区展开，无规则时全部展开
  const defaultActiveKey = (() => {
    const withRules = ACTION_TRIGGER_KEYS.filter((k) => (actionsWatch?.[k] || []).length > 0)
    return withRules.length ? withRules : ACTION_TRIGGER_KEYS
  })()

  // 级联选项：表列表 & 字段列表
  const [tableOptions, setTableOptions] = useState([])
  const [fieldOptions, setFieldOptions] = useState([])
  const [loadingFields, setLoadingFields] = useState(false)

  // 加载分类（表名）选项：主表 + 子表（流程表结构很少变动，结果缓存避免重复请求）
  const tableOptionsCache = useRef(null)
  const loadTableOptions = useCallback(async () => {
    if (tableOptionsCache.current) return tableOptionsCache.current
    try {
      const res = await applicationApi.getApplication(id)
      const app = res.data
      const options = []
      if (app?.table_name) {
        options.push({ label: `${app.table_name}（主表）`, value: app.table_name })
      }
      if (app?.sub_table_name) {
        app.sub_table_name
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
          .forEach((t) => options.push({ label: `${t}（子表）`, value: t }))
      }
      const cached = { app, options }
      tableOptionsCache.current = cached
      setTableOptions(options)
      return cached
    } catch (e) {
      return null
    }
  }, [id])

  // 挂载时确保页签存在，并复用 /application/:id 请求结果：
  // 既更新标题为「流程名 - 模块名」，又填充表选项缓存（打开抽屉时零额外请求）
  useEffect(() => {
    addTab({ path: location.pathname, title: MODULE_LABEL })
    let cancelled = false
    loadTableOptions().then((cached) => {
      if (!cancelled && cached?.app?.name) {
        updateTab(location.pathname, { title: `${cached.app.name} - ${MODULE_LABEL}` })
      }
    })
    return () => {
      cancelled = true
    }
  }, [id, location.pathname, addTab, updateTab, loadTableOptions])

  // Card 标题与当前激活页签标题保持一致
  const currentTab = tabs.find((t) => t.path === activeTab)
  const cardTitle = currentTab?.title || MODULE_LABEL

  // 当前元素类型的配置元数据（用于联动控制 data_source 显隐）
  const typeConfig = ELEMENT_TYPE_OPTIONS.find((o) => o.value === currentElementType)
  const showDataSource = typeConfig ? typeConfig.needDataSource : false

  const fetchList = useCallback(
    async (p = page, s = size) => {
      setLoading(true)
      try {
        const params = { page: p, size: s }
        if (appliedKeyword) params.keyword = appliedKeyword
        const res = await applicationApi.listApplicationElements(id, params)
        setList(res.data.list || [])
        setTotal(res.data.total || 0)
      } catch (e) {
        // 错误已在请求层提示
      } finally {
        setLoading(false)
      }
    },
    [id, page, size, appliedKeyword],
  )

  useEffect(() => {
    fetchList()
  }, [page, size, fetchList])

  // 搜索：生效当前草稿条件，回到第一页
  const handleSearch = () => {
    setAppliedKeyword(keyword)
    setPage(1)
  }

  // 重置：清空草稿与已生效条件，回到第一页并刷新
  const handleReset = () => {
    setKeyword('')
    setAppliedKeyword('')
    setPage(1)
  }

  // 加载指定表的所有字段（取消分页限制）
  const loadFieldOptions = useCallback(
    async (tableName) => {
      if (!tableName) {
        setFieldOptions([])
        return
      }
      setLoadingFields(true)
      try {
        const res = await fetchAll((p) => applicationApi.listTableFields(id, p, tableName))
        setFieldOptions(res.data.list || [])
      } catch (e) {
        setFieldOptions([])
      } finally {
        setLoadingFields(false)
      }
    },
    [id],
  )

  // 分类变化：重置字段与名称，加载新字段列表
  const handleTableChange = (tableName) => {
    form.setFieldsValue({ field_key: undefined, label: '' })
    setFieldOptions([])
    loadFieldOptions(tableName)
  }

  // 字段变化：自动用字段注释填充名称（仍可手动修改）
  const handleFieldChange = (fieldKey) => {
    const field = fieldOptions.find((f) => f.name === fieldKey)
    if (field?.comment) {
      form.setFieldsValue({ label: field.comment })
    }
  }

  // 数据源类型切换：清理另一类型的冗余字段，避免提交无效数据
  const handleDataSourceTypeChange = (type) => {
    if (type === 'json') {
      form.setFieldsValue({
        data_source: {
          type: 'json',
          options: [],
          url: '',
          method: undefined,
          label: '',
        },
      })
    } else if (type === 'api') {
      form.setFieldsValue({
        data_source: {
          type: 'api',
          options: [],
          url: '',
          method: 'GET',
          label: '',
          params: '',
          api_ref: 0,
        },
      })
    }
  }

  // 接口引用弹窗确认：回填 method+path 并置 api_ref=1（数据源 / 联动动作共用）
  const handleApiPick = (def) => {
    if (apiPicker?.target === 'ds') {
      form.setFieldsValue({
        data_source: {
          ...(form.getFieldValue('data_source') || {}),
          url: def.path,
          method: def.method,
          api_ref: 1,
        },
      })
    } else if (apiPicker?.target === 'action') {
      const { trigger, index } = apiPicker
      const cur = form.getFieldValue('actions') || {}
      const next = JSON.parse(JSON.stringify(cur))
      if (Array.isArray(next[trigger]) && next[trigger][index]) {
        next[trigger][index] = {
          ...next[trigger][index],
          api_url: def.path,
          method: def.method,
          api_ref: 1,
        }
        form.setFieldsValue({ actions: next })
      }
    }
    setApiPicker(null)
  }

  // 取消接口引用：保留已回填的 url/method 但恢复可编辑，api_ref 置 0
  const handleApiUnref = (target, trigger, index) => {
    if (target === 'ds') {
      form.setFieldsValue({
        data_source: {
          ...(form.getFieldValue('data_source') || {}),
          api_ref: 0,
        },
      })
    } else if (target === 'action' && trigger !== undefined && index !== undefined) {
      const cur = form.getFieldValue('actions') || {}
      const next = JSON.parse(JSON.stringify(cur))
      if (Array.isArray(next[trigger]) && next[trigger][index]) {
        next[trigger][index] = { ...next[trigger][index], api_ref: 0 }
        form.setFieldsValue({ actions: next })
      }
    }
  }

  const openCreate = async () => {
    setEditing(null)
    setCurrentElementType(undefined)
    form.setFieldsValue(EMPTY_FORM)
    setFieldOptions([])
    const cached = await loadTableOptions()
    const app = cached?.app || null
    if (app?.table_name) {
      form.setFieldsValue({ table_key: app.table_name })
      await loadFieldOptions(app.table_name)
    }
    setDrawerVisible(true)
  }

  const openEdit = async (record) => {
    setEditing(record)
    setCurrentElementType(record.element_type)
    setFieldOptions([])
    await loadTableOptions()
    form.setFieldsValue({
      label: record.label || '',
      field_key: record.field_key,
      table_key: record.table_key,
      element_type: record.element_type,
      placeholder: record.placeholder || '',
      required: Boolean(record.required),
      default_value: record.default_value || '',
      validation_rule: record.validation_rule || '',
      validation_message: record.validation_message || '',
      vis_list: record.visibility?.list ?? true,
      vis_search: record.visibility?.search ?? false,
      disabled_if: record.dynamic_states?.disabled_if || '',
      visible_if: record.dynamic_states?.visible_if || '',
      data_source: {
        ...(record.data_source || {}),
        // params 为对象结构，回填时反序列化为 JSON 字符串供 TextArea 展示
        params: safeStringify(record.data_source?.params),
      },
      actions: normalizeActionsForForm(record.actions),
    })
    if (record.table_key) {
      await loadFieldOptions(record.table_key)
    }
    setDrawerVisible(true)
  }

  const handleSave = async () => {
    const values = await form.validate()
    // 组装完整数据结构
    const payload = {
      label: values.label,
      field_key: values.field_key,
      table_key: values.table_key,
      element_type: values.element_type,
      placeholder: values.placeholder,
      required: values.required ? 1 : 0,
      default_value: values.default_value,
      validation_rule: values.validation_rule || '',
      validation_message: values.validation_message || '',
      visibility: {
        list: values.vis_list ? 1 : 0,
        search: values.vis_search ? 1 : 0,
      },
      dynamic_states: Object.fromEntries(
        Object.entries({
          disabled_if: values.disabled_if,
          visible_if: values.visible_if,
        }).filter(([, v]) => v && String(v).trim() !== ''),
      ),
      // 数据源：按类型组装，过滤空值，避免提交冗余字段
      data_source: (() => {
        const ds = values.data_source || {}
        if (ds.type === 'json') {
          const options = (ds.options || []).filter((o) => o?.label || o?.value)
          return options.length ? { type: 'json', options } : {}
        }
        if (ds.type === 'api') {
          let params = {}
          if (ds.params && String(ds.params).trim()) {
            try {
              params = JSON.parse(ds.params)
            } catch (e) {
              // params 为 JSON 字符串输入，校验失败时保持空对象
            }
          }
          return {
            type: 'api',
            url: ds.url || '',
            method: ds.method || 'GET',
            label: ds.label || '',
            value_field: ds.value_field || '',
            api_ref: ds.api_ref === 1 ? 1 : 0,
            params,
          }
        }
        return {}
      })(),
      actions: buildActionsFromValues(values.actions),
    }
    setSaving(true)
    try {
      if (editing) {
        await applicationApi.updateApplicationElement(id, editing.id, payload)
        Message.success('保存成功')
      } else {
        await applicationApi.createApplicationElement(id, payload)
        Message.success('创建成功')
      }
      setDrawerVisible(false)
      fetchList()
    } catch (e) {
      // 错误已在请求层提示
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (record) => {
    try {
      await applicationApi.deleteApplicationElement(id, record.id)
      Message.success('删除成功')
      fetchList()
    } catch (e) {
      // 错误已在请求层提示
    }
  }

  // 表格密度下拉
  const sizeMenu = (
    <Menu onClickMenuItem={(key) => setTableSize(key)}>
      {SIZE_OPTIONS.map((o) => (
        <MenuItem
          key={o.value}
          style={
            o.value === tableSize
              ? { color: 'rgb(var(--arcoblue-6))', backgroundColor: 'rgb(var(--arcoblue-1))' }
              : undefined
          }
        >
          {o.label}
        </MenuItem>
      ))}
    </Menu>
  )

  const columns = [
    {
      key: 'index',
      title: '序号',
      dataIndex: 'index',
      width: 62,
      align: 'center',
      render: (_, __, index) => index + 1,
    },
    { key: 'label', title: '名称', dataIndex: 'label' },
    { key: 'field_key', title: '对应字段', dataIndex: 'field_key' },
    {
      key: 'table_key',
      title: '字段分类',
      dataIndex: 'table_key',
      render: (v) => (v ? <Tag color="arcoblue">{v}</Tag> : '-'),
    },
    { key: 'element_type', title: '元素类型', dataIndex: 'element_type' },
    {
      key: 'default_value',
      title: '默认值',
      dataIndex: 'default_value',
      render: (v) => (v === '' || v === null || v === undefined ? '-' : String(v)),
    },
    {
      key: 'data_source',
      title: '数据源',
      dataIndex: 'data_source.type',
      width: 80,
      align: 'center',
      render: (v) => (v ? <Tag color="arcoblue">{v === 'json' ? '静态' : '动态'}</Tag> : '-'),
    },
    {
      key: 'required',
      title: '必填',
      dataIndex: 'required',
      width: 90,
      align: 'center',
      render: (v) => <BoolTag value={Boolean(v)} />,
    },
    {
      key: 'vis_list',
      title: '列表列',
      dataIndex: 'visibility',
      width: 90,
      align: 'center',
      render: (v) => <BoolTag value={Boolean(v?.list)} />,
    },
    {
      key: 'vis_search',
      title: '搜索项',
      dataIndex: 'visibility',
      width: 90,
      align: 'center',
      render: (v) => <BoolTag value={Boolean(v?.search)} />,
    },
    {
      key: 'action',
      title: '操作',
      width: 140,
      render: (_, record) => (
        <Space>
          <Button size="mini" onClick={() => openEdit(record)}>
            编辑
          </Button>
          <Popconfirm
            position="lb"
            focusLock
            title="确认删除该表单元素？"
            onOk={() => handleDelete(record)}
          >
            <Button size="mini" status="danger">
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  // 列设置弹层内容
  const colSettingsPopover = (
    <Checkbox.Group value={visibleCols} onChange={setVisibleCols} direction="vertical">
      {ALL_COL_KEYS.map((k) => {
        const col = columns.find((c) => c.key === k)
        return (
          <Checkbox key={k} value={k}>
            {col?.title || k}
          </Checkbox>
        )
      })}
    </Checkbox.Group>
  )

  // 操作列固定显示，其余按 visibleCols 过滤
  const visibleColumns = columns.filter((c) => c.key === 'action' || visibleCols.includes(c.key))

  return (
    <Card title={cardTitle}>
      {/* 搜索区域 */}
      <div className="mb-3">
        <Space wrap>
          <Input
            className="w-55!"
            placeholder="按名称或字段搜索"
            allowClear
            value={keyword}
            onChange={setKeyword}
            onPressEnter={handleSearch}
          />
          <Button type="primary" onClick={handleSearch}>
            搜索
          </Button>
          <Button onClick={handleReset}>重置</Button>
        </Space>
      </div>

      {/* 表格工具栏 */}
      <div className="mb-3 flex items-center justify-between">
        <Button type="primary" icon={<IconPlus />} onClick={openCreate}>
          新增元素
        </Button>
        <Space>
          <Button size="mini" icon={<IconRefresh />} onClick={() => fetchList()}>
            刷新
          </Button>
          <Dropdown droplist={sizeMenu} position="br">
            <Button size="mini" icon={<IconList />}>
              密度
            </Button>
          </Dropdown>
          <Popover content={colSettingsPopover} position="br" trigger="click">
            <Button size="mini" icon={<IconSettings />}>
              列设置
            </Button>
          </Popover>
        </Space>
      </div>

      <Table
        rowKey="id"
        columns={visibleColumns}
        data={list}
        loading={loading}
        size={tableSize}
        pagination={{
          current: page,
          pageSize: size,
          total,
          showTotal: true,
          sizeCanChange: true,
          onChange: (p, s) => {
            setPage(p)
            setSize(s)
          },
        }}
      />

      {/* 新增/编辑抽屉 */}
      <Drawer
        title={
          <Space size={6} align="center">
            <span>{editing ? '编辑表单元素' : '新增表单元素'}</span>
            {/* Arco Popover 默认写死 style.maxWidth=350，会压窄内容，这里覆盖 */}
            <Popover
              content={CONFIG_HELP_CONTENT}
              position="br"
              trigger="hover"
              style={{ maxWidth: 600 }}
            >
              <IconQuestionCircle className="cursor-pointer text-sm text-gray-400 hover:text-gray-600" />
            </Popover>
          </Space>
        }
        visible={drawerVisible}
        width="60%"
        onOk={handleSave}
        confirmLoading={saving}
        onCancel={() => setDrawerVisible(false)}
        unmountOnExit
      >
        <Form
          form={form}
          layout="vertical"
          autoComplete="off"
          onValuesChange={(changedValues) => {
            if ('element_type' in changedValues) {
              const val = changedValues.element_type
              setCurrentElementType(val)
              const cfg = ELEMENT_TYPE_OPTIONS.find((o) => o.value === val)
              if (cfg && !cfg.needDataSource) {
                form.setFieldsValue({ data_source: {} })
                return
              }
              // 元素类型声明了数据源默认值（如 deptselect → GET /depts、userselect → GET /user-list）：
              // 强制覆盖 defaults 中声明的字段（type/url/method），未声明的字段（label/value_field/params）保留现有配置
              const defaults = ELEMENT_RENDER_CONFIG[val]?.meta?.dataSourceDefaults
              if (defaults) {
                const cur = form.getFieldValue('data_source') || {}
                form.setFieldsValue({
                  data_source: { ...cur, ...defaults, api_ref: 1 },
                })
              }
            }
          }}
        >
          <Row gutter={20}>
            {/* 字段分类 */}
            <Col span={12}>
              <FormItem
                label="字段分类"
                field="table_key"
                rules={[{ required: true, message: '请选择字段分类' }]}
              >
                <Select
                  placeholder="请选择数据表"
                  options={tableOptions}
                  onChange={handleTableChange}
                />
              </FormItem>
            </Col>
            {/* 对应字段（级联：选中表的所有字段） */}
            <Col span={12}>
              <FormItem
                label="对应字段"
                field="field_key"
                rules={[{ required: true, message: '请选择对应字段' }]}
              >
                <Select
                  placeholder="请选择字段"
                  loading={loadingFields}
                  onChange={handleFieldChange}
                >
                  {fieldOptions.map((f) => (
                    <Select.Option key={f.name} value={f.name}>
                      {f.name}
                      {f.comment ? `（${f.comment}）` : ''}
                    </Select.Option>
                  ))}
                </Select>
              </FormItem>
            </Col>
            {/* 名称（自动填充字段注释，可手动修改） */}
            <Col span={12}>
              <FormItem
                label="名称"
                field="label"
                rules={[
                  { required: true, message: '请输入名称' },
                  { minLength: 1, maxLength: 64, message: '长度 1-64 个字符' },
                ]}
              >
                <Input placeholder="选择字段后自动填充注释，可手动修改" />
              </FormItem>
            </Col>
            <Col span={12}>
              <FormItem
                label="元素类型"
                field="element_type"
                rules={[{ required: true, message: '请选择元素类型' }]}
              >
                <Select placeholder="请选择类型" allowClear options={ELEMENT_TYPE_OPTIONS} />
              </FormItem>
            </Col>
            <Col span={12}>
              <FormItem label="默认值" field="default_value">
                <Input placeholder="填文本或选项提交值；多选填 JSON 数组或逗号分隔" />
              </FormItem>
            </Col>
            <Col span={12}>
              <FormItem label="占位提示" field="placeholder">
                <Input.TextArea
                  placeholder="如：请输入或选择"
                  autoSize={{ minRows: 1, maxRows: 3 }}
                />
              </FormItem>
            </Col>
            <Col span={24}>
              <FormItem label="校验规则" field="validation_rule">
                <Input placeholder="支持表达式，如 /^1[3-9]\d{9}$/ 或 ${form.end_date} > ${form.start_date}" />
              </FormItem>
              <FormItem label="错误提示" field="validation_message">
                <Input placeholder="留空时使用默认提示（如：手机号格式不正确 / 手机号校验不通过）" />
              </FormItem>
            </Col>
            <Col span={24} className={'[&_.arco-checkbox]:mr-4 [&_.arco-checkbox]:pl-0!'}>
              <FormItem field="required" triggerPropName="checked" noStyle>
                <Checkbox>是否必填</Checkbox>
              </FormItem>
              <FormItem field="vis_list" triggerPropName="checked" noStyle>
                <Checkbox>列表列显示</Checkbox>
              </FormItem>
              <FormItem field="vis_search" triggerPropName="checked" noStyle>
                <Checkbox>搜索项显示</Checkbox>
              </FormItem>
            </Col>
          </Row>

          <Divider>动态状态控制</Divider>

          {/* 动态状态控制：拆解为 3 个独立表达式输入框 */}
          <FormItem label="动态显隐" field="visible_if">
            <Input.TextArea
              autoSize={{ minRows: 1, maxRows: 5 }}
              placeholder='支持表达式，如 ${form.country_id} === "CN"；也可直接填 1 显示 / 0 隐藏'
            />
          </FormItem>

          <FormItem label="动态禁用/只读" field="disabled_if">
            <Input.TextArea
              autoSize={{ minRows: 1, maxRows: 5 }}
              placeholder='支持表达式，如 ${form.user_id} === ""；也可直接填 1 禁用 / 0 不禁用'
            />
          </FormItem>

          {showDataSource && (
            <>
              <Divider>数据源配置</Divider>
              <Row gutter={20}>
                <Col span={dataSourceType === 'api' ? 16 : 24}>
                  <FormItem
                    label="数据类型"
                    field="data_source.type"
                    rules={[{ required: true, message: '请选择数据类型' }]}
                  >
                    <Select placeholder="请选择" onChange={handleDataSourceTypeChange}>
                      <Select.Option value="json">静态数据</Select.Option>
                      <Select.Option value="api">动态接口</Select.Option>
                    </Select>
                  </FormItem>
                </Col>
                <Col span={8}>
                  <FormItem label="引用接口" hidden={dataSourceType !== 'api'}>
                    <Button
                      long
                      size="small"
                      type="outline"
                      className="mt-1"
                      onClick={() => setApiPicker({ target: 'ds' })}
                    >
                      {dsApiRef === 1 ? '重新引用' : '引用接口'}
                    </Button>
                  </FormItem>
                </Col>
              </Row>
              {/* 静态数据：选项列表，支持动态增删 */}
              {dataSourceType === 'json' && (
                <Form.List field="data_source.options">
                  {(fields, { add, remove }) => (
                    <div>
                      {fields.length > 0 && (
                        <div className="mb-3 rounded border border-gray-200 bg-white p-3">
                          {fields.map((item, index) => (
                            <div
                              key={item.key}
                              className={`${index === 0 ? '' : 'mt-2'} flex items-center gap-2`}
                            >
                              <FormItem
                                field={item.field + '.label'}
                                noStyle
                                className="mb-0! flex-1"
                              >
                                <Input placeholder="显示标签，如：男" />
                              </FormItem>
                              <FormItem
                                field={item.field + '.value'}
                                noStyle
                                className="mb-0! flex-1"
                              >
                                <Input placeholder="提交值，如：1" />
                              </FormItem>
                              <Button status="danger" onClick={() => remove(index)}>
                                删除
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                      <Button type="outline" onClick={() => add({ label: '', value: '' })}>
                        + 添加选项
                      </Button>
                    </div>
                  )}
                </Form.List>
              )}

              {/* 动态接口：url / method / params / label / value 表达式 */}
              {dataSourceType === 'api' && (
                <Row gutter={20}>
                  <Col span={24}>
                    {/* 注册 api_ref 字段（hidden 隐藏但保留在表单 store，供保存归一化） */}
                    <FormItem field="data_source.api_ref" hidden>
                      <Input />
                    </FormItem>
                    {dsApiRef === 1 && (
                      <div className="mb-2 flex items-center justify-between rounded border border-orange-200 bg-orange-50 px-2 py-1 text-xs text-orange-600">
                        <span>
                          已引用接口：
                          <b>
                            {form.getFieldValue('data_source')?.method}{' '}
                            {form.getFieldValue('data_source')?.url}
                          </b>
                          ，接口地址与请求方法由接口管理维护，不可手动修改
                        </span>
                        <Button size="mini" type="text" onClick={() => handleApiUnref('ds')}>
                          取消引用
                        </Button>
                      </div>
                    )}
                  </Col>
                  <Col span={16}>
                    <FormItem
                      label="接口地址"
                      field="data_source.url"
                      rules={[{ required: true, message: '请输入接口地址' }]}
                    >
                      <Input placeholder="/user/list" disabled={dsApiRef === 1} />
                    </FormItem>
                  </Col>
                  <Col span={8}>
                    <FormItem label="请求方法" field="data_source.method">
                      <Select disabled={dsApiRef === 1}>
                        <Select.Option value="GET">GET</Select.Option>
                        <Select.Option value="POST">POST</Select.Option>
                        <Select.Option value="PUT">PUT</Select.Option>
                        <Select.Option value="DELETE">DELETE</Select.Option>
                      </Select>
                    </FormItem>
                  </Col>
                  <Col span={24}>
                    <FormItem
                      label={
                        <span className="flex w-full items-center justify-between">
                          <span>请求参数</span>
                          <Button
                            type="text"
                            size="mini"
                            onClick={() => handleFormatParams('data_source.params')}
                          >
                            格式化
                          </Button>
                        </span>
                      }
                      field="data_source.params"
                      rules={[{ validator: validateJson }]}
                    >
                      <Input.TextArea
                        placeholder='{"user_id":"${form.id}","page":1}'
                        autoSize={{ minRows: 1, maxRows: 5 }}
                      />
                    </FormItem>
                  </Col>
                  <Col span={12}>
                    <FormItem label="显示标签" field="data_source.label">
                      <Input placeholder="支持表达式，如 ${item.id}-${item.name}" />
                    </FormItem>
                  </Col>
                  <Col span={12}>
                    <FormItem label="对应值" field="data_source.value_field">
                      <Input placeholder="支持表达式，如 ${item.id}" />
                    </FormItem>
                  </Col>
                </Row>
              )}
            </>
          )}

          <Divider>事件驱动与联动</Divider>

          {/* 三个触发时机分区：on_mount / on_change / on_blur（折叠面板） */}
          <Collapse defaultActiveKey={defaultActiveKey} className="mb-4">
            {ACTION_TRIGGERS.map((trigger) => (
              <CollapseItem
                key={trigger.key}
                name={trigger.key}
                header={trigger.label}
                className={'[&_.arco-collapse-item-content-box]:pl-3.25!'}
              >
                <Form.List field={`actions.${trigger.key}`}>
                  {(fields, { add, remove }) => (
                    <>
                      {fields.length === 0 && (
                        <div className="mb-2 text-xs text-gray-400">暂无规则，点击下方按钮添加</div>
                      )}
                      {fields.map((item, index) => {
                        // 从 watch 结果获取当前规则的 action_type，联动显示对应配置字段
                        const actionType = actionsWatch?.[trigger.key]?.[index]?.action_type
                        return (
                          <div
                            key={item.key}
                            className="mb-3 rounded border border-gray-200 bg-white p-3"
                          >
                            <div className="mb-2 flex items-center justify-between">
                              <span className="text-xs font-medium text-gray-500">
                                规则 {index + 1}
                              </span>
                              <Button size="mini" status="danger" onClick={() => remove(index)}>
                                删除
                              </Button>
                            </div>
                            <Row gutter={16}>
                              <Col span={actionType === 'fetch_and_fill' ? 16 : 24}>
                                <FormItem
                                  label="动作类型"
                                  field={item.field + '.action_type'}
                                  rules={[{ required: true, message: '请选择动作类型' }]}
                                >
                                  <Select
                                    placeholder="请选择动作类型"
                                    options={ACTION_TYPE_OPTIONS}
                                  />
                                </FormItem>
                              </Col>
                              <Col span={8}>
                                <FormItem label="引用接口" hidden={actionType !== 'fetch_and_fill'}>
                                  <Button
                                    long
                                    size="small"
                                    type="outline"
                                    className="mt-1"
                                    onClick={() =>
                                      setApiPicker({
                                        target: 'action',
                                        trigger: trigger.key,
                                        index,
                                      })
                                    }
                                  >
                                    {actionsWatch?.[trigger.key]?.[index]?.api_ref === 1
                                      ? '重新引用'
                                      : '引用接口'}
                                  </Button>
                                </FormItem>
                              </Col>
                            </Row>

                            {/* set_value：直接赋值（多字段映射） */}
                            {actionType === 'set_value' && (
                              <>
                                <div className="mb-2 text-gray-500">赋值映射</div>
                                <Form.List field={item.field + '.value'}>
                                  {(valueFields, { add: addValue, remove: removeValue }) => (
                                    <>
                                      {valueFields.map((vf, vfIndex) => (
                                        <div key={vf.key} className="mb-2 flex items-center gap-2">
                                          <FormItem
                                            field={vf.field + '.source'}
                                            noStyle
                                            className="mb-0! flex-1"
                                          >
                                            <Input placeholder="来源，如 user.city_name" />
                                          </FormItem>
                                          <span className="text-gray-400">→</span>
                                          <FormItem
                                            field={vf.field + '.target'}
                                            noStyle
                                            className="mb-0! flex-1"
                                          >
                                            <Select
                                              placeholder="请选择字段"
                                              loading={loadingFields}
                                            >
                                              {fieldOptions.map((f) => (
                                                <Select.Option key={f.name} value={f.name}>
                                                  {f.name}
                                                  {f.comment ? `（${f.comment}）` : ''}
                                                </Select.Option>
                                              ))}
                                            </Select>
                                          </FormItem>
                                          <Button
                                            status="danger"
                                            onClick={() => removeValue(vfIndex)}
                                          >
                                            删除
                                          </Button>
                                        </div>
                                      ))}
                                      <Button
                                        size="small"
                                        type="outline"
                                        onClick={() => addValue({ source: '', target: '' })}
                                      >
                                        + 添加赋值映射
                                      </Button>
                                    </>
                                  )}
                                </Form.List>
                              </>
                            )}

                            {/* fetch_and_fill：请求并填充 */}
                            {actionType === 'fetch_and_fill' && (
                              <>
                                {/* 注册 api_ref 字段（hidden 隐藏但保留在表单 store，供保存归一化） */}
                                <FormItem field={item.field + '.api_ref'} hidden>
                                  <Input />
                                </FormItem>
                                {actionsWatch?.[trigger.key]?.[index]?.api_ref === 1 && (
                                  <div className="mb-2 flex items-center justify-between rounded border border-orange-200 bg-orange-50 px-2 py-1 text-xs text-orange-600">
                                    <span>
                                      已引用接口：
                                      <b>
                                        {actionsWatch?.[trigger.key]?.[index]?.method}{' '}
                                        {actionsWatch?.[trigger.key]?.[index]?.api_url}
                                      </b>
                                      ，接口地址与请求方法由接口管理维护，不可手动修改
                                    </span>
                                    <Button
                                      size="mini"
                                      type="text"
                                      onClick={() => handleApiUnref('action', trigger.key, index)}
                                    >
                                      取消引用
                                    </Button>
                                  </div>
                                )}
                                <Row gutter={16}>
                                  <Col span={16}>
                                    <FormItem
                                      label="接口地址"
                                      field={item.field + '.api_url'}
                                      rules={[{ required: true, message: '请输入接口地址' }]}
                                    >
                                      <Input
                                        placeholder="/user/salary-detail"
                                        disabled={
                                          actionsWatch?.[trigger.key]?.[index]?.api_ref === 1
                                        }
                                      />
                                    </FormItem>
                                  </Col>
                                  <Col span={8}>
                                    <FormItem
                                      label="请求方法"
                                      field={item.field + '.method'}
                                      rules={[{ required: true, message: '请选择请求方法' }]}
                                    >
                                      <Select
                                        disabled={
                                          actionsWatch?.[trigger.key]?.[index]?.api_ref === 1
                                        }
                                      >
                                        <Select.Option value="GET">GET</Select.Option>
                                        <Select.Option value="POST">POST</Select.Option>
                                        <Select.Option value="PUT">PUT</Select.Option>
                                        <Select.Option value="DELETE">DELETE</Select.Option>
                                      </Select>
                                    </FormItem>
                                  </Col>
                                  <Col span={24}>
                                    <FormItem
                                      label={
                                        <span className="flex w-full items-center justify-between">
                                          <span>请求参数</span>
                                          <Button
                                            type="text"
                                            size="mini"
                                            onClick={() =>
                                              handleFormatParams(item.field + '.params')
                                            }
                                          >
                                            格式化
                                          </Button>
                                        </span>
                                      }
                                      field={item.field + '.params'}
                                      rules={[{ validator: validateJson }]}
                                    >
                                      <Input.TextArea
                                        placeholder='{"user_id":"${form.user_id}"}'
                                        autoSize={{ minRows: 1, maxRows: 5 }}
                                      />
                                    </FormItem>
                                  </Col>
                                </Row>
                                <div className="mb-2 text-gray-500">目标字段</div>
                                <Form.List field={item.field + '.target_mapping'}>
                                  {(tmFields, { add: addTm, remove: removeTm }) => (
                                    <>
                                      {tmFields.map((tm, tmIndex) => (
                                        <div key={tm.key} className="mb-2 flex items-center gap-2">
                                          <FormItem
                                            field={tm.field + '.source'}
                                            noStyle
                                            className="mb-0! flex-1"
                                          >
                                            <Input placeholder="来源，如 user.city_name" />
                                          </FormItem>
                                          <span className="text-gray-400">→</span>
                                          <FormItem
                                            field={tm.field + '.target'}
                                            noStyle
                                            className="mb-0! flex-1"
                                          >
                                            <Select
                                              placeholder="请选择字段"
                                              loading={loadingFields}
                                            >
                                              {fieldOptions.map((f) => (
                                                <Select.Option key={f.name} value={f.name}>
                                                  {f.name}
                                                  {f.comment ? `（${f.comment}）` : ''}
                                                </Select.Option>
                                              ))}
                                            </Select>
                                          </FormItem>
                                          <Button status="danger" onClick={() => removeTm(tmIndex)}>
                                            删除
                                          </Button>
                                        </div>
                                      ))}
                                      <Button
                                        size="small"
                                        type="outline"
                                        onClick={() => addTm({ source: '', target: '' })}
                                      >
                                        + 添加目标字段
                                      </Button>
                                    </>
                                  )}
                                </Form.List>
                              </>
                            )}
                          </div>
                        )
                      })}
                      <Button
                        size="small"
                        type="outline"
                        icon={<IconPlus />}
                        onClick={() => add({ action_type: undefined })}
                      >
                        添加规则
                      </Button>
                    </>
                  )}
                </Form.List>
              </CollapseItem>
            ))}
          </Collapse>
        </Form>
      </Drawer>

      {/* 接口引用选择弹窗（数据源 / 联动动作共用） */}
      <ApiRefModal
        visible={apiPicker !== null}
        onCancel={() => setApiPicker(null)}
        onSelect={handleApiPick}
      />
    </Card>
  )
}

// 接口引用选择弹窗：从接口管理中单选一个接口，回填 method+path
function ApiRefModal({ visible, onCancel, onSelect }) {
  const [defs, setDefs] = useState([])
  const [loading, setLoading] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [method, setMethod] = useState('')
  const [selected, setSelected] = useState(null)

  useEffect(() => {
    if (!visible) return
    setLoading(true)
    setKeyword('')
    setMethod('')
    setSelected(null)
    apiDefinitionApi
      .listApiDefinitions({ page: 1, size: 500 })
      .then((res) => setDefs(res.data?.list || []))
      .catch(() => setDefs([]))
      .finally(() => setLoading(false))
  }, [visible])

  const filtered = defs.filter((d) => {
    if (method && d.method !== method) return false
    if (keyword) {
      const kw = keyword.toLowerCase()
      return (d.name || '').toLowerCase().includes(kw) || (d.path || '').toLowerCase().includes(kw)
    }
    return true
  })

  const columns = [
    {
      key: 'method',
      title: '方法',
      dataIndex: 'method',
      width: 80,
      render: (m) => <Tag color="arcoblue">{m || 'GET'}</Tag>,
    },
    { key: 'path', title: '对外路径', dataIndex: 'path', ellipsis: true },
    {
      key: 'name',
      title: '接口名称',
      dataIndex: 'name',
      ellipsis: true,
    },
  ]

  return (
    <Modal
      unmountOnExit
      title="引用接口"
      visible={visible}
      onCancel={onCancel}
      zIndex={2000}
      style={{ width: 560 }}
      footer={
        <>
          <Button onClick={onCancel}>取消</Button>
          <Button type="primary" disabled={!selected} onClick={() => onSelect(selected)}>
            确认引用
          </Button>
        </>
      }
    >
      <div className="mb-2 flex gap-2">
        <Input placeholder="搜索接口名称 / 路径" value={keyword} onChange={setKeyword} allowClear />
        <Select
          placeholder="方法"
          value={method}
          onChange={setMethod}
          style={{ width: 120 }}
          allowClear
        >
          <Select.Option value="GET">GET</Select.Option>
          <Select.Option value="POST">POST</Select.Option>
          <Select.Option value="PUT">PUT</Select.Option>
          <Select.Option value="DELETE">DELETE</Select.Option>
        </Select>
      </div>
      <Table
        rowKey="id"
        size="small"
        loading={loading}
        pagination={false}
        data={filtered}
        columns={columns}
        scroll={{ y: 360 }}
        rowSelection={{
          type: 'radio',
          selectedRowKeys: selected ? [selected.id] : [],
          onChange: (keys, rows) => setSelected(rows[0]),
        }}
      />
    </Modal>
  )
}
