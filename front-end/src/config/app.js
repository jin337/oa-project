// 全局应用配置：系统名称、页面标题、登录页文案等集中管理
// 修改系统名称或登录页介绍只需改此文件，index.html / layout / Login 自动同步

// —— 系统基础信息 ——
export const APP_NAME = 'OA 管理系统'

// —— 登录页配置 ——
export const LOGIN_CONFIG = {
  // Logo 副标题（英文描述）
  logoSubtitle: 'OA Management System',
  // 主宣传标语（\n 用于换行）
  slogan: '统一身份与权限，\n让组织管理更简单',
  // 宣传描述文案
  description: '覆盖用户、角色、菜单、部门全链路管理，为团队提供安全、灵活、可扩展的权限底座。',
  // 右侧登录区欢迎语
  welcome: '欢迎使用管理系统',
  // 登录方式提示
  loginHint: '账号密码登录',
  // 底部版权信息
  copyright: '© 2026 Management System · OA',
  // 核心功能亮点（icon 为 Arco 图标组件名，在 Login.jsx 中映射为实际组件）
  features: [
    {
      icon: 'IconUserGroup',
      title: '用户与组织管理',
      desc: '部门树形结构，账号与角色一站式维护',
    },
    {
      icon: 'IconLock',
      title: '细粒度权限控制',
      desc: '菜单、按钮、数据范围多维度授权',
    },
    {
      icon: 'IconApps',
      title: '灵活的角色体系',
      desc: 'OA 模型自由组合，权限随角色一键下发',
    },
  ],
}

// —— 表单元素类型配置 ——
// value: 唯一标识；label: 下拉展示名；needDataSource: 是否需要配置数据源；
// mockDetailValue: 布局管理"详情页"画布预览的示例值（与元素类型一一对应）
export const ELEMENT_TYPE_OPTIONS = [
  { value: 'input', label: '单行输入', needDataSource: false, mockDetailValue: '示例文本' },
  { value: 'textarea', label: '多行文本', needDataSource: false, mockDetailValue: '示例多行文本' },
  { value: 'number', label: '数字输入', needDataSource: false, mockDetailValue: '100' },
  { value: 'select', label: '下拉选择', needDataSource: true, mockDetailValue: '选项一' },
  { value: 'treeselect', label: '树选择', needDataSource: true, mockDetailValue: '选项一' },
  { value: 'radio', label: '单选框', needDataSource: true, mockDetailValue: '选项一' },
  { value: 'checkbox', label: '多选框', needDataSource: true, mockDetailValue: '选项一, 选项二' },
  { value: 'datepicker', label: '日期选择', needDataSource: false, mockDetailValue: '2026-10-08' },
  { value: 'timepicker', label: '时间选择', needDataSource: false, mockDetailValue: '14:30' },
  { value: 'switch', label: '开关', needDataSource: false, mockDetailValue: '是' },
  { value: 'upload', label: '文件上传', needDataSource: false, mockDetailValue: '示例附件.pdf' },
  { value: 'deptselect', label: '部门选择', needDataSource: true, mockDetailValue: '公司' },
  { value: 'userselect', label: '人员选择', needDataSource: true, mockDetailValue: 'admin' },
]

// —— 表格密度选项 ——
// 各管理页表格密度切换（默认 / 中等 / 紧凑 / 迷你）统一来源
export const SIZE_OPTIONS = [
  { label: '默认', value: 'default' },
  { label: '中等', value: 'middle' },
  { label: '紧凑', value: 'small' },
  { label: '迷你', value: 'mini' },
]
