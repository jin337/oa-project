# front-end

承接同级目录 `back-end`（Go + Gin RBAC 服务，端口 8180）的前端项目。

## 技术栈

- React 18 + Vite 6 + Tailwind CSS v4 + Arco Design（@arco-design/web-react）
- react-router v6 Data Mode（createBrowserRouter + RouterProvider，loader 做登录守卫）
- axios 封装统一处理后端返回格式

## 启动

```bash
npm install
npm run dev      # 开发：http://localhost:8181（固定端口）
npm run build    # 生产构建，产物输出到 dist/
```

## 构建产物：分包与压缩

- **依赖分包**（`manualChunks`）：`vendor-react`（react/react-dom/react-router-dom）、`vendor-arco`（Arco Design）、`vendor-axios` 各自独立成包，依赖不变时浏览器可长期缓存，业务代码更新不牵连
- **路由级懒加载**：登录页与 4 个系统管理页、工作台、404 均通过 `lazy()` 单独分包，访问时按需下载
- **产物压缩**（vite-plugin-compression2）：≥10KB 的资源在构建时额外生成 `.gz`（gzip 最高级别）与 `.br`（brotli 最高级别）文件，Nginx 配置 `gzip_static on; brotli_static on;` 即可直接下发预压缩文件

## 接口对接约定

- 后端统一前缀 `/api/v1`，统一返回 `{code, msg, data, timestamp}`，`code=0` 成功
- 开发环境由 Vite 代理转发：`/api` → `http://localhost:8180/api`，`/health` → 后端根路径健康检查
- 鉴权接口请求头携带 `Authorization: Bearer <token>`（登录成功后自动写入）
- `code=401` 或 HTTP 401 时自动清除本地 token 并跳回登录页

## 目录结构

```
front-end/
├── index.html                    # 入口 HTML
├── vite.config.js                # 端口 8181 + 接口代理配置
├── src/
│   ├── main.jsx                  # 应用挂载
│   ├── App.jsx                   # Data Mode 路由定义（含登录守卫）
│   ├── index.css                 # Tailwind 入口与全局样式
│   ├── api/                      # 接口封装（request 拦截器 + 各模块）
│   │   ├── request.js            # axios 实例：统一错误提示 / 401 处理
│   │   ├── auth.js               # 登录 / 用户资料 / 菜单
│   │   ├── user.js               # 用户管理
│   │   ├── role.js               # 角色管理
│   │   ├── menu.js               # 菜单管理
│   │   └── dept.js               # 部门管理
│   ├── store/auth-context.jsx    # 登录态全局 Context（token/用户/菜单/权限）
│   ├── utils/auth.js             # token 存取
│   ├── components/layout.jsx     # 后台布局：侧边菜单由后端菜单树动态渲染
│   └── pages/
│       ├── Login.jsx             # 登录
│       ├── Dashboard.jsx         # 工作台（展示后端健康检查与当前账号）
│       ├── NotFound.jsx          # 404
│       └── system/               # 系统管理：用户 / 角色 / 菜单 / 部门
└── public/favicon.svg
```

## 功能说明

| 页面 | 说明 |
| --- | --- |
| 登录 | 用户名 + 密码，默认账号 `admin` / `admin123`（后端初始化） |
| 工作台 | 展示后端服务健康状态与当前登录账号 |
| 用户管理 | 分页列表、用户名搜索、部门筛选、增删改、分配角色 |
| 角色管理 | 分页列表、增删改、分配菜单（树勾选）、自定义数据范围绑定部门 |
| 菜单管理 | 树形表格、新增子项、支持目录/页面菜单/按钮三种类型 |
| 部门管理 | 树形表格、新增子部门、增删改 |

侧边栏菜单通过 `GET /api/v1/auth/profile` 返回的菜单树动态渲染，按 `sort` 排序、过滤停用项，按钮类权限项（type=3）不渲染为菜单。

新增工具
usePermission.js — 权限判断 Hook：
hasPerm('system:user:add') — 单个权限判断
hasAnyPerm('perm1', 'perm2') — OR 匹配（满足任一）
hasAllPerms('perm1', 'perm2') — AND 匹配（全部满足）
AuthButton.jsx — 权限按钮组件：
<AuthButton perm="system:user:add"> — 无权限时不渲染
fallback="disable" — 无权限时渲染为禁用
perm={['perm1', 'perm2']} — 支持多权限数组
mode="all" — 切换为 AND 匹配
