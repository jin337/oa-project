# OA 管理系统 · 后端服务

基于 **Go + Gin + GORM** 的 OA（办公自动化）平台服务端，覆盖审批流程引擎、动态表单设计、版本管理、审批列表聚合、站内通知与自定义接口分发等能力。

---

## 目录

- [项目简介](#项目简介)
- [核心技术栈](#核心技术栈)
- [目录结构](#目录结构)
- [环境依赖](#环境依赖)
- [本地开发与运行](#本地开发与运行)
- [配置文件说明](#配置文件说明)
- [运行时后台任务](#运行时后台任务)
- [构建与部署](#构建与部署)
- [API 约定](#api-约定)
- [常见问题](#常见问题)

---

## 项目简介

本服务为 OA 全栈项目的后端，统一前缀 `/v1/api`，默认监听 `8180`。主要业务模块：

| 模块 | 能力 |
| --- | --- |
| 认证与权限 | JWT 登录与吊销、动态菜单树、按钮权限、数据权限（部门范围） |
| 流程配置 | 应用（Application）、版本（Version）、表单元素（Element）全生命周期；版本发布、定时生效、软删除 |
| 表单设计器后端 | 表单页 / 详情页布局 JSON、动态字段、子表关联、字段级脱敏 |
| 审批引擎 | 实例与任务、执行路径解析、依次 / 会签 / 或签 / 加签 / 转交 / 退回 / 撤回 / 作废 |
| 审批列表 | 待办、我的发起、经我处理、抄送我的、草稿箱五类列表与详情聚合 |
| 通知中心 | 站内通知、未读数、已读同步、SSE 实时推送 |
| 接口管理 | 后台配置 SQL / HTTP 接口，运行时按权限统一分发 |
| 操作审计 | 非 GET 写操作留痕，按保留天数自动清理 |
| 文件与导出 | 附件上传与静态访问、列表与单据 Excel 导出 |

服务启动后会拉起若干常驻协程（版本定时激活、待办超时扫描、审计日志清理），并支持优雅停机。

---

## 核心技术栈

| 分类 | 技术 | 版本 | 说明 |
| --- | --- | --- | --- |
| 语言 | Go | 1.26.2 | 见 `go.mod` |
| Web 框架 | Gin | v1.12.0 | 路由、中间件、参数绑定 |
| ORM | GORM | v1.31.2 | 模型映射、自动迁移、连接池 |
| 数据库驱动 | gorm.io/driver/mysql | v1.6.0 | MySQL |
| 鉴权 | golang-jwt/jwt | v5.3.1 | Token 签发与校验 |
| 密码学 | golang.org/x/crypto | v0.58.0 | 密码哈希等 |
| 参数校验 | validator/v10 | v10.30.3 | 结构体校验与错误翻译 |
| 配置 | gopkg.in/yaml.v3 | v3.0.1 | `configs/config-*.yaml` |
| Excel 导出 | excelize/v2 | v2.11.1 | 列表与单据导出 |
| 数据库 | MySQL | 5.7+（建议 8.0） | utf8mb4，表前缀 `oa_` |
| 任务与热重载 | Task、air | 可选 | `Taskfile.yml`、`.air.toml` |

---

## 目录结构

```text
back-end/
├── cmd/
│   └── server/
│       └── main.go              # 程序入口：加载配置、初始化、启动、后台任务、优雅停机
├── configs/
│   ├── config-dev.yaml          # 开发环境（默认）
│   ├── config-test.yaml         # 测试环境
│   └── config-prod.yaml         # 生产环境
├── internal/
│   ├── config/                  # 配置结构体、加载与默认值（config.go）
│   ├── database/                # 连接与建库（mysql.go）、迁移（migrate.go）
│   ├── handler/                 # HTTP 控制器：健康检查、认证与各业务模块
│   ├── middleware/              # 中间件：Recovery / Cors / Timeout / RateLimit /
│   │                            # SecurityHeaders / JWTAuth / Permission / DataScope /
│   │                            # OperationLog / ExportBridge / 路由快照
│   ├── model/                   # GORM 模型与请求/响应结构
│   ├── pkg/
│   │   ├── idgen/               # 单号生成（CS-yyyymmdd-NNN）
│   │   ├── logger/              # 日志封装（级别、文件落盘）
│   │   ├── response/            # 统一响应与分页结构
│   │   └── vtrans/              # 参数校验错误中文翻译
│   ├── router/                  # 路由装配 + 按业务模块拆分的路由注册文件
│   ├── service/                 # 业务逻辑：流程、审批、通知、导出等
│   └── test/                    # 单元 / 集成测试（*_test.go）
├── logs/                        # 运行日志（运行时生成，默认 app-dev.log / gin.log / migrate-dev.log）
├── uploads/                     # 上传附件目录（通过 /uploads 静态访问）
├── bin/                         # 发布打包产物
├── Taskfile.yml                 # 常用任务封装
├── .air.toml                    # air 热重载配置
├── go.mod / go.sum
└── README.md
```

**分层约定**：`router` 只做路由装配与分组，`handler` 负责参数绑定与响应，业务规则集中在 `service`，数据访问通过 `model` + GORM。新增模块时按「model → service → handler → router 注册」四步补齐。

---

## 环境依赖

| 依赖 | 版本要求 | 是否必需 | 说明 |
| --- | --- | --- | --- |
| Go | ≥ 1.26.2 | 必需 | 与 `go.mod` 对齐 |
| MySQL | 5.7+（建议 8.0） | 必需 | 库不存在时启动会自动创建；表由迁移生成 |
| Task | 任意 | 可选 | 推荐，`winget install go-task.go-task` 或 `choco install go-task` |
| air | 任意 | 可选 | 开发热重载，`go run ./cmd/server` 可替代 |
| upx | 任意 | 可选 | 发布包压缩，未安装时自动跳过 |
| Git | 任意 | 可选 | 拉取代码 |

端口占用：默认 `8180`（后端）与 `8181`（前端 dev server）。如被占用，修改 `configs/config-dev.yaml` 的 `server.port`，并同步前端代理目标。

---

## 本地开发与运行

### 1. 准备数据库

确保 MySQL 已启动，在 `configs/config-dev.yaml` 中填写连接信息：

```yaml
mysql:
  host: 127.0.0.1
  port: 3306
  username: root
  password: "your-password"
  dbname: oa_test
  charset: utf8mb4
  migrate:
    enable: true      # 启动自动迁移
    mode: full        # full=全量建表+初始化；incremental=只增量加表/加字段
```

> 库不存在时服务自动创建；表结构与初始数据由 GORM 迁移完成。迁移失败只记录错误、不阻断启动，需查看 `logs/migrate-dev.log`。

### 2. 下载依赖

```bash
cd back-end
go mod tidy
# 或
task deps
```

### 3. 启动服务

| 方式 | 命令 | 适用场景 |
| --- | --- | --- |
| 直接运行 | `go run ./cmd/server` | 最简，改代码需手动重启 |
| Task | `task run` | 默认 `APP_ENV=dev` |
| air 热重载 | `task run-dev` | 开发调试，保存即重启 |
| 指定环境 | `APP_ENV=test task run` | 测试环境 |
| 编译后运行 | `go build -o bin/main.exe ./cmd/server` 后执行 | 接近生产 |

启动成功日志示例：

```text
环境=dev 配置加载完成
数据库 oa_test 连接成功
服务启动于 :8180
```

### 4. 验证服务

```bash
# 健康检查（无需鉴权，同时检查数据库连通）
curl http://127.0.0.1:8180/

# 业务接口（需先登录拿 token）
curl -H "Authorization: Bearer <token>" http://127.0.0.1:8180/v1/api/menus
```

健康检查返回统一结构，`data` 中包含 `service`、`env`、`db_status`、`time`：

```json
{
  "code": 0,
  "msg": "success",
  "data": { "service": "back-end", "env": "dev", "db_status": "ok", "time": "2026-11-12 09:30:00" },
  "timestamp": 1762900000
}
```

HTTP 200 且 `code=0` 表示服务进程在线；数据库是否正常要看 `data.db_status` 是否为 `ok`（异常值：`未初始化` / `不可用` / `连接失败`）。

### 5. 日志位置

| 文件 | 内容 |
| --- | --- |
| `logs/app-{env}.log` | 业务日志（级别由 `server.log.level` 控制） |
| `logs/gin.log` | Gin 访问日志与错误输出 |
| `logs/migrate-{env}.log` | 迁移日志（`mysql.migrate.log_enable` 开启时） |

### 6. 测试与静态检查

```bash
task test        # go test ./... -v
task vet         # go vet ./...
go test ./internal/test -run TestApprovalWithdraw -v   # 单个用例
```

测试集中在 `internal/test`，覆盖接口定义校验、审批流转（退回 / 审批模式 / 撤回）、部门与权限、安全与限流、Token 撤销、导出等；改动对应逻辑后建议 `task test && task vet` 同时通过。

---

## 配置文件说明

### 加载规则

- 通过环境变量 `APP_ENV` 选择环境，取值 `dev` / `test` / `prod`，默认 `dev`。
- 对应读取 `configs/config-{env}.yaml`；编译打包时可用 `-X 'back-end/internal/config.DefaultEnv=prod'` 改写默认环境。
- 配置结构体定义在 `internal/config/config.go`，未填写项使用内置默认值。

### server

| 字段 | 说明 |
| --- | --- |
| `server.port` | HTTP 监听端口，默认 `8180` |
| `server.mode` | Gin 模式：`debug` / `release` / `test` |
| `server.api_prefix` | API 统一前缀，默认 `/v1/api`，需与前端 `.env`、Nginx 对齐 |
| `server.request_timeout` | 请求超时（秒），由 Timeout 中间件执行 |
| `server.jwt.secret` | JWT 签名密钥，**生产必须更换**，长度建议 ≥ 32 字节随机值 |
| `server.jwt.expire` | Token 有效期（小时），默认 24 |
| `server.jwt.issuer` | Token 签发者标识 |
| `server.log.level` | 日志级别：`debug` / `info` / `warn` / `error` |
| `server.log.path` | 业务日志文件路径，留空仅输出控制台 |
| `server.cors.enable` | 跨域开关；同域反代部署可关闭 |
| `server.cors.allow_origins` | 放行来源，`*` 表示全部；生产建议写具体域名 |
| `server.cors.allow_methods` | 允许的方法 |
| `server.cors.allow_headers` | 允许的请求头（含 `Authorization`） |
| `server.operation_log.retain_days` | 审计日志保留天数，`0` 表示永久保留且不启动清理 |
| `server.operation_log.cleanup_interval_hours` | 审计清理任务间隔（小时） |
| `server.security.rate_limit_enable` | 全局限流开关（进程内令牌桶，多实例需改用共享存储） |
| `server.security.rate_limit_cost_per_sec` | 每 IP 每秒全局预算 |
| `server.security.rate_limit_burst` | 全局突发预算 |
| `server.security.sensitive_cost_per_sec` | 凭据接口（登录 / 重置密码）每秒预算 |
| `server.security.sensitive_burst` | 凭据接口突发预算 |
| `server.security.login_max_fails` | 窗口内登录失败次数上限，达到即锁定 |
| `server.security.login_fail_ttl` | 失败计数窗口（分钟） |
| `server.security.login_lock_ttl` | 锁定时长（分钟） |
| `server.security.trusted_proxies` | 可信代理网段（CIDR）。**反代部署必填**，留空会信任所有代理，客户端可伪造 `X-Forwarded-For` 绕过 IP 限流 |

### mysql

| 字段 | 说明 |
| --- | --- |
| `mysql.host` / `port` | 数据库地址 |
| `mysql.username` / `password` | 认证信息（生产不要提交明文密码到仓库） |
| `mysql.dbname` | 库名，不存在时自动创建 |
| `mysql.table_prefix` | 表前缀，默认 `oa_` |
| `mysql.charset` / `collation` | 字符集与排序规则，默认 `utf8mb4` / `utf8mb4_general_ci` |
| `mysql.parse_time` | 是否将时间列解析为 `time.Time` |
| `mysql.loc` | 时区，默认 `Local`；跨时区部署建议固定为 `Asia/Shanghai` |
| `mysql.max_open_conns` | 连接池最大连接数 |
| `mysql.max_idle_conns` | 连接池最大空闲连接数 |
| `mysql.conn_max_lifetime` | 连接最大存活时间（分钟） |
| `mysql.connect_timeout` | 建立连接超时（秒） |

### mysql.migrate

| 字段 | 说明 |
| --- | --- |
| `enable` | 启动是否执行自动迁移 |
| `mode` | `full`：全新环境全量建表 + 初始化；`incremental`：只增量加表 / 加字段 |
| `log_enable` | 是否记录迁移日志 |
| `log_path` | 迁移日志路径 |

> 生产建议：`enable: false`，先把 `full`/`incremental` 迁移在测试库验证通过，再按发布流程执行；`jwt.secret`、数据库密码、`trusted_proxies` 通过独立 `config-prod.yaml` 或部署系统注入。

---

## 运行时后台任务

以下协程随服务启动，均在 `cmd/server/main.go` 中注册：

| 任务 | 周期 | 行为 |
| --- | --- | --- |
| 审计日志清理 | `cleanup_interval_hours`（默认 24h） | 物理删除超过 `retain_days` 的操作日志；`retain_days=0` 时不注册 |
| 流程版本定时激活 | 每分钟 | 扫描到达生效时间的版本并自动激活，保证定时发布不依赖人工操作 |
| 待办超时扫描 | 每分钟 | 按实例提交时冻结的时限快照判定：超时提醒（每任务最多 3 次、间隔 24h）与到期前预警（仅一次），只发通知、不改变审批流转 |
| 优雅停机 | 收到 `SIGINT` / `SIGTERM` | 停止接收新请求，最多等待 5 秒完成在途请求 |

> 扫描周期必须不大于最小预警提前量（1 分钟），否则短时限任务可能直接越过预警窗口。

---

## 构建与部署

### 本地构建

```bash
task build
# 产物：./oa_serve_main（Windows 为 oa_serve_main.exe）
```

等价命令：

```bash
go build -o oa_serve_main ./cmd/server
```

### 发布打包

```bash
task package
# 产物：bin/oa_serve_main（-ldflags "-s -w"，默认注入 prod 环境，尽量 UPX 压缩）
```

打包命令同时注入默认环境：

```bash
go build -ldflags="-s -w -X 'back-end/internal/config.DefaultEnv=prod'" -o bin/oa_serve_main ./cmd/server
```

### 部署清单

发布目录最少包含：

```text
deploy/
├── oa_serve_main            # 或 bin/oa_serve_main
├── configs/
│   └── config-prod.yaml
├── uploads/                 # 附件目录（需可写，建议挂载独立磁盘）
└── logs/                    # 日志目录（需可写）
```

启动方式：

```bash
APP_ENV=prod ./oa_serve_main
```

### Nginx 反向代理

前端静态资源与后端同域部署时，只反代 API、上传与 SSE：

```nginx
server {
    listen 80;
    server_name oa.example.com;

    # 前端（此处按根路径示例；若前端使用 .env.production 默认的 /oa 子路径，
    # 改为 root /var/www 并配置 location /oa/ { root /var/www; try_files $uri $uri/ /oa/index.html; }，
    # 详见 front-end/README.md）
    root /var/www/oa-web;
    location / {
        try_files $uri $uri/ /index.html;
    }

    # 业务 API
    location /v1/api/ {
        proxy_pass http://127.0.0.1:8180;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # 通知 SSE：必须关闭缓冲，否则断线事件不会下发到浏览器
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

> SSE 经代理时若保持默认缓冲，浏览器无法及时感知后端断连，页面会表现为「连接仍在但不再推送」。`proxy_buffering off` 与 `X-Accel-Buffering: no` 两者都要配置。

### systemd 示例

```ini
[Unit]
Description=OA Backend
After=network.target mysql.service

[Service]
Type=simple
WorkingDirectory=/opt/oa
Environment=APP_ENV=prod
ExecStart=/opt/oa/oa_serve_main
Restart=always
RestartSec=5
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now oa-backend
sudo systemctl status oa-backend
```

### 数据库迁移策略

| 环境 | 建议 |
| --- | --- |
| 开发 | `migrate.enable: true` + `mode: full`，随启动自动建表 |
| 测试 | `enable: true` + `incremental`，验证增量脚本 |
| 生产 | `enable: false`，迁移脚本先在测试库跑通，再随发布窗口执行；执行前备份 |

---

## API 约定

### 统一响应

```json
{
  "code": 0,
  "msg": "success",
  "data": {},
  "timestamp": 1700000000
}
```

| code | 含义 | 前端处理 |
| --- | --- | --- |
| `0` | 成功 | 正常返回 `data` |
| `1` | 业务结果型失败（如接口试调失败） | 不弹全局提示，由调用方展示 |
| `400` | 参数校验失败 | 提示 `msg` |
| `401` | 未登录或 Token 失效 | 清理本地 Token 并跳登录页 |
| `403` | 无权限 | 提示 `msg` |
| `404` | 资源不存在 | 提示 `msg` |
| `500` | 服务端异常 | 提示 `msg`，查 `logs/` |

失败响应可能使用 HTTP 200 + 业务码，也可能使用对应 HTTP 状态码（如 401/403/404），前端两处都要处理。

### 分页

列表接口统一返回：

```json
{ "list": [], "total": 0, "page": 1, "size": 20 }
```

请求参数统一使用 `page`、`size`（部分列表支持筛选字段透传）。

### 鉴权

- 除健康检查 `GET /`、登录接口外，业务接口需携带 `Authorization: Bearer <token>`。
- SSE 端点无法自定义请求头，使用查询参数：`GET {api_prefix}/notifications/stream?token=<token>`；服务端对该路径豁免超时与部分安全中间件。

### 其他端点

| 端点 | 说明 |
| --- | --- |
| `GET /` | 健康检查（服务 + 数据库） |
| `/uploads/*` | 上传附件静态访问 |
| `/v1/api/*` | 业务接口，按模块分组 |

---

## 常见问题

| 现象 | 排查方向 |
| --- | --- |
| 启动报端口占用 | 修改 `server.port`，或结束占用 `8180` 的进程；同步前端代理目标 |
| 数据库连接失败 | 核对 `mysql.*` 与 MySQL 是否运行；账号需具备建库/建表权限（首次 `full` 迁移） |
| 启动成功但表不存在 | 查看 `logs/migrate-*.log`；确认 `migrate.enable` 与 `mode` |
| 迁移失败但服务仍在跑 | 设计如此（迁移失败只记录错误），需按日志修复后重启 |
| 登录后接口 401 | Token 过期或密钥变更；前端会清理 Token 跳登录 |
| 反代后限流异常 / IP 全是代理 IP | 配置 `server.security.trusted_proxies` 为 Nginx 网段 |
| 通知不实时 / 断线后不恢复 | 检查 Nginx 是否对 SSE 关闭缓冲、`proxy_read_timeout` 是否过短 |
| 跨域失败 | `cors.enable` 与 `allow_origins`；同域反代时可直接关闭 CORS |
| 时间相差 8 小时 | 检查 `mysql.loc` 与数据库/服务器时区是否一致 |

---

## 相关文档

- 项目总览：[`../README.md`](../README.md)
- 前端说明：[`../front-end/README.md`](../front-end/README.md)
