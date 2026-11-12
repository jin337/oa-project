# OA 低代码审批系统

> 配置驱动的 OA 平台：动态表单 + 流程编排 + 审批工作台 + 接口管理，前后端一体化实现。

---

## 目录

- [项目简介](#项目简介)
- [核心技术栈](#核心技术栈)
- [仓库结构](#仓库结构)
- [环境依赖](#环境依赖)
- [本地开发与运行](#本地开发与运行)
- [配置文件说明](#配置文件说明)
- [构建与部署](#构建与部署)
- [功能模块](#功能模块)
- [核心机制](#核心机制)
- [常见问题](#常见问题)
- [文档导航](#文档导航)

---

## 项目简介

本仓库是一个完整可运行的 OA 审批系统，核心思路是**配置驱动**：不改代码，通过「流程配置」模块完成 **建应用 → 配业务表 → 配表单元素 → 拖拽布局 → 配审批流 → 发起审批** 的全链路闭环。

| 能力 | 说明 |
| --- | --- |
| 动态表单 | 表单与详情页由后端布局 JSON 驱动渲染，支持数据源、联动赋值、显隐/禁用表达式、校验规则、主子表 |
| 流程编排 | 可视化流程画布，审批人支持指定人员 / 角色 / 发起人自选 / 审核人员组，节点支持依次、会签、或签 |
| 审批工作台 | 发起、待办、我的发起、经我处理、抄送我的、草稿箱，支持同意 / 退回 / 拒绝 / 加签 / 转交 / 撤回 / 催办 |
| 接口管理 | SQL 直查与 HTTP 转发双模式，统一分发端点对外暴露，表单元素可直接引用 |
| 系统管理 | 用户、角色、菜单、部门、审核人员组、操作审计，菜单与按钮级权限 + 五档数据权限 |
| 实时通知 | 待办 / 退回 / 抄送 / 结果事件经 SSE 推送，多标签页同步未读数 |

仓库由两个独立子项目组成，各自有完整文档：

| 子项目 | 角色 | 默认端口 |
| --- | --- | --- |
| [`back-end`](back-end/README.md) | Go + Gin + GORM 服务端：REST API、动态数据读写、审批状态机、SSE、后台任务 | `8180` |
| [`front-end`](front-end/README.md) | React 19 + Vite + Arco Design 单页应用：全部业务界面与表单运行时 | `8181` |

---

## 核心技术栈

| 层 | 技术 | 版本 | 用途 |
| --- | --- | --- | --- |
| 后端语言 | Go | 1.26.2 | 服务端，handler / service / model 分层 |
| Web 框架 | Gin | v1.12.0 | 路由分组、中间件链 |
| ORM | GORM | v1.31.2 | MySQL 访问、版本化自动迁移 |
| 鉴权 | golang-jwt/jwt | v5.3.1 | HS256 Bearer Token |
| 参数校验 | go-playground/validator | v10.30.3 | 请求体校验与中文错误翻译 |
| 数据导入导出 | excelize | v2.11.1 | Excel 导入导出 |
| 数据库 | MySQL | 5.7+ | utf8mb4，表统一 `oa_` 前缀 |
| 前端框架 | React | 19.2 | 函数组件 + Hooks |
| 构建工具 | Vite | 8.2 | 开发服务器、分包、gzip/brotli 预压缩 |
| 路由 | react-router-dom | 7.18 | 菜单树驱动动态路由、页面懒加载 |
| 组件库 | Arco Design | 2.66 | 表格、表单、抽屉、时间线、流程画布 |
| 样式 | Tailwind CSS | 4.1 | 原子化样式 |
| HTTP | axios | 1.7 | 统一实例、拦截器、Token 注入 |
| 测试 | Vitest / go test | 5.0 / 标准库 | 前后端单测与 CI 门禁 |
| CI | GitHub Actions | - | 格式、静态检查、测试、构建 |

---

## 仓库结构

```text
full-stack-project/
├── back-end/                     # 后端服务（Go / Gin / GORM / MySQL）
│   ├── cmd/server/               #   入口：配置 → 日志 → 数据库 → 迁移 → 路由 → 后台任务 → 优雅停机
│   ├── configs/                  #   config-dev.yaml / config-test.yaml / config-prod.yaml
│   ├── internal/
│   │   ├── config/               #     配置加载与默认值
│   │   ├── database/             #     连接、建库、版本化迁移与初始化数据
│   │   ├── middleware/           #     JWT、CORS、超时、限流、安全头、数据权限、操作审计
│   │   ├── model/                #     GORM 模型
│   │   ├── handler/              #     HTTP 控制器
│   │   ├── service/              #     业务逻辑（审批、通知、导出等）
│   │   ├── router/               #     路由装配与各模块注册
│   │   ├── pkg/                  #     idgen / logger / response / vtrans
│   │   └── test/                 #     Go 单元与集成测试
│   ├── logs/                     #   运行日志（app-{env}.log / gin.log / migrate-{env}.log）
│   ├── uploads/                  #   上传文件（按 app_code 分目录）
│   ├── bin/                      #   发布构建产物
│   ├── Taskfile.yml              #   task run / build / package / test / vet / clean
│   └── README.md                 #   后端完整文档
├── front-end/                    # 前端 SPA（React / Vite / Arco / Tailwind）
│   ├── src/
│   │   ├── api/                  #     axios 实例与按模块封装的接口
│   │   ├── components/           #     通用组件
│   │   ├── config/               #     应用名、页签缓存策略
│   │   ├── pages/                #     application / approval / interface / layout / notification / profile / system
│   │   ├── store/                #     auth-context / tab-context
│   │   ├── utils/ hooks/ test/   #     工具、Hooks、单测
│   │   ├── views/                #     Login 与 MainLayout
│   │   └── router.jsx            #     菜单树驱动的路由与 PAGE_MAP
│   ├── web/                      #   生产构建产物
│   ├── .env.development          #   开发环境变量
│   ├── .env.production           #   生产环境变量
│   ├── vite.config.js            #   端口、代理、分包、压缩、标题注入
│   └── README.md                 #   前端完整文档
├── .github/workflows/ci.yml      # CI：后端 gofmt/vet/build/test，前端 lint/test/build
└── README.md                     # 本文件（项目总览）
```

---

## 环境依赖

| 依赖 | 版本要求 | 用途 |
| --- | --- | --- |
| Go | 1.26.2（与 `go.mod` 一致） | 后端编译运行 |
| MySQL | 5.7+（推荐 8.0） | 业务库，库不存在时后端自动创建 |
| Node.js | ≥ 20.19，推荐 22 LTS（CI 使用 24） | 前端 Vite 8 要求 |
| npm | ≥ 10 | 前端依赖与构建 |
| Task | 最新（可选） | 后端任务封装，`winget install go-task.go-task` |
| air | 最新（可选） | 后端热重载，`task run-dev` 依赖 |
| UPX | 最新（可选） | `task package` 压缩可执行文件 |

数据库需支持 `utf8mb4`；后端启动时自动 `CREATE DATABASE IF NOT EXISTS`，只需保证账号有建库、建表权限。

---

## 本地开发与运行

### 1. 准备数据库

编辑 `back-end/configs/config-dev.yaml` 的 `mysql` 段（默认 `127.0.0.1:3306`，库 `oa_test` 自动创建）：

```yaml
mysql:
  host: 127.0.0.1
  port: 3306
  username: root
  password: "<你的数据库密码>"
  dbname: oa_test
  table_prefix: oa_
```

### 2. 启动后端（8180）

```bash
cd back-end
task run          # 默认 APP_ENV=dev
# 或 go run ./cmd/server
# 或 task run-dev（需已安装 air，保存即重启）
```

首次以 `migrate.mode: full` 启动会建表并写入初始化数据（超级管理员 **admin / admin123**、基础菜单与部门）；之后启动按 `migrate_versions` 记录跳过已应用的迁移，不会重复写入。

### 3. 启动前端（8181）

```bash
cd front-end
npm install
npm run dev
```

Vite 固定 `8181` 端口（`strictPort`），自动打开浏览器，并把 `/v1/api`、`/uploads`、`/health` 代理到 `8180`。

### 4. 验证服务

```bash
# 后端健康检查：HTTP 200 + code=0 表示进程在线，db_status=ok 表示数据库可用
curl http://127.0.0.1:8180/

# 前端
# 浏览器打开 http://localhost:8181/，使用 admin / admin123 登录
```

### 5. 启动顺序与停止

推荐顺序：**MySQL → 后端 → 前端**。停止时先停前端，再向后端发送 `Ctrl+C`（等价 `SIGINT`/`SIGTERM`），后端会在 5 秒内完成优雅停机。

> 生产环境务必修改默认管理员密码与 `server.jwt.secret`。

---

## 配置文件说明

### 后端

配置文件位于 `back-end/configs/`，由环境变量 `APP_ENV` 选择：`dev`（默认）/ `test` / `prod`。详细字段见 [`back-end/README.md`](back-end/README.md#配置文件说明)。

| 配置块 | 关键字段 | 说明 |
| --- | --- | --- |
| `server` | `port` / `mode` / `api_prefix` / `request_timeout` | 监听端口 `8180`、Gin 模式、API 前缀 `/v1/api`、请求超时 10s |
| `server.jwt` | `secret` / `expire` / `issuer` | 签名密钥（生产必须更换）、有效期 24h、签发者 |
| `server.log` | `level` / `path` | 日志级别与文件路径（`logs/app-{env}.log`） |
| `server.cors` | `enable` / `allow_origins` | 同域反代可关闭；分离部署需写具体域名 |
| `server.security` | 限流、登录锁定、`trusted_proxies`、安全头 | 单实例进程内计数，多实例需换 Redis |
| `server.operation_log` | `retain_days` / `cleanup_interval_hours` | 操作审计留存与清理周期 |
| `mysql` | `host` / `port` / `dbname` / `table_prefix` / `parse_time` / `loc` / 连接池 | 库名、表前缀、时区、连接池与超时 |
| `mysql.migrate` | `enable` / `mode` / `log_*` | 自动迁移开关；`full` 全量建表 + 初始化数据，`incremental` 仅增量 |

### 前端

| 位置 | 变量 | 当前值 | 说明 |
| --- | --- | --- | --- |
| `front-end/.env.development` | `VITE_API_PREFIX` | `/v1/api` | 开发环境 API 前缀 |
| `front-end/.env.development` | `VITE_BASE_PATH` | 空 | 开发环境部署于根路径 |
| `front-end/.env.production` | `VITE_API_PREFIX` | `/v1/api` | 生产环境 API 前缀 |
| `front-end/.env.production` | `VITE_BASE_PATH` | `/oa` | 生产默认子路径，改根路径需置空后重新构建 |
| `front-end/vite.config.js` | - | - | 端口 `8181`、代理目标 `8180`、产物 `web/`、分包与预压缩 |
| `front-end/src/config/app.js` | `APP_NAME` | - | 构建时注入页面标题 |

### 端口与路径约定

| 项 | 值 | 位置 |
| --- | --- | --- |
| 后端服务 | `8180` | `server.port` |
| API 前缀 | `/v1/api` | `server.api_prefix` + `VITE_API_PREFIX` |
| 健康检查 | `GET /` | 后端根路径 |
| 附件访问 | `/uploads/*` | 后端静态目录 |
| 前端开发端口 | `8181` | `vite.config.js` |
| 前端生产 base | `/oa` | `VITE_BASE_PATH` |
| 前端构建产物 | `front-end/web/` | `vite.config.js` 的 `outDir` |

> API 版本号变更（如 `v1` → `v2`）只需同步后端 `api_prefix`、前端 `VITE_API_PREFIX` 与 Nginx 反代路径，业务代码无需改动。

---

## 构建与部署

### 构建

| 目标 | 命令 | 产物 |
| --- | --- | --- |
| 后端本地编译 | `cd back-end && task build` | `back-end/oa_serve_main`（Windows 为 `.exe`） |
| 后端发布包 | `cd back-end && task package` | `back-end/bin/oa_serve_main`（`-s -w` 裁剪 + UPX 压缩，默认注入 prod 环境） |
| 前端生产包 | `cd front-end && npm run build` | `front-end/web/`（含 `.gz` / `.br` 预压缩） |

`task package` 通过 `-ldflags "-X 'back-end/internal/config.DefaultEnv=prod'"` 把默认环境设为 `prod`，部署时仍可用 `APP_ENV` 覆盖。

### 部署拓扑

```text
                 ┌──────────────────────────────┐
  浏览器 ──────► │ Nginx :80                    │
                 │  /oa/      → 前端 web/        │
                 │  /v1/api/  → 后端 :8180       │
                 │  /uploads/ → 后端 :8180       │
                 │  SSE 路径  → 关闭代理缓冲      │
                 └──────────────┬───────────────┘
                                │
                        back-end :8180 ──► MySQL
```

前端 `web/` 放到 `/var/www/oa`，Nginx 示例：

```nginx
server {
    listen 80;
    server_name oa.example.com;

    # 子路径部署：root 指向 web/ 的上级目录
    location /oa/ {
        root /var/www;
        try_files $uri $uri/ /oa/index.html;
    }

    location /v1/api/ {
        proxy_pass http://127.0.0.1:8180;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # SSE 必须关闭缓冲，否则断线事件不会下发
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

    location /uploads/ {
        proxy_pass http://127.0.0.1:8180;
    }
}
```

后端建议交由 systemd 守护：

```ini
[Service]
Type=simple
WorkingDirectory=/opt/oa
Environment=APP_ENV=prod
ExecStart=/opt/oa/oa_serve_main
Restart=always
RestartSec=5
```

### 部署清单

1. 备份数据库；确认 `server.jwt.secret`、数据库密码已替换为生产值。
2. 生产建议关闭自动迁移（`mysql.migrate.enable: false`），迁移脚本先在测试库验证。
3. 确保 `uploads/` 目录存在且进程可写；为 `logs/` 预留磁盘与轮转策略。
4. 校验 API 前缀、`VITE_BASE_PATH`、Nginx location 三者一致。
5. SSE 路径关闭代理缓冲与缓存，`proxy_read_timeout` ≥ 1 小时。
6. 前端 `index.html` 不缓存，`assets/` 下带 hash 的资源长缓存。
7. 多实例部署时，限流与登录锁定需改为 Redis 共享计数。

### CI

`.github/workflows/ci.yml` 在 `main` 推送与所有 PR 上执行：

- 后端：`go mod verify` → `gofmt` 检查 → `go vet` → `go build` → `go test ./... -count=1`
- 前端：`npm ci` → `npm run lint` → `npm test` → `npm run build` → 校验 `web/index.html` 存在

---

## 功能模块

```text
系统管理
├── 用户 / 角色 / 菜单 / 部门
└── 审核人员组、操作审计

流程配置（/application*）
├── 应用管理、业务表字段管理
├── 表单元素管理（数据源 / 联动 / 校验，可引用接口）
├── 布局管理（表单页与详情页可视化拖拽）
└── 审批管理（发起人范围 + 流程画布）

审批工作台（/approval*）
├── 发起申请、我的待办、我的发起、经我处理、抄送我的、草稿箱
└── 审批详情（业务表单 + 流程时间线 + 状态印章）

接口管理（/interface）
└── SQL 直查 / HTTP 转发定义、试调、路由导入、引用统计

通知中心（/notification）
└── 站内通知、未读计数、SSE 实时更新
```

---

## 核心机制

| 机制 | 要点 | 详细说明 |
| --- | --- | --- |
| 菜单与按钮权限 | 角色分配菜单，前端由后端菜单树生成路由，页面内用 `AuthButton` 做按钮级权限 | [前端文档](front-end/README.md) |
| 数据权限 | 角色配置 1-5 档范围：全部 / 自定义部门 / 本部门 / 本部门及下级 / 仅本人；部门维度与仅本人并存取并集 | [后端文档](back-end/README.md) |
| 动态表单 | 布局 JSON 只存元素引用与位置，渲染时合并元素属性；支持 `form.xxx` / `item.xxx` / `${}` 表达式 | [后端文档](back-end/README.md) |
| 审批状态机 | 草稿(6) → 进行中(0) → 已通过(1) / 已拒绝(2) / 已退回(3)，支持撤回；退回后重新提交走完整流程 | [后端文档](back-end/README.md) |
| 接口统一分发 | 外部只认 `method + path`，内部 SQL / HTTP 实现可切换；被引用接口禁止删除 | 见下文 |
| 即时通知 | 审批事件在事务提交后推送，SSE 心跳保活，多标签页广播同步 | [前端文档](front-end/README.md) |
| 文件上传 | `POST /v1/api/upload?app_code=xxx`，按应用分目录存储，经 `/uploads/*` 访问 | [后端文档](back-end/README.md) |

**接口统一分发**：`GET/POST/PUT/DELETE /v1/api/interfaces/*path` 按 `method + path` 匹配已启用定义；`type=sql` 仅允许 SELECT 模板，`type=http` 转发内部相对路径并原样透传结果。表单元素可在数据源与 `fetch_and_fill` 中引用接口，运行时自动走统一分发。

---

## 常见问题

| 现象 | 排查方向 |
| --- | --- |
| 后端启动报数据库连接失败 | MySQL 是否运行、账号密码与 `config-dev.yaml` 是否一致、账号是否有建库权限 |
| 端口被占用 | 后端改 `server.port`；前端 `strictPort` 固定 8181，需释放端口或改配置并同步代理 |
| 登录 401 / 立即跳回登录页 | Token 过期、`jwt.secret` 变更、系统时间偏差 |
| 前端接口 404 / 502 | 后端是否在 8180、`VITE_API_PREFIX` 与 Nginx 反代是否一致 |
| 生产构建后白屏 | `VITE_BASE_PATH` 与 Nginx location 不匹配，或缺少 SPA fallback |
| 通知不实时、断线不恢复 | 代理未对 SSE 关闭缓冲，或缺 `X-Accel-Buffering: no` |
| 上传失败 / 附件 403 | `uploads/` 目录权限、Nginx `/uploads/` 反代配置 |
| 迁移失败但服务仍启动 | 迁移失败只记录日志不阻断；查看 `logs/migrate-{env}.log` 后重跑 |
| 多实例下限流失效 | 限流与锁定为进程内计数，需改 Redis 共享实现 |

---

## 文档导航

| 文档 | 内容 |
| --- | --- |
| [`back-end/README.md`](back-end/README.md) | 后端：技术栈、目录结构、环境依赖、启动与配置全字段、运行时后台任务、构建部署（含 SSE 与 systemd）、API 约定、常见问题 |
| [`front-end/README.md`](front-end/README.md) | 前端：技术栈、目录结构、环境依赖、启动与环境变量、工程配置、常用命令、构建部署（`/oa` 子路径与 SSE）、开发规范、常见问题 |
| [`.github/workflows/ci.yml`](.github/workflows/ci.yml) | CI 流水线定义 |
