# Toyland Express 🧸

儿童玩具商城。原先是一个「前后端写在一起」的 Next.js 单体应用，现在按职责拆成了 **三个独立子项目 + 一个共享包**，仍然放在同一个 git 仓库里（pnpm workspace monorepo）。

## 目录结构

```
toy-store/
├── apps/
│   ├── api/          # 纯后端：只提供 /api 接口（Next.js Route Handlers + Prisma）
│   ├── web/          # 纯 C 端：商城前台（首页 / 商品详情 / 购物车 / 个人中心）
│   └── admin/        # 纯后台管理：登录 + 商品管理
├── packages/
│   └── shared/       # 三端共用的 TypeScript 类型定义（无运行时代码）
├── pnpm-workspace.yaml
└── package.json      # 只放工作区脚本，不放业务依赖
```

## 三个子项目的边界

| 子项目                | 端口   | 职责                                                                             | 不再包含                         |
| ------------------ | ---- | ------------------------------------------------------------------------------ | ---------------------------- |
| `@toy-store/api`   | 4000 | `/api/toys`、`/api/orders`、`/api/auth`、`/api/admin/*`、`/api/health`；Prisma 数据访问 | 任何页面、组件、样式                   |
| `@toy-store/web`   | 3000 | C 端页面与交互；通过 HTTP 调用后端                                                          | 数据库、Prisma、后台页面              |
| `@toy-store/admin` | 3001 | 后台登录与商品增删改查                                                                    | 数据库、Prisma、C 端页面/Navbar/客服组件 |

三端之间**只通过 HTTP 接口通信**，互不引用对方源码；共享的只有 `packages/shared` 里的类型。

> `packages/shared` 通过 `tsconfig.json` 的 `paths` + `next.config.ts` 的 `turbopack.resolveAlias` 直接引用源码，  
> 不依赖 workspace 软链（Windows 无符号链接权限时也能正常构建）。因此它没有出现在各子项目的 `dependencies` 里。
>
> `pnpm-workspace.yaml` 里设置了 `nodeLinker: hoisted`，依赖会平铺到根 `node_modules`，避免 isolated 模式在 Windows 上软链失败导致依赖装不全。

## 快速开始

```bash
pnpm install          # 安装所有子项目依赖

pnpm db:push          # 首次：把 schema 同步到 SQLite
pnpm db:seed          # 首次：写入演示数据（含管理员账号）

pnpm dev              # 三个服务一起启动
# 或分别启动
pnpm dev:api          # http://localhost:4000
pnpm dev:web          # http://localhost:3000
pnpm dev:admin        # http://localhost:3001
```

访问：

- C 端商城：<http://localhost:3000>
- 管理后台：<http://localhost:3001/admin/login>
- 后端接口：<http://localhost:4000/api/toys> （健康检查 `/api/health`）

## 演示账号（来自 prisma/seed.ts）

| 角色   | 账号                     | 密码                          |
| ---- | ---------------------- | --------------------------- |
| 管理员  | `admin@toyland.com`    | `admin_secure_password_123` |
| 普通用户 | `customer@toyland.com` | `123456password`            |

## 环境变量

每个子项目都有 `.env.example`，按需复制成 `.env.local`（已被 git 忽略）。

- `apps/api/.env.local`
  - `CORS_ORIGINS`：允许跨域的前端来源，逗号分隔。默认已放行 `http://localhost:3000` 和 `http://localhost:3001`。
- `apps/web/.env.local`、`apps/admin/.env.local`
  - `NEXT_PUBLIC_API_BASE_URL`：后端地址，不填时默认 `http://localhost:4000`。

部署时把前端的 `NEXT_PUBLIC_API_BASE_URL` 指向真实后端域名，并把该域名加入后端的 `CORS_ORIGINS` 即可。

## 常用脚本

```bash
pnpm build            # 依次构建三个子项目
pnpm lint             # 三个子项目分别 lint

pnpm db:generate      # prisma generate
pnpm db:migrate       # prisma migrate dev
pnpm db:seed          # 重新写入种子数据
pnpm db:studio        # 打开 Prisma Studio
```

## 数据库

Prisma schema 位于 `apps/api/prisma/schema.prisma`，当前使用 SQLite（`apps/api/prisma/dev.db`，已提交到仓库方便直接跑起来）。  
换 PostgreSQL / MySQL 时，把 `datasource` 的 `url` 改成 `env("DATABASE_URL")` 并重新执行 `pnpm db:migrate`。
