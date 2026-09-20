# front-end

OA 管理系统前端，承接同级目录 `back-end`（Go + Gin 服务，默认端口 8180）的全部业务界面。覆盖 **RBAC 系统管理**（用户/角色/菜单/部门）、**低代码应用配置**（数据表/表单元素/布局/审批流可视化编排）、**动态表单引擎**（数据源/联动/显隐/校验/子表/文件上传）与 **审批工作台**（发起、待办、已办、抄送、草稿箱、审批详情、站内通知）四大模块。

## 技术栈

| 分类 | 技术 | 说明 |
| --- | --- | --- |
| UI 框架 | React 19 | 函数组件 + Hooks |
| 构建工具 | Vite 8 | 开发服务 8181 端口，产物分包与压缩优化 |
| 路由 | react-router-dom v7 | Data Mode（`createBrowserRouter` + `RouterProvider`），loader 做登录守卫 |
| 组件库 | Arco Design（@arco-design/web-react） | 布局、表格、表单、抽屉、时间线等 |
| 样式 | Tailwind CSS v4（@tailwindcss/vite） | 原子化 CSS，配合 Prettier 类名排序插件 |
| 请求 | axios | 统一拦截器：错误提示 / 401 登出 / 业务码处理 |
| 代码规范 | Prettier 3 + prettier-plugin-tailwindcss | 无分号、单引号、行宽 100 |

## 环境依赖

| 依赖 | 版本要求 | 说明 |
| --- | --- | --- |
| Node.js | ≥ 20.19 或 ≥ 22.12 | Vite 8 的 engines 要求，推荐使用 22 LTS |
| npm | ≥ 10 | 与 Node.js 配套 |
| back-end 服务 | 运行中 | 开发环境通过 Vite 代理转发 `/api` 到 `http://localhost:8180` |

## 快速开始

```bash
# 1. 安装依赖
npm install

# 2. 启动开发服务（固定端口 8181，自动打开浏览器）
npm run dev

# 3. 生产构建（产物输出 dist/）
npm run build

# 4. 本地预览构建产物
npm run preview
```

> 启动前请确认后端已在 `8180` 端口运行；若后端端口不同，修改 `vite.config.js` 中的 `server.proxy` 目标地址。

默认登录账号：**`admin` / `admin123`**（由后端首次启动自动初始化）。

### 可用脚本

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 启动 Vite 开发服务（8181，自动打开浏览器） |
| `npm run build` | 生产构建，产物输出 `dist/` |
| `npm run preview` | 本地预览构建产物 |
| `npm run format` | Prettier 格式化 `src` 下全部 js/jsx/css |

## 目录结构

```
front-end/
├── index.html                    # 入口 HTML（标题由 vite 插件注入全局配置 APP_NAME）
├── vite.config.js                # 端口 8181 + /api、/health 代理 + 分包/压缩构建优化
├── jsconfig.json                 # 路径别名：src/* 与 @/* 均指向 ./src/*
├── .prettierrc                   # Prettier 规范（无分号/单引号/行宽 100）
├── public/favicon.svg
└── src/
    ├── main.jsx                  # 应用挂载：AuthProvider + RouterProvider
    ├── router.jsx                # Data Mode 路由：登录守卫 loader + 页面级权限组件 + 全量懒加载
    ├── index.css                 # Tailwind 入口与全局样式
    ├── config/app.js             # 全局配置：系统名称、登录页文案、表单元素类型选项、SIZE_OPTIONS 统一定义
    ├── api/                      # 接口封装（统一走 request 拦截器）
    │   ├── request.js            #   axios 实例：统一错误提示 / 401 登出
    │   ├── auth.js / user.js / role.js / menu.js / dept.js   # RBAC 模块
    │   ├── application.js        #   低代码应用/数据表/表单元素/业务数据
    │   ├── approval.js           #   审批分类/申请项/列表/实例/任务
    │   ├── examine.js            #   审批流配置
    │   ├── upload.js             #   文件上传
    │   └── notification.js       #   站内通知
    ├── store/                    # 全局状态
    │   ├── auth-context.jsx      #   登录态：token / 用户 / 菜单树 / 权限标识
    │   └── tab-context.jsx       #   顶部多标签页
    ├── hooks/
    │   ├── usePermission.js      # 权限判断 Hook：hasPerm / hasAnyPerm / hasAllPerms
    │   └── useMenuMeta.js        # 菜单元信息读取
    ├── components/
    │   ├── layout.jsx            # 后台布局：侧边菜单由后端菜单树动态渲染 + 顶部标签页 + 通知铃铛
    │   ├── tabs-bar.jsx          # 多标签页组件
    │   ├── AuthButton.jsx        # 权限按钮：无权限不渲染 / fallback=disable 禁用
    │   ├── NotificationBell.jsx  # 站内通知铃铛：未读红点 + 下拉列表 + 轮询刷新
    │   ├── IconSelect.jsx       # 图标选择器（内置图标 + iconfont symbol）
    │   └── IconFont.jsx          # iconfont symbol 渲染
    ├── utils/auth.js             # token 存取（localStorage）
    └── pages/
        ├── Login.jsx             # 登录（默认账号 admin/admin123）
        ├── Dashboard.jsx         # 工作台（后端健康检查 + 当前账号）
        ├── error/                # Forbidden(403) / NotFound(404)
        ├── profile/Profile.jsx   # 个人中心（含员工档案）
        ├── system/               # 系统管理：UserManage / RoleManage / MenuManage / DeptManage
        ├── application/          # 应用管理：应用/数据表/表单元素/布局/审批流配置
        │   ├── dynamic/          #   动态页面：DynamicForm / DynamicList / DynamicDetail / DynamicPage
        │   │   ├── DynamicForm.jsx          # 动态表单引擎：数据源/联动/显隐/校验/子表
        │   │   └── elements/                # 表单元素：Input/Select/Table/Upload 等
        │   └── examine/          #   审批流编排：FlowCanvas / FlowNodeCard / 条件/审批人/抄送人抽屉
        └── approval/             # 审批工作台
            ├── Apply.jsx         #   审批申请（分类 + 申请项入口）
            ├── Workplace.jsx     #   审批工作台
            ├── Todo.jsx          #   我的待办
            ├── Initiated.jsx     #   我的发起
            ├── ToMe.jsx          #   我审批的 / 抄送我的
            ├── Drafts.jsx        #   草稿箱（编辑 / 提交 / 删除）
            └── DetailDrawer.jsx / ApprovalTimeline.jsx / approvalStatus.jsx   # 审批详情与时间线
```

## 配置文件说明

| 文件 | 说明 |
| --- | --- |
| `vite.config.js` | 开发端口 8181（`strictPort`）、`/api` 与 `/health` 代理到后端 8180、`/uploads` 代理上传文件静态目录、路径别名 `src`、构建分包与 gzip/brotli 压缩 |
| `src/config/app.js` | 系统名称（注入 `<title>`）、登录页文案与功能亮点、表单元素类型选项——改系统名只动此文件 |
| `jsconfig.json` | 编辑器路径解析：`src/*`、`@/*` → `./src/*` |
| `.prettierrc` | 代码风格：无分号、单引号、尾逗号 all、行宽 100、Tailwind 类名自动排序 |

## 路由与权限

- **Data Mode 路由**（`src/router.jsx`）：`/` 后台路由组挂载 `loader` 做登录守卫（无 token 重定向 `/login`）；全部页面 `lazy()` 懒加载并按路由单独分包
- **动态菜单路由**：路由不再写死，登录后从后端菜单树接口动态生成路由表，侧边菜单同步渲染；`*` 通配兜底到 `DynamicPage`，从 `location.pathname` 解析应用 code/state 并分发渲染，配合后端 `GET /application/by-code/:code`
- **页面级权限**：`RequirePermission` 组件根据登录接口返回的菜单树校验当前路径，无权访问重定向 `/403`
- **按钮级权限**：`usePermission` Hook（`hasPerm` / `hasAnyPerm` / `hasAllPerms`）+ `AuthButton` 组件（无权限不渲染，或 `fallback="disable"` 渲染为禁用）

## 动态表单引擎（DynamicForm）

低代码应用的核心运行时，根据后端返回的 `form_layout_json` 动态渲染表单：

- **元素类型**：Input / InputNumber / Select / Radio / Checkbox / DatePicker / TimePicker / TreeSelect / Switch / Upload / 子表（Table）等，通过 `ELEMENT_RENDER_CONFIG` 统一注册分发
- **动态数据源**（`data_source`）：支持 `type=api` 按配置 `url/method/params` 请求接口，自动解析返回数据为选项；`label`/`value_field` 支持点路径取值（如 `data.list`、`profile.nickname`）
- **取值表达式约定**：
  - **`form.xxx`**：引用整个表单当前值，如 `form.dept_id` 表示取表单中 `dept_id` 字段的值，用于参数拼接、联动目标值等
  - **`item.xxx`**：引用下拉/树选的**当前选中项**，如 `item.profile.nickname` 表示取选中对象的 `profile.nickname`，用于 `target_mapping`、显示拼接
  - **无前缀**：直接从**接口响应数据**根节点取值，如 `profile.nickname` 等价于第一步 `data.profile.nickname` 直接命中，用于 `target_mapping.source`
  - **拼接字符串**：只有在字符串中插值时才用 `${}`，如 `${item.username}-${item.dept.name}`；纯取值场景直接写 `item.xxx` / `form.xxx` / 无前缀路径
- **事件联动**（`actions`）：支持 `on_mount` / `on_change` / `on_blur` 三种触发时机；动作类型 `set_value`（直接赋值）、`fetch_and_fill`（请求接口后按 `target_mapping` 填充）
- **动态显隐/禁用**（`dynamic_states`）：`visible_if` / `disabled_if` 支持表达式（如 `${form.dept_id === '1'}`），通过 Arco Form `shouldUpdate` 实时重渲染
- **校验规则**（`validation_rule`）：透传 Arco Form rules，支持 `required` / `pattern` / `min/max` 等，`validation_message` 自定义错误提示
- **子表**：columns 配置渲染为表格，支持行内编辑、联动、隐藏列（值仍保留提交）
- **文件上传**：`UploadElement` 自定义组件，对接后端 `/api/v1/upload`，支持单/多选、文件类型限制、按钮文字自定义

## 站内通知

- **NotificationBell**：顶部导航铃铛图标，未读时显示红点，下拉展示通知列表
- **轮询机制**：未读计数为 0 时暂停轮询，有未读时恢复；点击可标记已读
- **通知内容**：审批待办/通过/拒绝/退回事件自动生成，包含应用名称、操作结果、审批意见

## 接口对接约定

- 后端统一前缀 `/api/v1`，统一返回 `{ code, msg, data, timestamp }`，`code=0` 成功
- 开发环境由 Vite 代理转发：`/api` → `http://localhost:8180/api`，`/health` → 后端根路径健康检查
- 鉴权接口请求头携带 `Authorization: Bearer <token>`（登录成功后自动写入，`src/utils/auth.js` 持久化）
- `code=401` 或 HTTP 401 时自动清除本地 token 并跳回登录页；其余非 0 code 由拦截器弹出 `msg` 提示

## 构建产物优化

- **依赖分包**（`manualChunks`）：`vendor-react`（react/react-dom/react-router-dom）、`vendor-arco`（Arco Design）、`vendor-axios` 各自独立成包，依赖不变时浏览器可长期缓存，业务代码更新不牵连
- **路由级懒加载**：每个页面通过 `lazy()` 单独分包，访问时按需下载
- **产物压缩**（vite-plugin-compression2）：≥10KB 资源构建时额外生成 `.gz`（gzip）与 `.br`（brotli）文件，Nginx 配置 `gzip_static on; brotli_static on;` 即可直接下发预压缩文件
- **体积告警阈值**：`chunkSizeWarningLimit: 700`（arco 组件库本体约 640KB，避免噪音告警）

## 构建与部署

### 构建

```bash
npm install          # 生产服务器首次部署
npm run build        # 产物输出到 dist/
```

### Nginx 部署示例

```nginx
server {
    listen 80;
    server_name oa.example.com;

    root /opt/oa/front-end/dist;
    index index.html;

    # 预压缩文件直接下发
    gzip_static on;
    brotli_static on;

    # 前端路由 history 模式回退
    location / {
        try_files $uri $uri/ /index.html;
    }

    # 接口反向代理到后端 Go 服务
    location /api/ {
        proxy_pass http://127.0.0.1:8180;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

> 后端服务部署与配置说明见同级目录 `back-end/README.md`。
