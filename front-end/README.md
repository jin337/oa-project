# OA 管理系统 · 前端

基于 **React 19 + Vite 8 + Arco Design + Tailwind CSS v4** 的 OA 管理系统前端，包含动态表单设计器、审批列表、流程配置、接口管理等模块。

---

## 目录

- [项目简介](#项目简介)
- [核心技术栈](#核心技术栈)
- [目录结构](#目录结构)
- [环境依赖](#环境依赖)
- [快速开始](#快速开始)
- [环境变量与配置](#环境变量与配置)
- [常用命令](#常用命令)
- [构建与部署](#构建与部署)
- [开发规范](#开发规范)

---

## 项目简介

本仓库是 OA 全栈项目的前端层，主要功能模块：

- **登录与布局**：JWT 鉴权、菜单动态渲染、多页签（Tabs）管理、面包屑。
- **流程配置**：应用列表、表单设计器（拖拽布局、属性面板、左右侧栏折叠）、版本管理、表字段管理。
- **审批管理**：我的待办 / 我的发起 / 经我处理 / 抄送我的 / 草稿箱五合一列表、详情抽屉、审批操作、抄送弹窗。
- **接口管理**：自定义 SQL / HTTP 接口配置、运行时按权限分发。
- **系统管理**：用户、角色、部门、审核人员组等基础数据维护。

---

## 核心技术栈

| 分类 | 技术 | 版本 | 说明 |
| --- | --- | --- | --- |
| 框架 | React | 19 | 函数组件 + Hooks |
| 构建 | Vite | 8 | 开发服务器、HMR、分包构建 |
| 路由 | react-router-dom | 7 | 数据路由、嵌套 Outlet |
| UI | @arco-design/web-react | 2.66 | 组件库（按需引入） |
| 样式 | Tailwind CSS | 4 | 原子化 CSS（Vite 插件接入） |
| HTTP | axios | 1.7 | 统一封装、拦截器 |
| 状态 | Context + Hooks | - | 轻量全局状态（auth / tabs） |
| 测试 | Vitest | 5 | 单元测试 |
| Lint | ESLint 9 + Prettier | - | 统一代码风格 |

---

## 目录结构

```
front-end/
├── public/                 # 静态资源（不经过构建处理）
├── src/
│   ├── api/                # 后端接口封装（按模块分文件）
│   ├── components/          # 全局通用组件
│   ├── config/              # 全局常量（应用名、大小选项等）
│   ├── error/              # 错误页
│   ├── hooks/              # 通用 Hooks
│   ├── pages/              # 业务页面
│   │   ├── application/    # 流程配置（应用、表单设计器、版本、字段）
│   │   ├── approval/      # 审批管理（列表页 + 公共组件）
│   │   ├── system/         # 系统管理
│   │   └── ...
│   ├── store/              # 全局 Context（auth-context、tab-context）
│   ├── utils/              # 工具函数（请求封装、格式化、常量）
│   ├── views/              # 布局组件（MainLayout、HeaderBar、TabsBar）
│   ├── App.jsx             # 根组件
│   ├── main.jsx            # 入口
│   └── router.jsx          # 路由配置
├── .env.development        # 开发环境变量
├── .env.production         # 生产环境变量
├── vite.config.js          # Vite 配置（代理、别名、分包）
├── eslint.config.js        # ESLint 配置
├── .prettierrc              # Prettier 配置
├── jsconfig.json           # 路径别名提示
├── index.html              # HTML 模板
└── package.json
```

---

## 环境依赖

| 依赖 | 版本要求 | 说明 |
| --- | --- | --- |
| Node.js | ≥ 20 | 推荐 20 LTS 或更高 |
| pnpm / npm | npm 9+ | 仓库使用 npm，也可自行切换 pnpm |
| 后端服务 | - | 需先启动 Go 后端（默认 `http://localhost:8180`） |

---

## 快速开始

### 1. 安装依赖

```bash
cd front-end
npm install
```

### 2. 启动开发服务器

```bash
npm run dev
```

默认监听 **`http://localhost:8181`**，自动打开浏览器。开发服务器已配置代理，将 `/v1/api` 与 `/uploads` 转发到后端 `8180` 端口，无需手动处理跨域。

### 3. 与后端联调

确保后端服务已启动（见 `back-end/README.md`），前端登录后即可拉取动态菜单与业务数据。

---

## 环境变量与配置

环境变量位于项目根目录：

| 文件 | 用途 |
| --- | --- |
| `.env.development` | `npm run dev` 时加载 |
| `.env.production` | `npm run build` 时加载 |

### 变量说明

| 变量 | 说明 | 示例 |
| --- | --- | --- |
| `VITE_API_PREFIX` | 后端 API 统一前缀，需与后端 `config-*.yaml` 中的 `server.api_prefix` 对齐 | `/v1/api` |
| `VITE_BASE_PATH` | 部署子路径，空表示根路径；部署到子目录时填 `/oa` | 空 / `/oa` |

> 修改 API 版本号或部署子路径时，**只需要改这两个变量**，无需改动业务代码。

### Vite 关键配置（`vite.config.js`）

- **别名**：`src` 指向 `/src`，避免层层 `../../`。
- **开发代理**：`/v1/api`、`/health`、`/uploads` 转发到 `http://localhost:8180`。
- **分包策略**：Arco、Arco Icon、React、Axios 独立 chunk，便于长期缓存。
- **资源压缩**：10KB 以上产物额外生成 `.gz` / `.br`。
- **标题注入**：构建时自动把 `APP_NAME` 写入 `index.html` 的 `<title>`。

---

## 常用命令

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | 启动开发服务器（HMR，端口 8181） |
| `npm run build` | 生产构建，产物输出到 `web/` 目录 |
| `npm run preview` | 本地预览生产构建产物 |
| `npm run lint` | ESLint 检查 |
| `npm run format` | Prettier 格式化 `src/` 下 js/jsx/css |
| `npm run test` | 运行 Vitest 单元测试 |

---

## 构建与部署

### 生产构建

```bash
npm run build
```

产物输出到 **`web/`** 目录，结构如下：

```
web/
├── index.html
└── assets/
    ├── js/        # 业务 JS + 第三方 chunk（带 hash）
    ├── css/       # 样式
    └── ...
```

### 部署到 Nginx

1. 将 `web/` 目录内容拷贝到 Nginx 静态目录。
2. 若部署在子路径，修改 `.env.production` 中 `VITE_BASE_PATH=/your-sub-path` 后重新构建。
3. Nginx 配置要点：
   - SPA fallback：`try_files $uri /index.html;`
   - API 反代：将 `VITE_API_PREFIX`（默认 `/v1/api`）转发到 Go 后端。
   - 上传文件：`/uploads` 同样反代到后端或共享存储。

示例片段：

```nginx
server {
  listen 80;
  root /var/www/oa-web;

  location / {
    try_files $uri $uri/ /index.html;
  }

  location /v1/api/ {
    proxy_pass http://127.0.0.1:8180;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
  }

  location /uploads/ {
    proxy_pass http://127.0.0.1:8180;
  }
}
```

---

## 开发规范

- **目录约定**：页面按业务域放在 `pages/` 下；跨页面复用的组件放在 `pages/<domain>/components/` 或全局 `components/`。
- **接口层**：所有后端请求统一在 `src/api/` 封装，组件内不直接写 axios URL。
- **样式**：优先使用 Tailwind 原子类；复杂样式使用 `<style jsx>` 或独立 CSS 文件，避免内联魔数。
- **状态管理**：跨页签/全局数据用 Context（`store/`）；页面局部状态用 `useState` / `useReducer`。
- **代码风格**：提交前运行 `npm run lint` 与 `npm run format`；ESLint 与 Prettier 规则已配置好。
- **路径引用**：使用 `src/` 别名，例如 `import { x } from 'src/utils/request'`。
