# back-end

Go + Gin + MySQL 纯后端接口服务脚手架，内置 RBAC 权限模型（用户-角色-菜单-部门-数据范围）。

## 技术栈

- Go 1.26 / Gin / GORM / MySQL 5.7+
- JWT 登录鉴权、validator 中文参数校验、bcrypt 密码加密

## 目录结构

```
back-end/
├── cmd/server/main.go        # 入口：配置→日志→数据库→迁移→路由→优雅停机
├── configs/
│   ├── config-dev.yaml       # 开发环境
│   ├── config-test.yaml      # 测试环境
│   └── config-prod.yaml      # 生产环境
├── bin/                      # task package 打包产物目录（不入库）
├── Taskfile.yml              # 常用任务封装（启动/编译/打包/清理）
└── internal/
    ├── config/               # 配置加载（APP_ENV 切换 + 默认安全兜底）
    ├── database/             # 数据库连接（自动建库/连接池/健康检测）+ 版本化自动迁移
    ├── middleware/           # 全局异常、跨域、超时、JWT、数据权限过滤
    ├── model/                # RBAC 五实体模型与请求结构
    ├── service/              # 业务逻辑
    ├── handler/              # 接口处理器
    └── pkg/                  # logger / response / vtrans 基础组件
```

## 环境切换

通过环境变量 `APP_ENV` 指定配置文件，无需改代码：

```bash
# Linux / macOS
APP_ENV=dev  go run ./cmd/server    # 默认
APP_ENV=test go run ./cmd/server
APP_ENV=prod go run ./cmd/server

# Windows PowerShell
$env:APP_ENV="dev"; go run ./cmd/server
```

配置文件读取/解析失败时不崩服务，自动回退默认安全配置。

也可以使用 `Taskfile.yml` 封装的常用任务（需安装 [task](https://taskfile.dev)）：

```bash
task run-dev     # 启动开发环境
task run-test    # 启动测试环境
task build       # 编译
task package     # 打包发布版（-s -w + UPX 压缩，产物输出到 bin/）
task clean       # 清理编译产物、bin 目录与日志
task --list      # 查看全部任务
```

## 启动步骤

1. 修改 `configs/config-dev.yaml` 中数据库账号密码（库不存在会自动创建）
2. 启动：`go run ./cmd/server`
3. 首次启动（mode=full）自动建表并初始化数据：
   - 管理员账号 `admin` / 密码 `admin123`
   - 超级管理员/普通员工角色、系统管理菜单树、总公司-研发部/市场部部门树

## 自动迁移说明

| 配置项 | 说明 |
| --- | --- |
| `mysql.migrate.enable` | 迁移总开关，生产建议 false |
| `mysql.migrate.mode` | `full`=全量建表+初始化数据；`incremental`=只增量加表/加字段 |
| `mysql.migrate.log_enable` / `log_path` | 迁移日志开关与自定义路径 |

- 版本管理：`migrate_versions` 表记录已应用版本，可回溯升级历史
- 安全规则：GORM AutoMigrate 只增改、不删表删字段；单版本失败事务回滚
- 新增迭代：在 `internal/database/migrate.go` 的 `migrations` 清单按版本号追加

## 接口约定

- 统一前缀 `/api/v1`，标准 RESTful：GET 查 / POST 增 / PUT 改 / DELETE 删
- 统一返回：`{code, msg, data, timestamp}`，code=0 成功，非 0 失败
- 鉴权接口请求头携带 `Authorization: Bearer <token>`
- 非法参数自动拦截并返回中文提示；系统 panic 被全局拦截，不泄露原生报错

## 接口清单

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | / | 健康检查：服务状态、环境名、数据库连通性（无需鉴权） |
| POST | /api/v1/auth/login | 登录，返回 token |
| GET | /api/v1/auth/profile | 当前用户+菜单树+权限标识 |
| GET | /api/v1/auth/menus | 当前用户菜单树 |
| GET/POST | /api/v1/users | 用户分页列表（数据范围过滤）/ 新增 |
| GET/PUT/DELETE | /api/v1/users/:id | 用户详情/修改/删除 |
| PUT | /api/v1/users/:id/roles | 用户分配角色（多对多） |
| GET/POST | /api/v1/roles | 角色分页列表 / 新增 |
| GET/PUT/DELETE | /api/v1/roles/:id | 角色详情/修改/删除 |
| PUT | /api/v1/roles/:id/menus | 角色分配菜单（多对多） |
| PUT | /api/v1/roles/:id/depts | 角色自定义数据范围绑定部门 |
| GET/POST | /api/v1/menus | 菜单树 / 新增（目录/页面菜单/按钮） |
| GET/PUT/DELETE | /api/v1/menus/:id | 菜单详情/修改/删除 |
| GET/POST | /api/v1/depts | 部门树 / 新增 |
| GET/PUT/DELETE | /api/v1/depts/:id | 部门详情/修改/删除 |

## 数据权限（DataScope）

角色数据范围：1=全部数据，2=自定义部门，3=仅本部门，4=本部门及下级。
用户列表等按部门维度的查询会自动追加 `WHERE dept_id IN (...)` 过滤。

## 编译部署

```bash
# 发布版打包：产物输出到项目根目录的 bin/ 目录
# 流程：裁剪符号表(-s -w) 编译 -> UPX 压缩（本机实测 24.1MB -> 5.8MB）
task package

# 或手动打包到 bin/
mkdir -p bin
GOOS=linux GOARCH=amd64 go build -ldflags="-s -w" -o bin/server ./cmd/server   # Linux
go build -ldflags="-s -w" -o bin/server.exe ./cmd/server                       # Windows
upx --best --lzma bin/server.exe                                               # 可选：UPX 压缩
```

```bash
# 运行（生产）
APP_ENV=prod ./bin/server
```

> UPX 压缩后的可执行文件已实测可正常启动并处理请求。
> 未安装 UPX 时（Linux 分支）自动跳过压缩；Windows 分支需提前安装。
> `bin/` 目录已加入 .gitignore，不会被提交。
