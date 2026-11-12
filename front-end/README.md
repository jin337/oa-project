# OA 管理系统 · 前端

基于 **React + Vite + Arco Design** 的 OA 管理系统前端，包含动态表单设计器、审批列表与详情、通知中心、流程配置、接口管理与系统管理。

---

## 目录

- [项目简介](#项目简介)
- [核心技术栈](#核心技术栈)
- [目录结构](#目录结构)
- [环境依赖](#环境依赖)
- [本地开发与运行](#本地开发与运行)
- [环境变量与配置](#环境变量与配置)
- [工程配置说明](#工程配置说明)
- [常用命令](#常用命令)
- [构建与部署](#构建与部署)
- [开发规范](#开发规范)
- [常见问题](#常见问题)

---

## 项目简介

前端与 `back-end` 服务配套，默认开发端口 `8181`，通过代理访问后端 `8180`。主要模块：

| 模块 | 说明 |
| --- | --- |
| 登录与布局 | JWT 登录、后端菜单树驱动动态路由、多页签（Tabs）与 LRU 缓存、面包屑 |
| 工作台 | 首页数据概览 |
| 流程配置 | 应用管理、表字段管理、元素管理、表单设计器（拖拽布局、属性面板、版本发布） |
| 动态流程页 | 按后端配置动态渲染的列表页与表单页（新增 / 编辑 / 详情） |
| 审批管理 | 我的发起、我的待办、经我处理、抄送我的、草稿箱；详情抽屉、审批操作、加签 / 转交 / 退回、打印与导出 PDF |
| 通知中心 | 站内通知列表、筛选与搜索、单条 / 全部已读、未读数与 SSE 实时更新 |
| 接口管理 | 自定义 SQL / HTTP 接口配置与试调，运行时按权限分发 |
| 系统管理 | 用户、角色、菜单、部门、审核人员组、操作审计 |
| 个人中心 | 当前用户信息与资料维护 |

**路由机制**：路由表不写死，`src/router.jsx` 只维护「菜单路径模式 → 页面组件」的 `PAGE_MAP`，实际菜单与权限来自后端；未注册的流程页面统一交给 `pages/application/dynamic/DynamicPage.jsx` 动态渲染。

---

## 核心技术栈

| 分类 | 技术 | 版本 | 说明 |
| --- | --- | --- | --- |
| 框架 | React | 19.2 | 函数组件 + Hooks |
| 构建 | Vite | 8.2 | 开发服务器、HMR、分包与压缩 |
| 路由 | react-router-dom | 7.18 | `BrowserRouter` + `useRoutes`，页面懒加载 |
| UI | @arco-design/web-react | 2.66 | 组件库与图标 |
| 样式 | Tailwind CSS | 4.1 | 原子化样式，通过 `@tailwindcss/vite` 接入 |
| HTTP | axios | 1.7 | 统一实例、拦截器、Bearer Token |
| 打印导出 | html2canvas-pro + jspdf | 2.6 / 4.2 | 单据与表单导出 PDF |
| 状态 | React Context + Hooks | - | `auth-context`、`tab-context` |
| 单测 | Vitest | 5.0 | `src/test/*.test.js` |
| 规范 | ESLint 9 + Prettier 3 | - | 提交前检查与格式化 |

---

## 目录结构

```text
front-end/
├── public/                     # 不经过构建处理的静态资源
├── src/
│   ├── api/                    # 接口封装（request.js + 按模块分文件）
│   │   ├── request.js          # axios 实例、Token 注入、统一错误处理
│   │   ├── auth.js / menu.js / user.js / role.js / dept.js
│   │   ├── application.js / approval.js / notification.js
│   │   ├── apiDefinition.js / examine*.js / operationLog.js / fetchAll.js
│   ├── components/             # 通用组件（弹窗选择器、编辑器、错误边界等）
│   ├── config/                 # 全局常量（app.js 应用名、tab-cache.js 页签缓存策略）
│   ├── error/                  # 错误页（Forbidden 等）
│   ├── hooks/                  # useMenuMeta、usePermission
│   ├── pages/
│   │   ├── Dashboard.jsx       # 工作台
│   │   ├── application/        # 流程配置、表单设计器、动态页面（dynamic/）
│   │   ├── approval/           # 审批列表、申请、详情等公共组件
│   │   ├── interface/          # 接口管理
│   │   ├── layout/             # 布局内嵌组件（通知铃铛等）
│   │   ├── notification/       # 通知中心
│   │   ├── profile/            # 个人中心
│   │   └── system/             # 用户 / 角色 / 菜单 / 部门 / 审核组 / 审计
│   ├── store/                  # 全局 Context（auth-context、tab-context）
│   ├── test/                   # Vitest 单测（表达式、下载、分页取数、页签缓存等）
│   ├── utils/                  # auth、constants、download、format、json、printExport 等
│   ├── views/                  # 布局与登录页（Login.jsx、MainLayout.jsx）
│   ├── index.css               # 全局样式（Tailwind 入口）
│   ├── main.jsx                # 应用入口
│   └── router.jsx              # 路由装配与 PAGE_MAP
├── web/                        # 生产构建产物（npm run build 输出）
├── .env.development            # 开发环境变量
├── .env.production             # 生产环境变量
├── vite.config.js              # 端口、代理、别名、分包、压缩、标题注入
├── eslint.config.js            # ESLint 9 扁平配置
├── .prettierrc                 # Prettier 配置
├── jsconfig.json               # src 路径别名提示
├── index.html                  # HTML 模板
└── package.json
```

---

## 环境依赖

| 依赖 | 版本要求 | 说明 |
| --- | --- | --- |
| Node.js | ≥ 20.19（推荐 22 LTS） | Vite 8 的最低要求 |
| npm | ≥ 10 | 仓库使用 npm，`package-lock.json` 已提交；也可改用 pnpm |
| 后端服务 | - | 需先启动 `back-end`（默认 `http://localhost:8180`） |
| 浏览器 | 现代浏览器 | Chrome / Edge / Firefox 最新两个大版本 |

---

## 本地开发与运行

### 1. 安装依赖

```bash
cd front-end
npm install
```

### 2. 启动开发服务器

```bash
npm run dev
```

默认行为（见 `vite.config.js`）：

- 监听 `0.0.0.0:8181`，`strictPort: true`（端口被占用会直接报错，不会自动换端口）。
- 启动后自动打开浏览器。
- 代理转发：`/v1/api`、`/uploads` 指向 `http://localhost:8180`；`/health` 重写为后端根路径 `/`。

### 3. 与后端联调

1. 先按 `back-end/README.md` 启动后端并确认健康检查可用。
2. 前端登录后由后端返回菜单树，页面与权限随之渲染。
3. 若接口返回 401，前端会清理本地 Token 并跳转 `${VITE_BASE_PATH}/login`。

### 4. 生产构建预览

```bash
npm run build
npm run preview
```

`preview` 用于本地检查构建产物；它不会套用开发代理，联调仍以 `npm run dev` 为准。

---

## 环境变量与配置

变量定义在项目根目录，Vite 按 mode 自动加载：

| 文件 | 加载时机 | 当前值 |
| --- | --- | --- |
| `.env.development` | `npm run dev` | `VITE_API_PREFIX=/v1/api`、`VITE_BASE_PATH=`（空，根路径） |
| `.env.production` | `npm run build` | `VITE_API_PREFIX=/v1/api`、`VITE_BASE_PATH=/oa` |

| 变量 | 说明 | 注意事项 |
| --- | --- | --- |
| `VITE_API_PREFIX` | 后端 API 统一前缀 | 必须与后端 `server.api_prefix`、Nginx 反代路径一致；改版本号只改这里 |
| `VITE_BASE_PATH` | 前端部署子路径（Vite `base`） | 空 = 根路径；`.env.production` 默认 `/oa`，直接根路径部署时必须改为空后重新构建 |

> 这两个变量是唯一真值：`src/utils/constants.js`、`request.js`、`router.jsx` 与 Nginx 配置都据此推导，不要在业务代码里另写死路径。

---

## 工程配置说明

`vite.config.js` 关键点：

| 配置 | 作用 |
| --- | --- |
| `base` | 取 `VITE_BASE_PATH`，子路径部署时资源引用自动带前缀 |
| `resolve.alias.src` | `src` → `/src`，业务代码统一用 `import x from 'src/...'` |
| `server.port / strictPort` | 固定 `8181`，端口冲突直接失败，避免代理错位 |
| `server.proxy` | API、健康检查、上传文件三类转发到 `8180` |
| `inject-app-title` 插件 | 构建时用 `src/config/app.js` 的 `APP_NAME` 覆盖 `index.html` 标题 |
| `compression` 插件 | 10KB 以上产物额外生成 `.gz` / `.br`，供 Nginx 直接下发 |
| `build.outDir` | 输出到 `web/` |
| `manualChunks` | `vendor-arco`、`vendor-arco-icon`、`vendor-react`、`vendor-axios` 独立分包，利于长期缓存 |
| `chunkSizeWarningLimit` | 1100KB，避免组件库大包反复触发告警 |

构建产物命名：入口 `assets/js/[name]-[hash].js`，异步 chunk `assets/js/chunks/`，其他资源 `assets/[ext]/`。

---

## 常用命令

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | 启动开发服务器（HMR，8181） |
| `npm run build` | 生产构建，输出 `web/` |
| `npm run preview` | 本地预览构建产物 |
| `npm run lint` | ESLint 全量检查 |
| `npm run format` | Prettier 格式化 `src/**/*.{js,jsx,css}` |
| `npm run test` | 运行 Vitest 单测（`vitest run`，非 watch） |

提交前建议至少执行：

```bash
npm run lint && npm run test
```

测试用例位于 `src/test/`，覆盖表达式求值（含黑名单校验）、下载文件名处理、分页全量取数、页签 LRU 缓存与后端菜单映射；修改这些工具函数时先补或跑对应用例。

---

## 构建与部署

### 生产构建

```bash
npm run build
```

产物结构：

```text
web/
├── index.html
└── assets/
    ├── js/
    │   ├── index-[hash].js
    │   └── chunks/            # 页面懒加载 chunk + vendor-* 分包
    ├── css/
    └── ...                    # 图片、字体，以及同名 .gz / .br
```

### 部署到 Nginx（子路径 `/oa`）

当前 `.env.production` 的 `VITE_BASE_PATH=/oa`，对应 Nginx 配置：

```nginx
server {
    listen 80;
    server_name oa.example.com;

    # 构建产物放到 /var/www/oa（子路径部署用 root，不要用 alias：
    # alias 与 try_files 组合时 $uri 仍带 /oa 前缀，会导致静态资源 404）
    location /oa/ {
        root /var/www;
        try_files $uri $uri/ /oa/index.html;
    }

    # 预压缩产物直接下发（构建已生成 .gz / .br）
    gzip_static on;
    # brotli_static on;   # 需 Nginx 编译 brotli 模块

    # 后端 API
    location /v1/api/ {
        proxy_pass http://127.0.0.1:8180;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # 通知 SSE：关闭缓冲，否则断线后页面无法感知，也不会自动重连
    location = /v1/api/notifications/stream {
        proxy_pass http://127.0.0.1:8180;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host $host;
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 3600s;
        add_header X-Accel-Buffering no;
    }

    # 附件
    location /uploads/ {
        proxy_pass http://127.0.0.1:8180;
    }
}
```

### 部署注意

1. **子路径**：部署到根路径时把 `.env.production` 的 `VITE_BASE_PATH` 改为空并重新构建，否则资源会 404。
2. **SPA fallback**：所有非静态路径回退到对应 `index.html`，否则刷新子路由会 404。
3. **缓存策略**：`assets/` 下带 hash 的资源可长期缓存（`Cache-Control: max-age=31536000, immutable`）；`index.html` 不缓存。
4. **SSE**：必须关闭代理缓冲，`proxy_read_timeout` 建议 ≥ 1 小时。
5. **跨域**：同域反代时后端可关闭 CORS；分离部署时需同步后端 `server.cors.allow_origins`。

---

## 开发规范

| 约定 | 说明 |
| --- | --- |
| 目录归属 | 页面按业务域放 `pages/<domain>/`；跨页面复用组件放全局 `components/`，域内复用放 `pages/<domain>/components/` |
| 接口层 | 所有请求在 `src/api/` 封装，组件内不直接写 URL；统一走 `request.js` 实例 |
| 路径引用 | 使用 `src` 别名，避免 `../../` 相对路径 |
| 样式 | 优先 Tailwind 原子类；复杂样式用独立 CSS，避免行内魔数与硬编码颜色 |
| 状态 | 全局（登录态、页签）用 `store/` Context；页面局部用 `useState` / `useReducer` |
| 路由 | 新增菜单页面时在 `router.jsx` 的 `PAGE_MAP` 注册「路径模式 → 组件」；纯动态流程页交给 `DynamicPage` |
| 页面加载 | 页面组件统一 `lazy()` + `Suspense`；错误边界隔离到页面级，避免整页白屏 |
| 代码质量 | 提交前 `npm run lint`、`npm run format`；新增工具函数补 `src/test/` 单测 |

---

## 常见问题

| 现象 | 排查方向 |
| --- | --- |
| `npm run dev` 报端口占用 | `strictPort` 固定 8181，先释放端口或改 `server.port` 并同步后端 CORS |
| 接口 404 / 502 | 后端是否在 8180；代理前缀是否与 `VITE_API_PREFIX` 一致 |
| 登录后立即跳回登录页 | Token 过期、后端 `jwt.secret` 变更或系统时间偏差 |
| 构建后页面白屏 / 资源 404 | `VITE_BASE_PATH` 与 Nginx 的 location 是否匹配 |
| 刷新子路由 404 | Nginx 缺少 SPA fallback（`try_files ... /index.html`） |
| 通知不实时、断线不恢复 | 代理未对 SSE 关闭缓冲；参考上文 Nginx 配置 |
| 构建内存不足 | 关闭 sourcemap、分批构建或提高 Node 内存（`NODE_OPTIONS=--max-old-space-size=4096`） |
| 样式与组件库冲突 | Tailwind 与 Arco 的 reset 顺序，检查 `index.css` 引入顺序 |

---

## 相关文档

- 项目总览：[`../README.md`](../README.md)
- 后端说明：[`../back-end/README.md`](../back-end/README.md)
