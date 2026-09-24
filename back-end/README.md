# back-end

> OA 系统后端服务 · Go + Gin + GORM + MySQL

## 目录

- [项目简介](#项目简介)
- [核心技术栈](#核心技术栈)
- [目录结构说明](#目录结构说明)
- [环境依赖要求](#环境依赖要求)
- [本地开发与运行步骤](#本地开发与运行步骤)
- [配置文件说明](#配置文件说明)
- [构建与部署指南](#构建与部署指南)
- [接口约定](#接口约定)
- [接口清单](#接口清单)
- [核心机制](#核心机制)

## 项目简介

本服务是 OA 管理系统的后端，为同级目录 `front-end`（React 19 + Vite）提供统一的 RESTful API。项目内置 **RBAC 权限体系**（用户-角色-菜单-部门-数据范围）、**低代码应用引擎**（动态表单 / 数据表 / 审批流配置）与 **审批工作流引擎**（草稿、提交、审批、转交、撤回的完整状态机），可在不写代码的前提下完成「建应用 → 配字段 → 配表单 → 配布局 → 配审批流 → 发起审批」的全链路闭环。

### 核心特性

- **RBAC 权限模型**：用户 ⇄ 角色 ⇄ 菜单（目录/页面/按钮）多对多授权，部门树 + 数据范围过滤（全部 / 自定义 / 本部门 / 本部门及下级）
- **JWT 登录鉴权**：登录签发 token，`Authorization: Bearer <token>` 访问受保护接口，支持本人改密与管理员重置密码
- **低代码应用引擎**：应用（表单/表格）→ 数据表字段 → 表单元素 → 布局 → 审批流，全链路配置化，业务数据动态读写
- **审批工作流**：条件分支 + 发起人自选/角色/成员/发起人多种审批人类型，依次/会签/或签审批方式，草稿箱、自动通过、转交、撤回、退回全流程状态机，核心流转全部事务化
- **动态表单引擎**：字段级数据源（静态/接口）、事件联动、动态显隐与禁用、校验规则、子表、文件上传，支持 form / detail / move-form / move-detail 四种布局模式
- **文件上传**：通用单文件上传接口（按 `app_code` 分目录存储），返回 `{url, name, size}`；上传文件通过 `/uploads/*` 静态服务直接映射磁盘目录
- **站内通知**：审批待办/退回/抄送/结果事件自动生成站内通知，支持未读计数、已读标记、全部已读，通过 SSE 实时推送到前端（无需轮询）
- **公共计算接口**：数字转大写金额与表达式计算，供表单事件联动调用
- **版本化自动迁移**：GORM AutoMigrate 只增改不删减，`migrate_versions` 记录版本，full / incremental 双模式
- **工程化基建**：统一响应体、中文参数校验、全局异常兜底、请求超时、跨域、连接池、环境化配置（dev / test / prod）

## 核心技术栈

| 分类 | 技术 | 版本 | 说明 |
| --- | --- | --- | --- |
| 语言 | Go | 1.26.2 | `go.mod` 声明 `go 1.26.2` |
| Web 框架 | Gin | v1.12.0 | 路由分组 + 中间件链 |
| ORM | GORM | v1.31.2 | 配合 `gorm.io/driver/mysql v1.6.0` |
| 鉴权 | golang-jwt/jwt | v5.3.1 | HS256 签名，密钥/有效期/签发者可配 |
| 参数校验 | go-playground/validator | v10.30.3 | 配合 `locales` + `universal-translator` 输出中文错误提示 |
| 加密 | golang.org/x/crypto | v0.55.0 | bcrypt 密码哈希 |
| 配置 | gopkg.in/yaml.v3 | v3.0.1 | 环境变量 `APP_ENV` 切换配置文件 |
| 开发工具 | air / task / UPX | — | 热重载 / 任务封装 / 打包压缩（均可选） |

## 目录结构说明

```
back-end/
├── cmd/server/main.go          # 入口：加载配置 → 初始化日志 → 连接数据库 → 自动迁移 → 组装路由 → 优雅停机
├── configs/
│   ├── config-dev.yaml         # 开发环境配置（默认）
│   ├── config-test.yaml        # 测试环境配置
│   └── config-prod.yaml        # 生产环境配置
├── internal/
│   ├── config/                 # config.go：配置加载（APP_ENV 切换 + 默认安全配置兜底）
│   ├── database/
│   │   ├── mysql.go            #   连接（自动建库 / 连接池 / 健康检测）
│   │   └── migrate.go          #   版本化自动迁移（migrate_versions 版本表）
│   ├── middleware/
│   │   ├── recovery.go         #   全局 panic 兜底
│   │   ├── cors.go             #   跨域
│   │   ├── timeout.go          #   请求统一超时（SSE 长连接白名单豁免）
│   │   ├── jwt.go              #   JWT 鉴权
│   │   └── datascope.go        #   数据权限过滤（按部门范围）
│   ├── model/
│   │   ├── model.go            #   全部实体 + 请求/响应结构 + 状态枚举
│   │   └── base.go             #   分页与公共字段
│   ├── router/router.go        # 路由注册（RESTful，统一 /api/v1 前缀）
│   ├── handler/                # 接口处理器（薄封装：参数校验 → 调 service → 统一响应）
│   │   ├── auth.go             #   登录 / 用户资料 / 菜单树
│   │   ├── user.go / role.go / menu.go / dept.go            # RBAC 管理
│   │   ├── application.go / form_element.go / table_field.go # 低代码应用配置
│   │   ├── approval.go         #   审批分类 / 申请项 / 审批列表
│   │   ├── approval_instance.go#   流程实例与任务（发起/草稿/提交/详情/撤回/删除/审批/转交/加签）
│   │   ├── upload.go           #   通用文件上传（按 app_code 分目录）
│   │   ├── notification.go     #   站内通知（列表/未读数/已读/SSE 推送）
│   │   ├── utils.go            #   公共计算/转换接口
│   │   ├── health.go           #   健康检查
│   │   └── helper.go           #   处理器公共辅助
│   ├── service/                # 业务逻辑层
│   │   ├── auth.go / user.go / role.go / menu.go / dept.go
│   │   ├── application.go / form_element.go / table_field.go
│   │   ├── approval.go         #   审批分类/申请项/列表聚合（待办/发起/已办/抄送/草稿）
│   │   ├── approval_flow.go    #   流程定义模型、快照解析、条件评估、执行路径、自选成员注入
│   │   ├── approval_member.go  #   审批人解析（自选/角色/成员/发起人类型）
│   │   ├── approval_instance.go#   实例生命周期：创建/草稿/提交/详情/撤回/删除（事务化状态流转）
│   │   ├── approval_task.go    #   任务引擎：任务生成/自动通过/节点推进/终结/审批/转交/加签
│   │   ├── notification.go     #   通知落库 + 事务内队列 + SSE Hub
│   │   └── helper.go           #   服务层公共辅助
│   └── pkg/                    # 基础组件：logger 日志 / response 统一响应 / vtrans 中文翻译
├── uploads/                    # 上传文件存储根目录（按 app_code 分子目录，运行时生成）
├── bin/                        # 编译产物目录（已 gitignore）
├── logs/                       # 运行日志目录（已 gitignore）
├── Taskfile.yml                # 常用任务封装（启动/编译/打包/测试/清理）
├── .air.toml                   # air 热重载配置（产物输出 bin/main.exe）
└── go.mod / go.sum
```

## 环境依赖要求

| 依赖 | 版本要求 | 说明 |
| --- | --- | --- |
| Go | ≥ 1.26 | `go.mod` 声明 `go 1.26.2` |
| MySQL | ≥ 5.7 | 库不存在时自动创建；字符集 `utf8mb4` |
| task（可选） | ≥ 3 | 使用 `task` 命令时需要；Windows 可 `winget install go-task.go-task` |
| air（可选） | 最新 | 开发热重载：`go install github.com/air-verse/air@latest` |
| UPX（可选） | 最新 | 发布版打包压缩时需要，未安装时自动跳过 |
| 磁盘目录 | — | `uploads/` 需存在且进程可写（上传文件存储根目录），否则文件上传接口会失败 |
| front-end（联调可选） | Node ≥ 20.19 | 前端开发服务固定 8181 端口，通过 Vite 代理调用本服务 8180 |

## 本地开发与运行步骤

### 1. 准备数据库

编辑 `configs/config-dev.yaml` 中 `mysql` 段（库不存在会自动创建）：

```yaml
mysql:
  host: 127.0.0.1
  port: 3306
  username: root
  password: "你的数据库密码"
  dbname: oa_test        # 库不存在会自动创建
  table_prefix: oa_      # 所有表统一加 oa_ 前缀
```

### 2. 安装依赖

```bash
go mod download          # 或 go mod tidy
```

### 3. 启动服务

```bash
# 方式一：直接运行（默认 dev 环境）
go run ./cmd/server

# 方式二：指定环境
APP_ENV=dev  go run ./cmd/server   # Linux / macOS
APP_ENV=test go run ./cmd/server
APP_ENV=prod go run ./cmd/server

# Windows PowerShell 指定环境
$env:APP_ENV="dev"; go run ./cmd/server
```

服务默认监听 **8180** 端口（`configs/config-dev.yaml` 中 `server.port` 可改）。

### 4. 验证

- 健康检查（无需鉴权）：`GET http://localhost:8180/`，返回服务状态、环境名、数据库连通性
- 默认管理员账号：**`admin` / `admin123`**（首次启动 `migrate.mode=full` 时自动初始化）

> 配置文件读取/解析失败时不崩服务，自动回退默认安全配置（端口 8080、迁移关闭）。

**前后端联调**：另开终端启动前端（详见同级目录 `front-end/README.md`）：

```bash
cd ../front-end
npm install
npm run dev          # 前端 8181，/api 与 /uploads 代理到本服务 8180
```

浏览器访问 `http://localhost:8181/` 登录后即可联调；前端不再需要单独配置后端地址。

### 5. 开发热重载（可选）

项目内置 `.air.toml`，安装 air 后：

```bash
air                 # 监听 go 文件变更，自动重新编译并重启（产物输出 bin/main.exe）
```

### 6. 常用任务（task 封装）

```bash
task --list         # 查看全部任务（等价于 task default）
task deps           # go mod tidy
task run            # 启动服务（默认 dev，APP_ENV=test task run 可切换）
task run-dev        # 开发环境启动（air 热重载）
task run-test       # 测试环境启动
task run-prod       # 生产环境启动（谨慎执行）
task build          # 编译到项目根目录 server(.exe)
task test           # go test ./... -v
task vet            # go vet ./...
task package        # 发布版打包（-s -w + UPX，产物输出 bin/）
task clean          # 清理编译产物、bin/ 与 logs/
```

## 配置文件说明

配置按环境拆分：`configs/config-{dev,test,prod}.yaml`，通过环境变量 `APP_ENV` 选择，默认 `dev`。**项目不使用 `.env` 文件**，全部配置集中在 YAML 中。文件只分两大块：`server`（服务）与 `mysql`（数据库 + 迁移）。

### 配置项一览

| 配置段 | 字段 | 说明 |
| --- | --- | --- |
| `server` | `port` | 服务端口，默认 8180 |
| `server` | `mode` | gin 模式：`debug` / `release` / `test` |
| `server` | `request_timeout` | 接口统一请求超时（秒），默认 10；SSE 长连接已豁免 |
| `server.jwt` | `secret` | JWT 签名密钥，**生产环境务必修改** |
| `server.jwt` | `expire` | token 有效期（小时） |
| `server.jwt` | `issuer` | token 签发者 |
| `server.log` | `level` | 日志级别：debug / info / warn / error |
| `server.log` | `path` | 日志文件路径，留空则只输出控制台 |
| `server.cors` | `enable` / `allow_origins` / `allow_methods` / `allow_headers` | 跨域开关与放行规则 |
| `mysql` | `host` / `port` / `username` / `password` / `dbname` | 数据库连接（库不存在自动创建） |
| `mysql` | `table_prefix` | 表前缀，默认 `oa_` |
| `mysql` | `charset` / `collation` / `parse_time` / `loc` | 字符集、排序规则与时间解析 |
| `mysql` | `max_open_conns` / `max_idle_conns` / `conn_max_lifetime` / `connect_timeout` | 连接池参数 |
| `mysql.migrate` | `enable` | 自动迁移总开关，**生产建议 false** |
| `mysql.migrate` | `mode` | `full`=全量建表 + 初始化数据；`incremental`=仅增量加表/加字段 |
| `mysql.migrate` | `log_enable` / `log_path` | 迁移日志开关与路径 |

### 自动迁移机制

- **版本管理**：`migrate_versions` 表记录已应用版本，可回溯升级历史
- **安全规则**：AutoMigrate 只增改表/字段，**不删表、不删字段**；单个版本失败自动回滚
- **新增迭代**：在 `internal/database/migrate.go` 的 `migrations` 清单按版本号追加即可

## 构建与部署指南

### 本地构建

```bash
go build -o server.exe ./cmd/server          # Windows
go build -o server ./cmd/server              # Linux / macOS
```

### 发布版打包（task）

```bash
task package
```

流程：`go mod tidy` → `go build -ldflags="-s -w" -o bin/server(.exe)` → UPX 压缩（本机实测 24.1MB → 5.8MB）。Windows 需提前安装 `upx`；Linux 分支未安装时自动跳过压缩。产物输出到 `bin/`（已 gitignore）。

### 跨平台交叉编译

```bash
GOOS=linux   GOARCH=amd64 go build -ldflags="-s -w" -o bin/server    ./cmd/server
GOOS=windows GOARCH=amd64 go build -ldflags="-s -w" -o bin/server.exe ./cmd/server
```

### 生产部署检查清单

1. 修改 `configs/config-prod.yaml`：JWT `secret` 改为强随机值、`mysql.password` 正确、`server.mode: release`
2. 关闭自动迁移：`mysql.migrate.enable: false`（结构变更走增量迁移或 DBA 审核）
3. 将 `bin/server` 与 `configs/` 部署到服务器，以 `APP_ENV=prod` 启动：

```bash
APP_ENV=prod ./bin/server
```

4. 确保 `uploads/` 目录存在且进程有写权限（上传文件存储根目录）
5. 建议通过 systemd 守护（Linux 示例）：

```ini
[Unit]
Description=OA Backend
After=network.target mysql.service

[Service]
WorkingDirectory=/opt/oa/back-end
Environment=APP_ENV=prod
ExecStart=/opt/oa/back-end/bin/server
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

6. 前端静态资源由 Nginx 托管，`/api` 反向代理到本服务（详见 `front-end/README.md`）

## 接口约定

- 统一前缀 `/api/v1`，标准 RESTful：GET 查询 / POST 新增 / PUT 修改 / DELETE 删除
- 统一返回体：`{ "code": 0, "msg": "success", "data": {...}, "timestamp": 1234567890 }`，`code=0` 成功，非 0 失败（`msg` 为中文错误提示）
- 鉴权接口请求头携带 `Authorization: Bearer <token>`
- 非法参数自动拦截并返回中文提示；系统 panic 被全局拦截，不泄露原生报错
- 分页接口统一参数：`page`（默认 1）、`size`（默认 10）

## 接口清单

### 认证

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | / | 健康检查：服务状态、环境名、数据库连通性（无需鉴权） |
| POST | /api/v1/auth/login | 登录，返回 token |
| GET | /api/v1/auth/profile | 当前用户 + 菜单树 + 权限标识 |
| GET | /api/v1/auth/menus | 当前用户菜单树 |

### 用户 / 角色 / 菜单 / 部门

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET/POST | /api/v1/users | 用户分页列表（数据范围过滤）/ 新增 |
| PUT | /api/v1/users/switch-dept | 切换当前部门（多部门用户） |
| GET/PUT/DELETE | /api/v1/users/:id | 用户详情 / 修改 / 删除 |
| PUT | /api/v1/users/:id/roles | 用户分配角色（多对多） |
| PUT | /api/v1/users/:id/password | 修改密码（仅限本人，需校验旧密码） |
| PUT | /api/v1/users/:id/reset-password | 重置密码（管理员操作） |
| GET/PUT | /api/v1/users/:id/profile | 获取 / 更新员工档案（1:1，upsert） |
| GET/POST | /api/v1/roles | 角色分页列表 / 新增 |
| GET | /api/v1/roles/users | 角色下的用户 |
| GET/PUT/DELETE | /api/v1/roles/:id | 角色详情 / 修改 / 删除 |
| PUT | /api/v1/roles/:id/menus | 角色分配菜单（多对多） |
| PUT | /api/v1/roles/:id/depts | 角色自定义数据范围绑定部门 |
| GET/POST | /api/v1/menus | 菜单树 / 新增（目录/页面/按钮） |
| GET/PUT/DELETE | /api/v1/menus/:id | 菜单详情 / 修改 / 删除 |
| GET/POST | /api/v1/depts | 部门树 / 新增 |
| GET | /api/v1/depts/users | 部门下的用户 |
| GET/PUT/DELETE | /api/v1/depts/:id | 部门详情 / 修改 / 删除 |

### 审批（/api/v1/approval）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | /approval/list | 审批列表聚合：`scope=todo` 待办 / `initiated` 我的发起 / `approved` 我审批的 / `cc` 抄送我的 / `drafts` 草稿箱 |
| GET/POST | /approval/category | 审批分类列表 / 新增 |
| PUT/DELETE | /approval/category/:id | 修改 / 删除审批分类 |
| GET/POST | /approval/category/item | 申请项列表 / 新增 |
| PUT/DELETE | /approval/category/item/:id | 修改 / 删除申请项 |
| POST | /approval/instance | 发起审批（可携带自选审批人 `approval_draft_members`） |
| POST | /approval/instance/draft | 保存草稿（不启动流程、不生成任务） |
| GET | /approval/instance/:id | 实例详情（快照 + 业务数据 + 任务列表 + 审批人映射；同时返回 `detail_layout_json` 只读详情布局与 `form_layout_json` 可编辑表单布局，供草稿/退回编辑使用） |
| PUT | /approval/instance/:id/submit | 从草稿提交发起审批 |
| PUT | /approval/instance/:id/withdraw | 撤回（仅发起人、仅进行中） |
| PUT | /approval/instance/:id/resubmit | 退回后重新提交（发起人修改表单数据后重走流程） |
| DELETE | /approval/instance/:id | 删除（仅已拒绝/已退回/已作废/已撤回/草稿） |
| PUT | /approval/instance/:id/task/:taskId/approve | 审批操作：`action` 1=通过 2=拒绝 3=退回 |
| PUT | /approval/instance/:id/task/:taskId/delegate | 转交（`to_user_id` 指定目标用户） |
| PUT | /approval/instance/:id/task/:taskId/add-sign | 加签（前加签 / 后加签） |

### 文件上传（/api/v1/upload）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | /upload | 单文件上传，form-data `file`，query `app_code` 指定应用编码；返回 `{url, name, size}` |
| GET | /uploads/* | 上传文件静态访问（无需鉴权，直接映射磁盘 uploads 目录） |

### 站内通知（/api/v1/notifications）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | /notifications | 通知列表（分页，按时间倒序，仅返回未读） |
| GET | /notifications/unread-count | 当前用户未读通知数 |
| PUT | /notifications/read-all | 全部标记为已读 |
| PUT | /notifications/:id/read | 单条标记为已读 |
| GET | /notifications/stream?token=xxx | SSE 实时推送通知流（服务器发送事件） |

### 工具接口（/api/v1/utils）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | /utils/calculate | 公共计算 / 转换接口 |
| | | - `type: "number_to_upper"`：数字转大写金额（如 100000 → "壹拾万元整"） |
| | | - `type: "calc"`：表达式计算（支持 `+`、`-`、`*`、`/`、`%`、括号，如 `"(100+2)*3 % 7"` → 5） |

### 低代码应用（/api/v1/application）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET/POST | /application | 应用分页列表 / 新增 |
| GET | /application/by-code/:code | 按应用编码获取（动态页面路由用） |
| GET/PUT/DELETE | /application/:id | 应用详情 / 修改 / 删除 |
| GET/POST | /application/:id/fields | 数据表字段列表 / 新增 |
| PUT/DELETE | /application/:id/fields/:fieldId | 修改 / 删除数据表字段 |
| GET/POST | /application/:id/element | 表单元素列表 / 新增 |
| PUT/DELETE | /application/:id/element/:elementId | 修改 / 删除表单元素 |
| POST | /application/:id/data | 动态业务数据新增（自动建数据行） |
| GET/PUT/DELETE | /application/:id/data/:dataId | 业务数据详情 / 修改 / 删除 |

## 核心机制

### 实时通知（SSE）

- **连接建立**：`GET /notifications/stream?token=xxx`，鉴权通过后先下发一帧 `event: connected`，携带初始未读数
- **事件类型**：`notification`（新通知）/ `ping`（30 秒心跳保活）
- **通知类型**：`1` 待办 / `2` 退回 / `3` 抄送 / `4` 结果（通过/拒绝）
- **写入与推送时序**：通知在业务事务内入队（`notifyCreate`）→ 事务提交成功后统一 flush 推送（`withNotify`）；事务回滚则整队丢弃，不产生幽灵通知
- **连接管理**：每个用户维护独立的 SSE 连接，客户端断开自动重连（前端 EventSource 原生能力）
- **超时豁免**：SSE 属长连接，已加入 `middleware/timeout.go` 的 `ssePaths` 白名单，不受 `server.request_timeout` 约束
- **多标签页同步**：前端通过 BroadcastChannel 实现多标签页通知同步

### 文件上传

- **文件存储**：按 `app_code` 分目录存储，路径格式 `/uploads/{app_code}/{yyyyMMddHHmmss}_{filename}`
- **数据格式**：业务字段存储 JSON 数组，每个元素包含 `{uid, url, name, size}`
- **支持格式**：通用文件上传，支持图片、文档、压缩包等
- **静态访问**：上传文件通过 `/uploads/*` 直接访问，无需鉴权

### 动态表单引擎

- **动态表单**：支持文本、数字、日期、下拉、单选、多选、上传、子表等多种组件
- **事件联动**：支持 `on_mount`、`on_change`、`on_blur` 事件，实现字段间联动
- **数据校验**：支持必填、正则、表达式等多种校验规则
- **布局配置**：支持表单页（form）、详情页（detail）、设计器表单页（move-form）、设计器详情页（move-detail）四种模式

### 数据权限（DataScope）

角色数据范围：`1`=全部数据、`2`=自定义部门、`3`=仅本部门、`4`=本部门及下级。用户列表等按部门维度的查询自动追加 `WHERE dept_id IN (...)` 过滤（`middleware/datascope.go`）。

### 审批流状态机

**实例状态**（`oa_approval_instances.status`）：

| 值 | 名称 | 说明 |
| --- | --- | --- |
| 0 | 进行中 | 流程流转中 |
| 1 | 已通过 | 终态 |
| 2 | 已拒绝 | 终态，不可再编辑 |
| 3 | 已退回 | 非终态，发起人可编辑后重新提交（代码常量 `InstanceStatusReturned`） |
| 4 | 已作废 | 枚举保留，当前流程未产生 |
| 5 | 已撤回 | 枚举保留，撤回实际回到「草稿」 |
| 6 | 草稿 | 未提交，可编辑 / 提交 / 删除 |

```
 草稿(6) ──提交──▶ 进行中(0) ──通过──▶ 已通过(1)
                      │  │
                      │  ├──拒绝──▶ 已拒绝(2)
                      │  │
                      │  └──退回──▶ 已退回(3) ──重新提交──▶ 进行中(0)
                      │
                      └──撤回──▶ 草稿(6)
```

**任务状态**（`oa_approval_instance_tasks.status`）：`0` 待处理 / `1` 已通过 / `2` 已拒绝 / `3` 已退回 / `4` 已转交 / `5` 已取消

**操作语义**：

- **通过**：当前节点完成，推进到下一节点；全部节点完成则实例变为「已通过」
- **拒绝**：实例直接终结为「已拒绝」，不可再编辑
- **退回**：退回给发起人，实例变为「已退回」；发起人编辑后「重新提交」，重走完整审批流程（与钉钉对齐，新旧任务不叠加）
- **撤回**：仅发起人、仅进行中可操作，实例回退到「草稿」，可继续编辑或重新提交

**约束与保证**：

- **提交草稿时校验**：「发起人自选」审批节点必须已选人（未选返回明确提示）；「空审批人 + `emptyHandler=1`」仅用于角色无人等合法场景的自动跳过
- **事务保证**：发起/提交/审批/撤回等涉及实例状态 + 任务表 + 快照的多表更新全部在单个数据库事务内执行；提交草稿带原子守卫（`WHERE status=Draft`），防并发重复提交
- **抄送节点**：不生成审批任务，直接推进；依次审批按序生成下一人任务（转交衍生任务不计入索引）

> 注意区分两套状态枚举：实例/任务状态（上表，`oa_approval_instances.status`）与列表聚合用的「审核状态」（`0` 草稿 / `1` 待审核 / `2` 审核中 / `3` 已通过 / `4` 不通过 / `5` 已退回 / `6` 已作废 / `7` 已删除），后者仅用于列表展示与筛选。
