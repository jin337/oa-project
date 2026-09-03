// 全局应用配置：系统名称、页面标题、登录页文案等集中管理
// 修改系统名称或登录页介绍只需改此文件，index.html / layout / Login 自动同步

// —— 系统基础信息 ——
export const APP_NAME = 'OA 管理系统'

// —— 登录页配置 ——
export const LOGIN_CONFIG = {
  // Logo 副标题（英文描述）
  logoSubtitle: 'Role-Based Access Control',
  // 主宣传标语（\n 用于换行）
  slogan: '统一身份与权限，\n让组织管理更简单',
  // 宣传描述文案
  description: '覆盖用户、角色、菜单、部门全链路管理，为团队提供安全、灵活、可扩展的权限底座。',
  // 右侧登录区欢迎语
  welcome: '欢迎使用管理系统',
  // 登录方式提示
  loginHint: '账号密码登录',
  // 底部版权信息
  copyright: '© 2026 Full Stack Project · OA',
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
// value: 唯一标识；label: 下拉展示名；needDataSource: 是否需要配置数据源；needPlaceholder: 是否需要占位提示
export const ELEMENT_TYPE_OPTIONS = [
  { value: 'input', label: '单行输入', needDataSource: false, needPlaceholder: true },
  { value: 'textarea', label: '多行文本', needDataSource: false, needPlaceholder: true },
  { value: 'number', label: '数字输入', needDataSource: false, needPlaceholder: true },
  { value: 'select', label: '下拉选择', needDataSource: true, needPlaceholder: true },
  { value: 'radio', label: '单选框', needDataSource: true, needPlaceholder: false },
  { value: 'checkbox', label: '多选框', needDataSource: true, needPlaceholder: false },
  { value: 'datepicker', label: '日期选择', needDataSource: false, needPlaceholder: true },
  { value: 'timepicker', label: '时间选择', needDataSource: false, needPlaceholder: true },
  { value: 'switch', label: '开关', needDataSource: false, needPlaceholder: false },
  { value: 'upload', label: '文件上传', needDataSource: false, needPlaceholder: false },
]
