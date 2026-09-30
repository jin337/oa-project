# OA 低代码审批系统（full-stack-project）

> 前后端一体化的低代码审批平台：动态表单 + 流程编排 + 审批工作台 + 接口管理

## 目录

- [项目简介](#项目简介)
- [仓库结构](#仓库结构)
- [技术栈总览](#技术栈总览)
- [功能模块](#功能模块)
- [快速开始](#快速开始)
- [配置说明](#配置说明)
- [构建与部署](#构建与部署)
- [核心机制](#核心机制)
- [关键设计决策](#关键设计决策)
- [文档导航](#文档导航)

## 项目简介

本仓库为 OA 管理系统的完整前后端实现，采用「配置驱动」的低代码思路：在不改代码的前提下，通过**流程配置**模块完成「建应用 → 配字段 → 配表单 → 配布局 → 配审批流 → 发起审批」的全链路闭环。

仓库由两个子项目组成：

| 子项目 | 说明 | 端口 |
| --- | --- | --- |
| `back-end` | Go + Gin + GORM 后端服务，提供 RESTful API、动态业务数据读写、审批状态机、SSE 实时通知 | 8180 |
| `front-end` | React 19 + Vite + Arco Design 前端 SPA，承接全部业务界面与动态表单运行时 | 8181 |

## 仓库结构

```
full-stack-project/
├── back-end/                 # 后端服务（Go/Gin/GORM/MySQL）
│   ├── cmd/server/           #   入口：配置 → 日志 → 数据库 → 迁移 → 路由 → 优雅停机
│   ├── configs/              #   环境配置（config-{dev,test,prod}.yaml，APP_ENV 切换）
│   ├── internal/             #   config / database / middleware / model / router / handler / service / pkg
│   ├── uploads/              #   上传文件存储根目录（按 app_code 分目录）
│   ├── Taskfile.yml          #   任务封装（run-dev / build / test / package 等）
│   └── README.md             #   后端完整文档（接口清单 / 核心机制 / 部署）
├── front-end/                # 前端 SPA（React/Vite/Arco/Tailwind）
│   ├── src/
│   │   ├── pages/            #   页面：system / application（流程配置）/ approval / interface 等
│   │   ├── api/              #   接口封装（统一 axios 实例）
│   │   ├── components/       #   布局、权限按钮、通知铃铛等
│   │   ├── store/            #   AuthContext / TabContext
│   │   ├── utils/ hooks/ test/
│   │   └── router.jsx        #   菜单树驱动的动态路由
│   ├── vite.config.js        #   8181 端口 + /api 代理 + 构建分包/预压缩
│   └── README.md             #   前端完整文档（核心机制 / 配置 / 部署）
└── README.md                 # 本文件（仓库总览）
```

## 技术栈总览

| 层 | 技术 | 版本要点 | 说明 |
| --- | --- | --- | --- |
| 后端语言 | Go | 1.26.2 | `go.mod` 声明，工程化分层（handler / service / model） |
| Web 框架 | Gin | v1.12.0 | 路由分组 + 中间件链（JWT / CORS / 超时 / 数据权限 / recovery） |
| ORM | GORM | v1.31.2 | MySQL 驱动，版本化自动迁移（`migrate_versions`） |
| 鉴权 | golang-jwt/jwt | v5.3.1 | HS256，`Authorization: Bearer <token>` |
| 前端框架 | React | ^19.2.8 | 函数组件 + Hooks，react-19-adapter 适配 Arco |
| 构建 | Vite | ^8.2.2 | 8181 端口，分包 + gzip/brotli 预压缩 |
| 组件库 | Arco Design | ^2.66.16 | 表格 / 表单 / 抽屉 / 时间线 / 流程画布 |
| 样式 | Tailwind CSS | ^4.1.4 | 原子化 CSS + Prettier 类名排序 |
| 数据库 | MySQL | ≥ 5.7 | 库 `oa_test`，表统一 `oa_` 前缀，utf8mb4 |

## 功能模块

```
系统管理（system）
├── 用户管理 / 角色管理 / 菜单管理 / 部门管理
└── 审核人员组（/system/examine）——可复用的审核人集合，审批人 / 抄送对象均可引用

流程配置（application，/application*）
├── 流程配置页（应用 CRUD，编码 app_<毫秒base32>_<随机base32>）
├── 表管理（业务表结构：字段 / 类型 / 长度）
├── 表单元素管理（元素库 + 数据源 / 事件联动 / 校验，可引用接口管理）
├── 布局管理（表单页 / 详情页双模式可视化拖拽）
└── 审批管理（发起人范围 + 流程画布：指定人员/角色/发起人自选/审核人员组，依次/会签/或签）

审批工作台（approval，/approval*）
├── 发起申请 / 我的待办 / 我的发起 / 经我处理 / 抄送我的 / 草稿箱
└── 审批详情（业务表单 + 流程时间线 + 状态印章）

接口管理（/interface）
├── SQL 直查 / HTTP 转发双模式定义，统一分发端点 /api/v1/interfaces/*path 对外暴露
├── 试调、一键导入后端路由（注释即名称）、被引用统计防误删
```

## 快速开始

### 环境依赖

| 依赖 | 版本要求 | 说明 |
| --- | --- | --- |
| Go | ≥ 1.26 | 后端编译运行 |
| MySQL | ≥ 5.7 | 库不存在时后端自动创建 |
| Node.js | `^20.19.0 \|\| >=22.12.0` | 前端 Vite 8 要求，推荐 22 LTS |
| task / air（可选） | 最新 | 后端任务封装与热重载 |

### 1. 准备数据库

编辑 `back-end/configs/config-dev.yaml` 的 `mysql` 段（默认连接本机 3306，库自动创建）：

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
task run-dev        # 推荐：air 热重载开发
# 或 go run ./cmd/server
```

首次启动自动完成建库、迁移与初始化数据（默认管理员 **admin / admin123**）。

### 3. 启动前端（8181）

```bash
cd front-end
npm install
npm run dev
```

浏览器访问 `http://localhost:8181/` 登录即可联调；开发环境 `/api`、`/uploads` 由 Vite 代理到后端 8180。

## 配置说明

| 项目 | 配置文件 | 说明 |
| --- | --- | --- |
| 后端 | `back-end/configs/config-{dev,test,prod}.yaml` | 环境变量 `APP_ENV` 切换（默认 dev）；服务端口、JWT 密钥/有效期、日志、CORS、连接池、迁移开关均在此配置 |
| 前端 | `front-end/vite.config.js` | 8181 端口、`/api` 代理目标、构建分包与预压缩 |
| 前端 | `front-end/src/config/app.js` | 系统名称、登录页文案、表单元素类型选项、字段宽度选项 |
| 仓库 | `.gitignore` | 忽略 `node_modules`、`dist`、`bin/`、`logs/`、`uploads/` 等 |

> 两个子项目均不使用 `.env` 文件；后端地址差异通过前端 `vite.config.js` 代理与后端 `APP_ENV` 分别管理。

## 构建与部署

### 后端

```bash
cd back-end
task package        # 发布版打包（-s -w + UPX 压缩，产物输出 bin/）
APP_ENV=prod ./bin/server
```

生产部署要点：修改 JWT secret、关闭自动迁移（`mysql.migrate.enable: false`）、确保 `uploads/` 可写、建议 systemd 守护。详见 [`back-end/README.md`](back-end/README.md)。

### 前端

```bash
cd front-end
npm run build       # 产物输出 dist/（含 .gz / .br 预压缩）
```

Nginx 托管 `dist/`：history 模式回退 `try_files ... /index.html`、`/api` 反代后端、SSE 路径关闭 `proxy_buffering`。详见 [`front-end/README.md`](front-end/README.md)。

## 核心机制

### 权限体系

- **菜单权限**：角色分配菜单 → 用户绑定角色 → 前端按菜单树生成动态路由与按钮级权限（`RequirePermission` / `AuthButton`）
- **数据权限**：角色配置数据范围，查询自动过滤：

| 数据范围 | 过滤条件 |
| --- | --- |
| 1 全部数据 | 不过滤 |
| 2 自定义部门 | `dept_id IN (指定部门集合)` |
| 3 仅本部门 | `dept_id IN (本部门)` |
| 4 本部门及下级 | `dept_id IN (本部门 + 子部门)` |
| 5 仅本人 | `created_by = 当前用户` |

系统约定部门列统一 `dept_id`、创建人列统一 `created_by`；部门维度与仅本人并存时取并集（OR）。

### 动态表单引擎

依据后端下发的 `form_layout_json` / `detail_layout_json` 动态渲染，四种页面模式：`form`（填报）/ `detail`（只读）/ `move-form` / `move-detail`（设计器）。

- **取值表达式**：

| 前缀 | 含义 | 用途 |
| --- | --- | --- |
| `form.xxx` | 整个表单当前值 | 数据源参数、联动目标值 |
| `item.xxx` | 当前选中项 | select/treeSelect 选中项取值 |
| 无前缀 | 接口响应根节点 | `target_mapping.source` |
| `${}` | 字符串插值 | url / label 拼接 |

- **核心配置**：`data_source`（静态 / 接口 / 引用接口管理）、`actions`（on_mount / on_change / on_blur → set_value / fetch_and_fill）、`dynamic_states`（visible_if / disabled_if）、`default_value`、`validation_rule`、`columns`（子表）
- **公共计算/转换接口** `POST /utils/calculate`：
  - `number_to_upper`：数字转大写金额（`100000` → `壹拾万元整`）
  - `calc`：表达式计算（`(100+2)*3 % 7` → `5`，支持 `+ - * / % ()`，小数/负数/空格自动处理）

### 审批流程

实例状态机（`oa_approval_instances.status`，对齐钉钉）：

```
草稿(6) ─提交→ 进行中(0) ─通过→ 已通过(1)
                      ├拒绝→ 已拒绝(2)
                      └退回→ 已退回(3) ─重新提交→ 进行中(0)
               撤回→ 草稿(6)
```

审批人操作：**同意**（推进下一节点）/ **退回**（发起人编辑后重走完整流程）/ **拒绝**（直接终结）。任务状态：`0` 待处理 / `1` 已通过 / `2` 已拒绝 / `3` 已退回 / `4` 已转交 / `5` 已取消。

### 接口管理（oa_api_definitions）

- **双模式**：`type=sql` SQL 模板直查（`${form.xxx}` 占位参数化，仅 SELECT，数据权限按模板内静态写死）；`type=http` 转发到内部相对路径
- **统一分发**：`GET/POST/PUT/DELETE /api/v1/interfaces/*path` 按 method+path（status=1）匹配执行；HTTP 转发结果原样透传
- **与表单元素联动**：数据源 / `fetch_and_fill` 可「引用接口」（`api_ref: 1`），运行时自动走统一分发；接口被引用时列表显示「被引用」并禁用删除
- **导入后端路由**：解析 `internal/router/*.go` 行内注释作为接口名称，一键批量生成转发定义
- **返回结构**：SQL 直查默认返回行数组；结果单列且列名为 `_data` 且可解析 JSON 时，自动解析为对象/数组

### 站内通知（SSE）

- 审批待办（1）/ 退回（2）/ 抄送（3）/ 结果（4）事件自动生成通知
- 后端事务提交成功后统一推送（`withNotify`），事务回滚不产生幽灵通知
- 前端 `EventSource` 实时接收 + 未读计数 + BroadcastChannel 多标签页同步；30 秒心跳保活，SSE 路径豁免请求超时

### 文件上传

- `POST /api/v1/upload?app_code=xxx` 单文件上传，按应用分目录存储
- 存储路径：`back-end/uploads/{app_code}/{时间戳}_{文件名}`，通过 `/uploads/*` 静态访问
- 业务字段存储 JSON 数组：`[{ uid, url, name, size }]`

## 关键设计决策

1. **布局只存增量**：布局 JSON 引用式存储（仅 `element_id` 与位置/宽度），其他属性从表单元素管理合并读取，改元素设置无需重拖布局
2. **数据权限闭环在角色管理**：数据范围（1-5）统一由角色配置，业务查询自动注入，接口管理 SQL 模板内静态写死过滤，避免误导
3. **退回对齐钉钉**：退回后发起人重新提交走完整流程，新旧任务不叠加
4. **接口定义统一分发**：外部只认 `method + path`，内部实现（SQL / HTTP 转发）可随时切换，表单元素引用接口不被内部实现耦合
5. **编码生成（idgen）**：`app_<40bit毫秒base32>_<40bit随机base32>`，字典序即时间序，可直接排序，生成后不可变

## 文档导航

| 文档 | 内容 |
| --- | --- |
| [`back-end/README.md`](back-end/README.md) | 后端完整文档：核心特性、目录结构、接口清单、配置说明、构建部署、核心机制（SSE / 上传 / 动态表单 / 数据权限 / 接口管理 / 审批状态机） |
| [`front-end/README.md`](front-end/README.md) | 前端完整文档：模块介绍、目录结构、npm scripts、代理说明、构建部署、核心机制（路由权限 / 动态表单引擎 / 接口管理 / 审核人员组 / 站内通知 / 审批工作台 / 流程配置） |
