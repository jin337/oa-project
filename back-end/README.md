# OA 管理系统 · 后端服务

基于 **Go 1.26 + Gin + GORM** 的 OA（办公自动化）平台后端，提供审批流程引擎、动态表单设计、版本管理、审批列表聚合、抄送通知、自定义接口分发等能力。

---

## 目录

- [项目简介](#项目简介)
- [核心技术栈](#核心技术栈)
- [目录结构](#目录结构)
- [环境依赖](#环境依赖)
- [快速开始](#快速开始)
- [配置文件说明](#配置文件说明)
- [常用命令（Taskfile）](#常用命令taskfile)
- [构建与部署](#构建与部署)
- [API 与约定](#api-与约定)

---

## 项目简介

本服务是 OA 全栈项目的后端层，主要业务模块：

- **认证与权限**：JWT 登录、菜单树、按钮/数据权限。
- **流程配置**：应用（Application）、版本（Version）、表单元素（Element）的全生命周期管理。
- **表单设计器后端**：表单页 / 详情页布局 JSON、动态字段、子表关联。
- **审批引擎**：实例（Instance）、任务（Task）、执行路径解析、节点流转、撤回/作废/重新提交。
- **审批列表聚合**：待办 / 我的发起 / 经我处理 / 抄送我的 / 草稿箱五合一分页接口。
- **抄送与通知**：抄送人选择、站内通知、SSE 实时推送。
- **自定义接口分发**：后台配置 SQL / HTTP 接口，前端按权限调用。

---

## 核心技术栈

| 分类 | 技术 | 说明 |
| --- | --- | --- |
| 语言 | Go 1.26+ | 使用泛型、`log/slog` 等新标准库能力 |
| Web 框架 | Gin | HTTP 路由、中间件、参数绑定 |
| ORM | GORM | 模型映射、自动迁移、连接池 |
| 配置 | YAML + `APP_ENV` | 多环境配置文件，按环境加载 |
| 鉴权 | JWT | `golang-jwt` 签发与校验 |
| 数据库 | MySQL 5.7+ | 表前缀 `oa_`，字符集 utf8mb4 |
| 任务 | Task / air | 任务封装与热重载 |
| 日志 | 控制台 + 文件 | 按环境分文件落盘 |

---

## 目录结构

```
back-end/
├── cmd/
│   └── server/              # 程序入口（main.go）
├── configs/
│   ├── config-dev.yaml      # 开发环境
│   ├── config-test.yaml     # 测试环境
│   └── config-prod.yaml     # 生产环境
├── internal/
│   ├── config/              # 配置加载与校验
│   ├── database/            # GORM 初始化、自动迁移
│   ├── handler/             # HTTP handler（控制器层）
│   ├── middleware/          # JWT、CORS、日志、recovered 等
│   ├── model/               # GORM 模型与请求/响应结构
│   ├── router/               # 路由注册（按模块拆分）
│   ├── service/             # 业务逻辑层
│   └── pkg/
│       ├── idgen/           # 单号生成器（OA 序列号）
│       ├── logger/          # 日志封装
│       ├── response/        # 统一响应结构
│       └── vtrans/          # 参数绑定错误翻译
├── logs/                    # 运行日志（运行时生成）
├── uploads/                 # 用户上传文件
├── bin/                     # 编译产物输出
├── Taskfile.yml             # 任务封装
├── .air.toml                # air 热重载配置
├── go.mod / go.sum
└── README.md
```

---

## 环境依赖

| 依赖 | 版本要求 | 说明 |
| --- | --- | --- |
| Go | ≥ 1.26 | 与 `go.mod` 对齐 |
| MySQL | 5.7+ | 建议 8.0；库不存在时会自动创建 |
| task | 可选 | 推荐安装（`winget install go-task.go-task`），也可直接用 `go run` |
| air | 可选 | 开发热重载，`go run ./cmd/server` 可替代 |
| upx | 可选 | 打包压缩，未安装时自动跳过 |

---

## 快速开始

### 1. 准备数据库

确保 MySQL 已启动，并在 `configs/config-dev.yaml` 中填写正确的连接信息：

```yaml
mysql:
  host: 127.0.0.1
  port: 3306
  username: root
  password: "your-password"
  dbname: oa_test
```

> 库不存在时服务启动会自动创建；表结构由 GORM 自动迁移（`migrate.enable: true`）完成。

### 2. 下载依赖

```bash
cd back-end
go mod tidy
```

### 3. 启动开发服务

方式一：直接运行

```bash
go run ./cmd/server
```

方式二：使用 Task（默认 dev 环境）

```bash
task run
```

方式三：热重载（需安装 air）

```bash
task run-dev
```

服务默认监听 **`http://127.0.0.1:8180`**，API 统一前缀为 **`/v1/api`**。

### 4. 切换环境

```bash
APP_ENV=test task run     # 测试环境
APP_ENV=prod task run     # 生产环境（谨慎）
```

---

## 配置文件说明

所有环境配置位于 `configs/`，通过环境变量 `APP_ENV`（默认 `dev`）选择加载 `config-{env}.yaml`。

### server

| 字段 | 说明 |
| --- | --- |
| `server.port` | HTTP 监听端口，默认 `8180` |
| `server.mode` | Gin 运行模式：`debug` / `release` / `test` |
| `server.api_prefix` | 路由统一前缀，默认 `/v1/api`（需与前端 `.env`、Nginx 对齐） |
| `server.request_timeout` | 全局请求超时（秒） |
| `server.jwt.secret` | JWT 签名密钥，**生产必须修改** |
| `server.jwt.expire` | Token 有效期（小时） |
| `server.log.level` | 日志级别：`debug` / `info` / `warn` / `error` |
| `server.log.path` | 日志文件路径，留空则只输出控制台 |
| `server.cors.*` | 跨域开关、放行来源、方法、请求头 |

### mysql

| 字段 | 说明 |
| --- | --- |
| `mysql.host` / `port` | 数据库地址 |
| `mysql.username` / `password` | 认证信息 |
| `mysql.dbname` | 库名，不存在自动创建 |
| `mysql.table_prefix` | 表前缀，默认 `oa_` |
| `mysql.charset` / `collation` | 字符集与排序规则 |
| `mysql.max_open_conns` / `max_idle_conns` | 连接池参数 |
| `mysql.migrate.enable` | 是否启动时自动迁移（生产建议关闭） |
| `mysql.migrate.mode` | `full` 全量建表+初始化；`incremental` 只增量加表/加字段 |

> 生产环境请通过环境变量或独立的 `config-prod.yaml` 覆盖敏感项，不要将生产密钥提交到仓库。

---

## 常用命令（Taskfile）

| 命令 | 作用 |
| --- | --- |
| `task` | 列出所有可用任务 |
| `task deps` | `go mod tidy` 整理依赖 |
| `task build` | 编译可执行文件到项目根 |
| `task run` | 启动服务（默认 dev） |
| `task run-dev` | air 热重载启动 |
| `task run-test` / `task run-prod` | 对应环境启动 |
| `task package` | 打包到 `bin/`，并尝试 UPX 压缩 |
| `task test` | 运行单元测试 |
| `task vet` | `go vet` 静态检查 |
| `task clean` | 清理编译产物、`bin/`、日志 |

---

## 构建与部署

### 本地编译

```bash
task build
# 产物：./oa_serve_main（Windows 为 oa_serve_main.exe）
```

### 生产打包

```bash
task package
# 产物：bin/oa_serve_main（带 -ldflags "-s -w"，默认注入 prod 环境）
```

### 部署建议

1. 编译产物 + `configs/config-prod.yaml` + `uploads/` + `logs/` 一起发布。
2. 通过 `APP_ENV=prod` 启动，或在二进制同级目录放置正确的配置文件。
3. 前置 Nginx：将 `/v1/api` 与 `/uploads` 反代到本服务（默认 8180），其余路径指向前端静态资源。
4. 生产环境建议关闭自动迁移（`mysql.migrate.enable: false`），先在测试库验证迁移再上线。
5. 使用 systemd / supervisor 等进程管理器守护进程，日志按日轮转。

---

## API 与约定

- 统一响应结构：

  ```json
  { "code": 0, "msg": "ok", "data": {}, "timestamp": 1700000000 }
  ```

- 鉴权：除登录、健康检查外，所有接口需在请求头携带 `Authorization: Bearer <token>`。
- 分页：列表接口统一接收 `page`、`size`，返回 `{ list, total }`。
- 错误：业务错误使用非 0 `code`，由中间件统一捕获并翻译。
