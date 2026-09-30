# front-end

> OA 管理系统前端 · React 19 + Vite 8 + Arco Design + Tailwind CSS v4

## 目录

- [项目简介](#项目简介)
- [核心技术栈](#核心技术栈)
- [目录结构说明](#目录结构说明)
- [环境依赖要求](#环境依赖要求)
- [本地开发与运行步骤](#本地开发与运行步骤)
- [配置文件说明](#配置文件说明)
- [构建与部署指南](#构建与部署指南)
- [核心机制](#核心机制)
  - [路由与权限](#路由与权限)
  - [动态表单引擎（DynamicForm）](#动态表单引擎dynamicform)
  - [站内通知](#站内通知)
  - [审批工作台](#审批工作台)
  - [流程配置](#流程配置)
- [接口约定](#接口约定)

## 项目简介

OA 管理系统前端，承接同级目录 `back-end`（Go + Gin 服务，默认端口 8180）的全部业务界面。

覆盖四大模块：

| 模块           | 内容                                                                                     |
| -------------- | ---------------------------------------------------------------------------------------- |
| RBAC 系统管理  | 用户 / 角色 / 菜单 / 部门 / 审核人员组，含菜单树驱动的动态路由与按钮级权限                |
| 流程配置       | 流程、数据表字段、表单元素、可视化布局（表单页 / 详情页双模式）、审批流可视化编排        |
| 动态表单引擎   | 依据后端 `form_layout_json` 动态渲染，支持数据源、事件联动、显隐禁用、校验、子表、附件上传 |
| 审批工作台     | 发起申请、我的待办、我的发起、经我处理、抄送我的、草稿箱、审批详情与时间线、站内通知      |
| 接口管理       | 定义 SQL 直查 / HTTP 转发接口，统一分发对外暴露，支持试调、一键导入后端路由、被引用防误删 |
| 审核人员组     | 可复用的审核人集合（/system/examine），审批人 / 抄送对象均可引用                          |

整体为纯前端单页流程（SPA）：所有业务数据、页面布局与表单结构均由后端下发，前端负责渲染与交互，新增业务表单无需改动前端代码。

## 核心技术栈

| 分类       | 技术                                     | 版本     | 说明                                                          |
| ---------- | ---------------------------------------- | -------- | ------------------------------------------------------------- |
| UI 框架    | React                                    | ^19.2.8  | 函数组件 + Hooks，入口挂载 `react-19-adapter` 适配 Arco        |
| 构建工具   | Vite                                     | ^8.2.2   | 开发服务固定 8181 端口，产物分包与预压缩                       |
| 路由       | react-router-dom                         | ^7.18.3  | `BrowserRouter` + `useRoutes`，页面全量 `lazy()` 懒加载         |
| 组件库     | Arco Design（@arco-design/web-react）    | ^2.66.16 | 布局、表格、表单、抽屉、时间线等                                |
| 样式       | Tailwind CSS（tailwindcss / @tailwindcss/vite） | ^4.1.4   | 原子化 CSS，配合 Prettier 类名排序插件                          |
| 请求       | axios                                    | ^1.7.9   | 统一拦截器：错误提示 / 401 登出 / 业务码处理                    |
| 构建插件   | @vitejs/plugin-react                     | ^6.1.1   | React 快速刷新与 JSX 转换                                       |
| 构建插件   | vite-plugin-compression2                 | ^2.5.3   | 构建时生成 `.gz` / `.br` 预压缩产物                             |
| 代码规范   | Prettier + prettier-plugin-tailwindcss   | ^3.9.6 / ^0.8.1 | 无分号、单引号、行宽 100、类名自动排序                    |
| 代码检查   | ESLint + eslint-plugin-react(-hooks)     | ^9.39.4 / ^7.37.5 | 扁平配置 `eslint.config.js`，含 react / react-hooks 规则 |
| 单元测试   | Vitest                                   | ^5.0.1   | `npm test`，Node 环境直接运行纯逻辑用例                        |

## 目录结构说明

```
front-end/
├── index.html                    # 入口 HTML（<title> 由 vite 插件注入 src/config/app.js 的 APP_NAME）
├── vite.config.js                # 端口 8181 + {VITE_API_PREFIX}、/health、/uploads 代理 + 分包/预压缩构建优化
├── jsconfig.json                 # 编辑器路径解析：src/* 与 @/* 均指向 ./src/*
├── .prettierrc                   # Prettier 规范（无分号 / 单引号 / 行宽 100 / LF）
├── .prettierignore / .gitignore  # 格式化与版本控制忽略清单
├── package.json                  # 依赖与 npm scripts
├── eslint.config.js              # ESLint 扁平配置（react / react-hooks 规则）
├── public/
│   └── favicon.svg               # 站点图标
└── src/
    ├── main.jsx                  # 应用挂载：AuthProvider + AppRouterProvider + Arco 样式与 react-19-adapter
    ├── router.jsx                # 路由装配：登录守卫 + 菜单树动态路由 + RequirePermission 权限校验
    ├── index.css                 # Tailwind 入口与全局样式（含详情页 Form 模拟 Descriptions 的样式）
    ├── config/
    │   └── app.js                # 全局配置：系统名称、登录页文案、表单元素类型选项、SIZE_OPTIONS
    ├── api/                      # 接口封装（统一走 request 拦截器）
    │   ├── request.js            #   axios 实例：baseURL={VITE_API_PREFIX}，统一错误提示 / 401 登出
    │   ├── fetchAll.js           #   全量取数：逐页拉全（列表接口一律用它，不要再用 size:9999）
    │   ├── auth.js / user.js / role.js / menu.js / dept.js    # RBAC 模块
    │   ├── application.js        #   流程配置：流程 / 数据表字段 / 表单元素 / 业务数据
    │   ├── approval.js           #   审批分类、申请项、列表、实例、任务
    │   ├── examine.js            #   审批流配置
    │   ├── apiDefinition.js      #   接口管理（列表/增删改/试调/枚举后端路由/一键导入）
    │   ├── examineGroup.js       #   审核人员组
    │   └── notification.js       #   站内通知
    ├── store/                    # 全局状态
    │   ├── auth-context.jsx      #   登录态：token / 用户 / 菜单树 / 权限标识
    │   └── tab-context.jsx       #   顶部多标签页
    ├── hooks/
    │   ├── usePermission.js      # 权限判断：hasPerm / hasAnyPerm / hasAllPerms
    │   └── useMenuMeta.js        # 菜单元信息读取
    ├── components/
    │   ├── layout.jsx            # 后台布局：菜单树动态侧边栏 + 顶部标签页 + 通知铃铛
    │   ├── tabs-bar.jsx          # 多标签页组件
    │   ├── AuthButton.jsx        # 权限按钮：无权限不渲染 / fallback="disable" 禁用
    │   ├── notification-bell.jsx # 站内通知铃铛：未读红点 + 下拉列表 + SSE 实时推送 + 多标签页同步
    │   └── icon-select.jsx       # 图标选择器（内置图标 + iconfont symbol）
    ├── utils/
    │   ├── auth.js               # token 存取（localStorage）
    │   └── format.js             # 通用格式化（formatTime）
    ├── test/
    │   └── evalExpression.test.js  # 表达式求值单元测试（Vitest，前端测试统一放这里）
    └── pages/
        ├── Login.jsx             # 登录（默认账号 admin / admin123）
        ├── Dashboard.jsx         # 工作台（后端健康检查 + 当前账号）
        ├── error/                # Forbidden(403) / NotFound(404)
        ├── profile/Profile.jsx   # 个人中心（含员工档案）
        ├── system/               # 系统管理：UserManage / RoleManage / MenuManage / DeptManage / ExamineGroupManage（审核人员组）
        ├── interface/            # 接口管理
        │   └── InterfaceManage.jsx    # 接口管理（列表/搜索/密度列设置/新建编辑/设置/试调/导入后端路由）
        ├── application/          # 流程配置
        │   ├── ApplicationManage.jsx   # 流程管理
        │   ├── TableManage.jsx         # 表管理（字段定义）
        │   ├── ElementManage.jsx   # 表单元素管理（数据源 / 事件联动 / 校验）
        │   ├── LayoutManage.jsx        # 布局管理（表单页 + 详情页可视化拖拽）
        │   ├── ExamineManage.jsx       # 审批管理（发起人 / 审批流 / 抄送配置）
        │   ├── constants.js            # 流程配置公共常量
        │   ├── dynamic/                # 动态页面运行时
        │   │   ├── DynamicForm.jsx         # 动态表单引擎（分发器 + 渲染配置中心 + 运行时）
        │   │   ├── DynamicList.jsx         # 动态列表页
        │   │   ├── DynamicPage.jsx         # 动态页面入口（按 code/state 分发）
        │   │   ├── DynamicFlowView.jsx     # 审批流只读视图
        │   │   ├── useApplicationData.js        # 流程数据获取 Hook
        │   │   ├── useApplicationDetailData.js  # 详情数据获取 Hook
        │   │   ├── elements/UploadElement.jsx   # 文件上传自定义元素
        │   │   ├── utils/evalExpression.js      # 表达式求值（自建词法/语法分析，不执行宿主 JS）
        │   │   ├── utils/formUtils.js           # 纯函数：布局解析 / 取值 / 表达式 / 校验 / 时间序列化
        │   │   └── modes/                  # 四种页面模式实现（详见「动态表单引擎」）
        │   │       ├── FormMode.jsx / DetailMode.jsx
        │   │       └── MoveFormMode.jsx / MoveDetailMode.jsx
        │   └── examine/                # 审批流可视化编排
        │       ├── FlowCanvas.jsx / FlowNodeCard.jsx / flowModel.js
        │       ├── ApproverEditDrawer.jsx / CcEditDrawer.jsx / ConditionEditDrawer.jsx
        │       ├── PersonSelectorModal.jsx / PersonSelectorProvider.jsx / selector-context.jsx
        │       └── useApprovalFlow.js
        └── approval/             # 审批工作台
            ├── Apply.jsx                  # 审批申请（分类 + 申请项入口）
            ├── Workplace.jsx              # 审批工作台首页
            ├── Todo.jsx                   # 我的待办
            ├── Initiated.jsx              # 我的发起
            ├── ToMe.jsx                   # 经我处理 / 抄送我的
            ├── Drafts.jsx                 # 草稿箱（编辑 / 提交 / 删除）
            ├── DetailDrawer.jsx           # 审批详情抽屉
            ├── ApprovalTimeline.jsx       # 审批时间线
            ├── approvalStatus.jsx         # 审批状态字典与印章配色
            ├── ApprovalTableToolbar.jsx   # 列表页工具栏
            └── useApprovalList.jsx        # 审批列表数据 Hook
```

> `dynamic/modes/` 的四个模式组件由 `DynamicForm.jsx` 按 `pageType` 分发（`form` / `detail` / `move-form` / `move-detail`），属主链路的一部分；改造前的历史备份目录 `dynamic-backup/` 已删除。

## 环境依赖要求

| 依赖          | 版本要求                 | 说明                                                              |
| ------------- | ------------------------ | ----------------------------------------------------------------- |
| Node.js       | `^20.19.0 \|\| >=22.12.0` | Vite 8 的 `engines` 要求，推荐使用 22 LTS                        |
| npm           | ≥ 10                     | 随 Node.js 一并安装                                               |
| back-end 服务 | 运行中                   | 开发环境通过 Vite 代理转发 `{VITE_API_PREFIX}` 到 `http://localhost:8180`      |
| 现代浏览器    | 支持 ES2020+             | 需支持 `EventSource`（SSE）与 `BroadcastChannel`（多标签页同步）  |

**API 前缀（版本号）**：唯一真值在 `.env.development` / `.env.production` 的 `VITE_API_PREFIX`，由 `src/utils/constants.js` 的 `API_PREFIX` 统一引用（axios baseURL、SSE、上传 action、动态接口前缀剥离、接口管理文案）。变更版本号时同步后端 `config-*.yaml` 的 `server.api_prefix` 与 Nginx 反代路径即可，无需改代码。

**部署子路径（base path）**：唯一真值在 `.env.production` 的 `VITE_BASE_PATH`（默认空 = 根路径部署）。若将前端发布到子目录，填对应子路径：构建产物资源引用自动带上该前缀（`vite.config.js` 的 `base` 读取同一变量），`BrowserRouter` 的 `basename` 由 `src/utils/constants.js` 的 `BASE_PATH` 引用，路由匹配自动基于子路径。变更时同步 Nginx 的 `location` 与 SPA fallback 即可，无需改代码。

## 本地开发与运行步骤

### 1. 安装依赖

```bash
cd front-end
npm install
```

### 2. 启动后端（前置条件）

前端所有数据均来自 `back-end`，请先在 `8180` 端口启动后端服务，详见同级目录 [`back-end/README.md`](../back-end/README.md)。

### 3. 启动开发服务

```bash
npm run dev
```

Vite 固定监听 **8181** 端口（`strictPort: true`，端口被占用会直接报错而不是自动换端口），启动后自动打开浏览器。默认登录账号 **`admin` / `admin123`**（由后端首次启动自动初始化）。

### 4. 验证

- 浏览器访问 `http://localhost:8181/`，出现登录页即前端启动成功；
- 登录后进入工作台，`Dashboard` 会请求后端健康检查接口，用于确认前后端联通；
- 若接口返回失败，先确认后端是否已在 `8180` 运行。

### 5. 可用脚本

| 命令              | 说明                                        |
| ----------------- | ------------------------------------------- |
| `npm run dev`     | 启动 Vite 开发服务（8181，自动打开浏览器）  |
| `npm run build`   | 生产构建，产物输出 `dist/`                  |
| `npm run preview` | 本地预览构建产物                            |
| `npm run format`  | Prettier 格式化 `src` 下全部 js / jsx / css |
| `npm run lint`    | ESLint 静态检查（扁平配置 `eslint.config.js`） |
| `npm test`        | Vitest 单元测试（`vitest run`，执行一次后退出） |

> **测试基线**：前端测试统一放在 `src/test/`，目前为动态表单引擎的表达式求值（`src/test/evalExpression.test.js`，共 54 个用例），覆盖字面量与边界、取值与类型语义、常用表达式，以及「不执行宿主 JS」的安全回归；`npm run lint` 当前为 0 error。

### 6. 代理说明

开发环境下三个前缀由 Vite 转发到后端，避免跨域：

| 前端路径   | 代理目标                        | 说明                                       |
| ---------- | ------------------------------- | ------------------------------------------ |
| `/api`     | `http://localhost:8180/api`     | 全部业务接口（含 SSE `/notifications/stream`） |
| `/health`  | `http://localhost:8180/`        | 后端健康检查在根路径，此处做重写映射        |
| `/uploads` | `http://localhost:8180/uploads` | 上传文件的静态资源访问                      |

若后端端口不是 8180，修改 `vite.config.js` 中 `server.proxy` 各项的 `target`。

## 配置文件说明

| 文件                | 说明                                                                                                                                                                |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `vite.config.js`    | 开发端口 8181（`host: 0.0.0.0` + `strictPort`）、`{VITE_API_PREFIX}` `/health` `/uploads` 代理到后端 8180、路径别名 `src` → `/src`、构建分包（`manualChunks`）与 gzip/brotli 预压缩 |
| `src/config/app.js` | 系统名称（注入 `<title>`）、登录页文案与功能亮点、表单元素类型选项（`ELEMENT_TYPE_OPTIONS`）、字段宽度选项（`SIZE_OPTIONS`）——改系统名只需改此文件                   |
| `jsconfig.json`     | 编辑器路径解析：`src/*` 与 `@/*` → `./src/*`（构建期实际别名由 `vite.config.js` 提供）                                                                               |
| `.prettierrc`       | 代码风格：无分号、单引号、尾逗号 all、行宽 100、缩进 2、LF、Tailwind 类名自动排序                                                                                    |
| `.prettierignore`   | Prettier 忽略清单（`dist`、`node_modules` 等构建产物）                                                                                                              |
| `.gitignore`        | 版本控制忽略清单：`node_modules`、`dist`、`*.local`、`.DS_Store`                                                                                                     |

> API 前缀（版本号）通过 `.env.development` / `.env.production` 的 `VITE_API_PREFIX` 管理，`src/utils/constants.js` 统一引用；开发代理由 `vite.config.js` 经 `loadEnv` 读取同一变量。

## 构建与部署指南

### 构建

```bash
npm install          # 生产服务器首次部署
npm run build        # 产物输出到 dist/
```

构建完成后，`dist/` 可直接交给任意静态服务器；本地可用 `npm run preview` 预览。

### 构建产物优化

- **依赖分包**（`manualChunks`）：`vendor-arco`（Arco 组件，约 1.0MB / gzip 293KB）、`vendor-arco-icon`（Arco 图标，约 32KB，与组件库更新频率不同，单独成包便于各自长期缓存）、`vendor-react`（react / react-dom / react-router-dom / scheduler）、`vendor-axios` 各自独立成包，依赖不变时可长期缓存，业务代码更新不牵连；
- **路由级懒加载**：每个页面通过 `lazy()` 单独分包，访问时按需下载；
- **产物命名**：入口 `assets/js/[name]-[hash].js`、分包 `assets/js/chunks/[name]-[hash].js`、静态资源 `assets/[ext]/[name]-[hash].[ext]`；
- **预压缩**（vite-plugin-compression2）：≥ 10KB 的资源额外生成 `.gz`（gzip）与 `.br`（brotli），Nginx 开启 `gzip_static on; brotli_static on;` 即可直接下发；
- **体积告警阈值**：`chunkSizeWarningLimit: 1100`（实测 `vendor-arco` 约 1.0MB / gzip 293KB，Arco 全量样式约 555KB / gzip 62KB，两者均已单独分包，提高阈值避免每次构建产生噪音告警）；

### Nginx 部署示例

> 示例中的 `{VITE_API_PREFIX}` / `{VITE_BASE_PATH}` 为占位符，部署时按 `.env` 实际值替换即可。

**根路径部署**（`VITE_BASE_PATH` 留空）：

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
    location /{VITE_API_PREFIX}/ {
        proxy_pass http://127.0.0.1:8180;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    # SSE 长连接：关闭缓冲，避免通知推送被 Nginx 攒包延迟
    location /{VITE_API_PREFIX}/notifications/stream {
        proxy_pass http://127.0.0.1:8180;
        proxy_http_version 1.1;
        proxy_set_header Connection '';
        proxy_buffering off;
        proxy_read_timeout 3600s;
    }
}
```

**子路径部署**（`.env.production` 设 `VITE_BASE_PATH` 为子路径，产物发布到 `/opt/oa/front-end/dist`，`location /{VITE_API_PREFIX}/` 必须**先于** `location /{VITE_BASE_PATH}/` 匹配）：

```nginx
server {
    listen 80;
    server_name oa.example.com;

    root /opt/oa;
    index index.html;

    gzip_static on;
    brotli_static on;

    # 接口反向代理到后端 Go 服务（务必在 {VITE_BASE_PATH}/ 静态规则之前）
    location /{VITE_API_PREFIX}/ {
        proxy_pass http://127.0.0.1:8180;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    # SSE 长连接：关闭缓冲，避免通知推送被 Nginx 攒包延迟
    location /{VITE_API_PREFIX}/notifications/stream {
        proxy_pass http://127.0.0.1:8180;
        proxy_http_version 1.1;
        proxy_set_header Connection '';
        proxy_buffering off;
        proxy_read_timeout 3600s;
    }

    # 前端静态资源 + history 模式回退（fallback 指向子路径下的 index.html）
    location /{VITE_BASE_PATH}/ {
        try_files $uri $uri/ /{VITE_BASE_PATH}/index.html;
    }
}
```

### 部署检查清单

- [ ] `dist/` 已生成，且包含 `.gz` / `.br` 预压缩文件；
- [ ] Nginx 配置了 history 模式回退（`try_files ... /index.html`），否则刷新子路由会 404；
- [ ] 子路径部署时 `.env.production` 的 `VITE_BASE_PATH` 与 Nginx `location /{VITE_BASE_PATH}/` 一致，且 `location /{VITE_API_PREFIX}/` 先于 `location /{VITE_BASE_PATH}/` 声明；
- [ ] `/{VITE_API_PREFIX}/` 已反代到后端，且 **SSE 路径关闭了 `proxy_buffering`**，否则站内通知不实时；
- [ ] 后端 `uploads/` 目录已配置为静态可访问（前端通过 `/uploads/...` 读取附件）。

## 核心机制

### 路由与权限

- **路由装配**（`src/router.jsx`）：`BrowserRouter` + `useRoutes`，路由表由 `useMemo` 依赖菜单树生成；
- **登录守卫**：组件内判断 `getToken()`，未登录且不在 `/login` 时重定向登录页；已登录访问登录页则回首页；
- **动态菜单路由**：`buildMenuRoutes()` 遍历后端菜单树，仅注册「页面菜单」（`type=2` 且启用且有 `path`）——目录与按钮不注册路由；每个路径经 `PAGE_MAP` 匹配页面组件，未匹配的交给 `DynamicPage` 承接流程配置页面；
- **页面级权限**：`RequirePermission` 用 `matchPath` 将当前 `pathname` 与用户菜单的原始 `path` 做模式匹配（支持 `/application/:id/tables` 这类动态段），不匹配则重定向 `/403`；菜单未加载完成时先显示 `Spin`，避免误判；
- **兜底**：`/` 下未注册的路径统一 `Navigate` 到 `/403`；
- **懒加载**：所有页面经 `lazy()` 导入，由 `Page` 组件统一包 `Suspense` 展示加载态；
- **按钮级权限**：`usePermission` Hook（`hasPerm` / `hasAnyPerm` / `hasAllPerms`）+ `AuthButton` 组件（无权限不渲染，或 `fallback="disable"` 渲染为禁用）。

### 动态表单引擎（DynamicForm）

流程配置模块的核心运行时，根据后端返回的 `form_layout_json`（表单页）或 `detail_layout_json`（详情页）动态渲染表单。

- **渲染配置中心**：`BASE_ELEMENT_CONFIGS`（基础元素：预览 + 属性面板）、`ELEMENT_RENDER_CONFIG`（元素类型 → 渲染实现）、`renderPreviewConfig`（详情只读预览），三者与 `src/config/app.js` 的 `ELEMENT_TYPE_OPTIONS` 深度关联——新增元素类型需同时登记，才能在设计器下拉中出现；
- **自定义元素**：`elements/UploadElement.jsx` 通过统一配置接口接入，自带 `renderPreview` / `renderSettings` / `renderReadOnly`，四种模式（form / detail / move-form / move-detail）下各自呈现；
- **四种页面模式**：
  - `form`：可编辑表单模式（填报 / 编辑）
  - `detail`：只读详情模式（审批详情 / 查看）
  - `move-form`：设计器表单页模式（拖拽设计）
  - `move-detail`：设计器详情页模式（拖拽设计只读预览）
  - `dynamic/modes/` 下已有四种模式的独立实现，当前主链路仍统一由 `DynamicForm.jsx` 渲染，该目录为后续拆分的预留；
- **动态数据源**（`data_source`）：支持静态数据与 `type=api` 按配置 `url/method/params` 请求接口，自动解析返回数据为选项；`label` / `value_field` 支持点路径取值（如 `data.list`、`profile.nickname`）；可**引用接口管理**中的接口定义（`api_ref: 1`）——引用后 `url` / `method` 锁定禁用，`params` / `label` / `value_field` 仍可修改，运行时自动走统一分发端点 `{VITE_API_PREFIX}/interfaces`；
- **取值表达式约定**：
  - **`form.xxx`**：引用整个表单当前值，如 `form.dept_id`，用于参数拼接、联动目标值等；
  - **`item.xxx`**：引用下拉 / 树选的**当前选中项**，如 `item.profile.nickname`，用于 `target_mapping` 与显示拼接；
  - **无前缀**：直接从**接口响应数据**根节点取值，如 `profile.nickname`，用于 `target_mapping.source`；
  - **拼接字符串**：只有在字符串中插值时才用 `${}`，如 `${item.username}-${item.dept.name}`；纯取值场景直接写 `item.xxx` / `form.xxx` / 无前缀路径；
- **事件联动**（`actions`）：支持 `on_mount` / `on_change` / `on_blur` 三种触发时机；动作类型有两种——`set_value`（直接赋值）、`fetch_and_fill`（请求接口后按 `target_mapping` 填充）。`fetch_and_fill` 同样可**引用接口管理**中的接口定义（`api_ref: 1`，`params` / `target_mapping` 可改）。公共计算接口 `/utils/calculate` 即通过 `fetch_and_fill` 调用：把表达式或金额放进 `params`，再将返回的 `result` 映射到目标字段（如金额 → 大写金额）；
- **动态显隐 / 禁用**（`dynamic_states`）：`visible_if` / `disabled_if` 支持表达式（如 `${form.dept_id === '1'}`），通过 Arco Form `shouldUpdate` 实时重渲染；
- **校验规则**（`validation_rule`）：透传 Arco Form rules，支持 `required` / `pattern` / `min` / `max` 等，`validation_message` 自定义错误提示；
- **子表**：columns 配置渲染为表格，支持行内编辑、联动、隐藏列（值仍保留提交）；
- **文件上传**：`UploadElement` 对接后端 `{VITE_API_PREFIX}/upload`，支持单 / 多选、文件类型限制（`accept`）、按钮文字与 placeholder 自定义，提交时字段值为 `[{ uid, url, name, size }]` JSON 数组；
- **公共计算 / 转换接口**：`POST /utils/calculate`，支持以下类型：
  - `number_to_upper`：数字转大写金额（如 `100000` → `壹拾万元整`，支持小数与「零」补位）
  - `calc`：统一表达式计算（支持 `+`、`-`、`*`、`/`、`%` 与括号，如 `(100+2)*3 % 7` → `5`）

### 接口管理

- **InterfaceManage.jsx**（`/interface`）：接口定义管理页面，列表支持关键字（接口名称）+ 方法搜索、密度设置与列设置、备注超出省略；
- **定义方式**：`sql`（SQL 模板直查，`${form.xxx}` 占位参数化）与 `http`（转发到内部相对路径 `target_path`）；新建 / 编辑抽屉只维护基础信息（名称、方法、路径、排序、状态、备注），SQL 模板 / 转发参数模板等在「设置」抽屉中配置；
- **试调**：设置抽屉内置试调面板，填写试调参数后以当前账号身份真实执行（SQL 直查 / HTTP 转发），结果与错误集中展示在数据回显区；
- **导入后端路由**：一键读取后端 `internal/router/*.go` 源码（行内注释即接口名称），批量生成 HTTP 转发定义，排序默认 1；
- **被引用标记**：接口被表单元素数据源 / 联动动作引用时列表显示「被引用」，且删除按钮禁用（防误删）；引用交互在表单元素管理的「引用接口」弹窗中完成（`api_ref: 1` 标记）。

### 审核人员组

- **ExamineGroupManage.jsx**（`/system/examine`）：审核人员组管理，配置组名称、编号、审核人（按昵称搜索多选，昵称关联账号详情表）、排序、状态；
- **审批流引用**：在流程配置的审批管理抽屉中，「审批对象」与「抄送人」均支持选择审核人员组（单选，复用 PersonSelectorModal 弹窗）；审批人 / 抄送对象类型枚举：`1` 指定人员 / `2` 指定角色 / `3` 发起人自选 / `4` 审核人员组。

### 站内通知

- **NotificationBell**（`components/notification-bell.jsx`）：顶部导航铃铛图标，未读时显示红点，下拉展示通知列表；
- **SSE 实时推送**：通过 `EventSource` 连接 `{VITE_API_PREFIX}/notifications/stream?token=xxx`，服务端推送即到即显，无需轮询；断线由 `EventSource` 原生自动重连；
- **多标签页同步**：通过 `BroadcastChannel('notification-sync')` 在多个标签页之间同步已读状态与未读数；
- **未读数**：页面初始化时调用 `/notifications/unread-count` 取一次基线，之后由 SSE 推送增量维护；
- **通知类型**：`type=1` 待办、`type=2` 退回、`type=3` 抄送、`type=4` 审批结果，由后端在流程流转时生成（抄送按配置的抄送时机推送）。

### 审批工作台

- **Apply.jsx**：审批申请入口，按分类展示申请项；无管理权限（`approval:edit`）时隐藏分类下无申请项的空分类；
- **Todo.jsx**：我的待办，展示当前需要我审批的任务；
- **Initiated.jsx**：我的发起，展示我发起的所有审批；
- **ToMe.jsx**：经我处理 / 抄送我的；
- **Drafts.jsx**：草稿箱，支持编辑、提交、删除（提交按钮位于编辑抽屉左下方）；
- **DetailDrawer.jsx**：审批详情抽屉，展示业务数据与审批流程，右上角带旋转的状态印章；
- **ApprovalTimeline.jsx**：审批时间线，展示每个节点的处理情况；
- **列表字段**：各列表统一以**申请项名称**（`item_name`）作为标题字段，打开的详情 / 编辑抽屉标题同样取申请项名称；
- **审批状态印章**：详情页右上角显示旋转的审批状态印章（审批中 / 已通过 / 已拒绝 / 已退回等），配色取自 `approvalStatus.jsx` 的 `STATUS_TAG_COLOR`，与列表标签色保持一致。

### 流程配置

配置顺序：**新建流程 → 表管理 → 表单元素管理 → 布局管理 → 审批管理**。

- **流程管理**：流程列表、新增、编辑、删除（软删除数据在列表接口侧过滤）；
- **表管理**：定义业务表字段，字段类型见 `FIELD_TYPES`；附件类字段使用 `json` 类型存储文件信息数组；
- **表单元素管理**：选择字段并绑定元素类型，配置数据源（静态 / 接口 / **引用接口管理**）、事件联动（`fetch_and_fill` 可引用接口管理）、默认值、校验规则；「引用接口」弹窗选择接口后地址与方法锁定、其余参数可改；
- **布局管理**：可视化拖拽布局，表单页与详情页分别配置；点击元素后在右侧属性面板编辑元素类型、字段名称、宽度占比及元素专属配置；
- **审批管理**：配置发起人范围、审批流（条件分支、审批人类型：指定人员 / 指定角色 / 发起人自选 / 审核人员组，依次 / 会签 / 或签）、抄送人与抄送时机。

## 接口约定

- 后端统一前缀 `{VITE_API_PREFIX}`，统一返回 `{ code, msg, data, timestamp }`，`code=0` 成功；
- 接口管理定义的接口经统一分发端点暴露：`{VITE_API_PREFIX}/interfaces/*path`（按 method+path 匹配，表单元素引用的接口运行时自动走该端点）；
- 开发环境由 Vite 代理转发：`{VITE_API_PREFIX}` → 后端 Go 服务（8180），`/health` → 后端根路径健康检查，`/uploads` → 上传文件静态资源；
- 鉴权接口请求头携带 `Authorization: Bearer <token>`（登录成功后自动写入，`src/utils/auth.js` 持久化到 localStorage）；
- `code=401` 或 HTTP 401 时自动清除本地 token 并跳回登录页；其余非 0 code 由拦截器弹出 `msg` 提示；
- SSE 接口因浏览器 `EventSource` 无法自定义请求头，token 通过查询参数传递：`/notifications/stream?token=xxx`。

> 完整接口清单见同级目录 [`back-end/README.md`](../back-end/README.md) 的「接口清单」章节。
