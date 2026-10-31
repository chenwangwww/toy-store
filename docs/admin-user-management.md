# 后台用户管理（列表 / 详情 / 封禁）接入指南

> 前置：项目已按 `docs/jwt-guide.md` 接入双 Token（`requireUser` / `requireAdmin` / `authFetch` 已就绪）。

## 抄之前先看：三个最容易漏的点

| # | 关键点 | 漏了会怎样 |
| --- | --- | --- |
| 1 | **`requireUser` 必须改成每次回查数据库**（第 2.1 节） | 只在登录时判断封禁的话，被封用户手上的 token 还能继续用 15 分钟，"已登录的退出"做不到 |
| 2 | **封禁接口返回 401 而不是 403**（第 2.1 节的 `banned()`） | 返回 403 的话，前端 `authFetch` 不会走"刷新→失败→清 token"链路，用户不会自动登出 |
| 3 | **`auth-client.ts` 要加 `authLostHandler`**（第 6.1 节） | 只清了 localStorage，Redux 里还是登录态，Navbar 依旧显示用户名，得手动刷新页面 |

## 0. 设计说明（先看，后面代码才顺）

### 0.1 封禁为什么能"立即"生效

access token 是无状态的，有效期 15 分钟。如果只在登录时检查封禁，被封的用户手上的 token 还能继续用 15 分钟——这不满足「已登录的会退出登录状态」。

所以本方案的核心改动只有一处：**`requireUser` 每次校验 token 时回查一次数据库**。

```
请求 → 验签通过 → 查 User 表 → bannedAt 非空 → 401 (code: ACCOUNT_BANNED)
                              → bannedAt 为空 → 放行
```

配套三件事：

1. 封禁时 **删除该用户所有 RefreshToken 记录**，让他刷新也救不回来；
2. 封禁接口返回 **401**（不是 403），正好复用前端 `authFetch` 已有的「401 → 刷新 → 刷新也失败 → 清 token → 登出」链路，前端请求代码一行都不用改；
3. C 端加一个 **60 秒轮询 + 窗口聚焦时校验**，让"干坐着不动"的用户也能在一分钟内被踢下线。

代价：每个需要登录的接口多一次 SQLite 查询。这个项目量级完全无感；将来上量了可以加 Redis 缓存或改成 tokenVersion 方案。

### 0.2 数据模型

`User` 加两个字段：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `bannedAt` | `DateTime?` | `null` = 正常；非空 = 封禁时间 |
| `bannedReason` | `String?` | 封禁原因，展示给用户 |

用 `bannedAt` 而不是 `isBanned: Boolean`，是为了顺带记下封禁时间，且「是否封禁」用一个字段就能判断，不会出现两个字段打架。

### 0.3 接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/admin/users` | 列表，支持 `page` / `pageSize` / `keyword` / `status` |
| GET | `/api/admin/users/[id]` | 详情，含订单数与累计消费、最近 10 笔订单 |
| PATCH | `/api/admin/users/[id]/ban` | 封禁 / 解封，body `{ banned: boolean, reason?: string }` |

安全约束：**不能封禁管理员账号**（含自己），否则可能把后台锁死。

---

## 1. 数据库改动

### 1.1 `apps/api/prisma/schema.prisma`

在 `User` 模型里加两行：

```prisma
model User {
  id        String   @id @default(uuid())
  username  String
  email     String   @unique
  password  String
  phone     String?
  avatar    String?
  isAdmin   Boolean  @default(false)
  orders    Order[]
  refreshTokens RefreshToken[]

  bannedAt     DateTime?   // ← 新增：null 表示正常，非空表示封禁时间
  bannedReason String?     // ← 新增：封禁原因

  createdAt DateTime @default(now())
}
```

### 1.2 同步

```bash
pnpm db:push
pnpm db:generate
```

---

## 2. 后端：让封禁即时生效

### 2.1 改 `apps/api/src/lib/auth.ts`

**新增** `banned()` 辅助函数（放在 `forbidden()` 下面）：

```ts
/**
 * 账号被封禁。
 * 故意用 401 而不是 403：前端 authFetch 只在 401 时才会去刷新 token，
 * 刷新接口同样会返回 401，于是自动清空本地 token 并退出登录。
 */
export function banned(message = '账号已被封禁') {
  return NextResponse.json({ error: message, code: 'ACCOUNT_BANNED' }, { status: 401 });
}
```

**整段替换** `requireUser`（关键改动）：

```ts
/** 需要登录的接口用这个 */
export async function requireUser(request: Request): Promise<AuthResult> {
  const payload = await getAuthPayload(request);
  if (!payload) return { ok: false, response: unauthorized() };

  // 每个请求都回查一次数据库：
  // 1) 用户被删除 → 立刻失效
  // 2) 用户被封禁 → 立刻踢下线（不用等 access token 过期）
  // 3) 角色以数据库为准 → 降权也能立刻生效
  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { id: true, email: true, isAdmin: true, bannedAt: true },
  });

  if (!user) return { ok: false, response: unauthorized('账号不存在') };
  if (user.bannedAt) return { ok: false, response: banned('账号已被封禁') };

  return {
    ok: true,
    user: { id: user.id, email: user.email, role: user.isAdmin ? 'admin' : 'user' },
  };
}
```

> `requireAdmin` 不用动，它内部调 `requireUser`，会自动拿到最新角色。

### 2.2 改 `apps/api/src/lib/user.ts`

新增一个后台专用的转换函数（`toPublicUser` 保持不变，不要给 C 端返回封禁字段）：

```ts
/** 后台用的用户信息：比 C 端多封禁状态 */
export function toAdminUser(user: {
  id: string;
  username: string;
  email: string;
  phone: string | null;
  avatar: string | null;
  isAdmin: boolean;
  bannedAt: Date | null;
  bannedReason: string | null;
  createdAt: Date;
}) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    phone: user.phone,
    avatar: user.avatar,
    isAdmin: user.isAdmin,
    bannedAt: user.bannedAt,
    bannedReason: user.bannedReason,
    createdAt: user.createdAt,
  };
}
```

### 2.3 改 `apps/api/src/app/api/auth/route.ts`（登录拦截）

在 `login` 分支里，密码校验通过之后、`isAdmin` 判断之前插入：

```ts
      if (user.bannedAt) {
        return NextResponse.json(
          {
            error: user.bannedReason
              ? `账号已被封禁：${user.bannedReason}`
              : '账号已被封禁，如有疑问请联系客服',
            code: 'ACCOUNT_BANNED',
          },
          { status: 403 },
        );
      }
```

改完这一段长这样：

```ts
    if (action === 'login') {
      const user = await prisma.user.findUnique({ where: { email } });
      if (!user || user.password !== password) {
        return NextResponse.json({ error: '账号或密码错误' }, { status: 401 });
      }

      // ← 新增：封禁校验
      if (user.bannedAt) {
        return NextResponse.json(
          {
            error: user.bannedReason
              ? `账号已被封禁：${user.bannedReason}`
              : '账号已被封禁，如有疑问请联系客服',
            code: 'ACCOUNT_BANNED',
          },
          { status: 403 },
        );
      }

      if (user.isAdmin) {
        return NextResponse.json(
          { error: '该账号为管理员账号，请前往管理后台登录' },
          { status: 403 },
        );
      }

      const tokens = await issueTokenPair(user);
      return NextResponse.json({ user: toPublicUser(user), ...tokens });
    }
```

### 2.4 改 `apps/api/src/app/api/auth/refresh/route.ts`

找到 `const user = await prisma.user.findUnique(...)` 那段，在 `if (!user)` 之后插入：

```ts
    // 被封禁的账号连刷新都不允许，顺手把残留的 refresh token 清干净
    if (user.bannedAt) {
      await prisma.refreshToken.deleteMany({ where: { userId: user.id } });
      return NextResponse.json(
        { error: '账号已被封禁', code: 'ACCOUNT_BANNED' },
        { status: 401 },
      );
    }
```

改完是：

```ts
    const user = await prisma.user.findUnique({ where: { id: stored.userId } });
    if (!user) {
      return NextResponse.json(
        { error: '用户不存在', code: 'UNAUTHORIZED' },
        { status: 401 },
      );
    }

    // ← 新增
    if (user.bannedAt) {
      await prisma.refreshToken.deleteMany({ where: { userId: user.id } });
      return NextResponse.json(
        { error: '账号已被封禁', code: 'ACCOUNT_BANNED' },
        { status: 401 },
      );
    }

    // 轮换：旧 refresh token 立即作废，换一对新的
    ...
```

> `apps/api/src/app/api/auth/me/route.ts` **不用改**，`requireUser` 已经拦住了。

---

## 3. 后端：三个管理接口

### 3.1 新建 `apps/api/src/app/api/admin/users/route.ts`（列表）

```ts
import { NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);

  const page = Math.max(1, Number(searchParams.get('page')) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(searchParams.get('pageSize')) || 10));
  const keyword = (searchParams.get('keyword') ?? '').trim();
  const status = searchParams.get('status') ?? 'all';

  const where: Prisma.UserWhereInput = {};

  if (keyword) {
    // SQLite 的 LIKE 对 ASCII 本身不区分大小写，这里直接 contains 即可
    where.OR = [
      { email: { contains: keyword } },
      { username: { contains: keyword } },
    ];
  }
  if (status === 'banned') where.bannedAt = { not: null };
  if (status === 'active') where.bannedAt = null;

  try {
    const [total, rows] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          username: true,
          email: true,
          phone: true,
          avatar: true,
          isAdmin: true,
          bannedAt: true,
          bannedReason: true,
          createdAt: true,
          _count: { select: { orders: true } },
        },
      }),
    ]);

    return NextResponse.json({
      items: rows.map(({ _count, ...user }) => ({ ...user, orderCount: _count.orders })),
      total,
      page,
      pageSize,
    });
  } catch (error) {
    console.error('[api/admin/users]', error);
    return NextResponse.json({ error: '获取用户列表失败' }, { status: 500 });
  }
}
```

### 3.2 新建 `apps/api/src/app/api/admin/users/[id]/route.ts`（详情）

```ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;

  const { id } = await params;

  try {
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        username: true,
        email: true,
        phone: true,
        avatar: true,
        isAdmin: true,
        bannedAt: true,
        bannedReason: true,
        createdAt: true,
        _count: { select: { orders: true } },
        // 最近 10 笔订单，够详情页展示了
        orders: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          include: { items: { include: { toy: true } } },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: '用户不存在' }, { status: 404 });
    }

    // 累计消费单独聚合，避免把全部订单捞出来再求和
    const agg = await prisma.order.aggregate({
      where: { userId: id },
      _sum: { totalAmount: true },
    });

    const { _count, ...rest } = user;

    return NextResponse.json({
      ...rest,
      orderCount: _count.orders,
      totalSpent: agg._sum.totalAmount ?? 0,
    });
  } catch (error) {
    console.error('[api/admin/users/:id]', error);
    return NextResponse.json({ error: '获取用户详情失败' }, { status: 500 });
  }
}
```

### 3.3 新建 `apps/api/src/app/api/admin/users/[id]/ban/route.ts`（封禁 / 解封）

```ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';
import { toAdminUser } from '@/lib/user';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;

  const { id } = await params;

  try {
    const body = await request.json();
    const { banned, reason } = body as { banned?: boolean; reason?: string };

    if (typeof banned !== 'boolean') {
      return NextResponse.json({ error: '参数 banned 必须是布尔值' }, { status: 400 });
    }

    // 不能封自己
    if (id === auth.user.id) {
      return NextResponse.json({ error: '不能封禁自己的账号' }, { status: 400 });
    }

    const target = await prisma.user.findUnique({
      where: { id },
      select: { id: true, isAdmin: true },
    });

    if (!target) {
      return NextResponse.json({ error: '用户不存在' }, { status: 404 });
    }

    // 管理员账号一律不允许封禁，避免把后台锁死
    if (target.isAdmin) {
      return NextResponse.json({ error: '不能封禁管理员账号' }, { status: 400 });
    }

    const updated = await prisma.user.update({
      where: { id },
      data: banned
        ? { bannedAt: new Date(), bannedReason: reason?.trim() || null }
        : { bannedAt: null, bannedReason: null },
      select: {
        id: true,
        username: true,
        email: true,
        phone: true,
        avatar: true,
        isAdmin: true,
        bannedAt: true,
        bannedReason: true,
        createdAt: true,
      },
    });

    // 关键：立刻作废该用户所有 refresh token，让他连刷新都做不到
    if (banned) {
      await prisma.refreshToken.deleteMany({ where: { userId: id } });
    }

    return NextResponse.json(toAdminUser(updated));
  } catch (error) {
    console.error('[api/admin/users/:id/ban]', error);
    return NextResponse.json({ error: '操作失败' }, { status: 500 });
  }
}
```

---

## 4. 共享类型

在 `packages/shared/src/index.ts` 末尾追加：

```ts
/** 后台用户列表项 */
export interface AdminUserListItem {
  id: string;
  username: string;
  email: string;
  phone: string | null;
  avatar: string | null;
  isAdmin: boolean;
  bannedAt: string | null;
  bannedReason: string | null;
  createdAt: string;
  orderCount: number;
}

/** 后台用户详情：多累计消费和最近订单 */
export interface AdminUserDetail extends AdminUserListItem {
  totalSpent: number;
  orders: Order[];
}

/** 通用分页返回 */
export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
```

---

## 5. 后台前端

### 5.1 改 `apps/admin/src/services/adminApi.ts`

顶部 import 补上类型：

```ts
import type {
  AdminUserDetail,
  AdminUserListItem,
  PaginatedResult,
  Toy,
  ToyInput,
} from "@toy-store/shared";
```

在 `adminApi` 对象里（`logout` 之前）插入三个方法：

```ts
  getUsers: async (params: {
    page?: number;
    pageSize?: number;
    keyword?: string;
    status?: 'all' | 'active' | 'banned';
  } = {}): Promise<PaginatedResult<AdminUserListItem>> => {
    const qs = new URLSearchParams();
    if (params.page) qs.set('page', String(params.page));
    if (params.pageSize) qs.set('pageSize', String(params.pageSize));
    if (params.keyword) qs.set('keyword', params.keyword);
    if (params.status && params.status !== 'all') qs.set('status', params.status);

    const res = await authFetch(`/api/admin/users?${qs.toString()}`);
    return parseResponse<PaginatedResult<AdminUserListItem>>(res, '获取用户列表失败');
  },

  getUser: async (id: string): Promise<AdminUserDetail> => {
    const res = await authFetch(`/api/admin/users/${id}`);
    return parseResponse<AdminUserDetail>(res, '获取用户详情失败');
  },

  banUser: async (
    id: string,
    payload: { banned: boolean; reason?: string },
  ): Promise<AdminUserListItem> => {
    const res = await authFetch(`/api/admin/users/${id}/ban`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return parseResponse<AdminUserListItem>(res, '操作失败');
  },
```

### 5.2 新建 `apps/admin/src/app/admin/users/page.tsx`

```tsx
'use client'

import React, { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { adminApi } from '@/services/adminApi'
import { getAccessToken } from '@/lib/auth-client'
import type { AdminUserDetail, AdminUserListItem, PaginatedResult } from '@toy-store/shared'
import {
  Search,
  ShieldBan,
  ShieldCheck,
  X,
  Package,
  Mail,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Users,
} from 'lucide-react'

const PAGE_SIZE = 10

export default function AdminUsersPage() {
  const router = useRouter()
  const [authorized, setAuthorized] = useState(false)

  const [searchInput, setSearchInput] = useState('')
  const [keyword, setKeyword] = useState('')
  const [status, setStatus] = useState<'all' | 'active' | 'banned'>('all')
  const [page, setPage] = useState(1)

  const [data, setData] = useState<PaginatedResult<AdminUserListItem> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [detail, setDetail] = useState<AdminUserDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [reason, setReason] = useState('')
  const [acting, setActing] = useState(false)

  // 权限校验：与 toys 页同一套
  useEffect(() => {
    const raw = sessionStorage.getItem('admin_user')
    if (!raw || !getAccessToken()) {
      sessionStorage.removeItem('admin_user')
      router.replace('/admin/login')
      return
    }

    let isAdmin = false
    try {
      isAdmin = Boolean(JSON.parse(raw)?.isAdmin)
    } catch {
      isAdmin = false
    }

    if (!isAdmin) {
      sessionStorage.removeItem('admin_user')
      router.replace('/admin/login')
      return
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAuthorized(true)
  }, [router])

  const fetchUsers = useCallback(async () => {
    if (!getAccessToken()) {
      router.replace('/admin/login')
      return
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    setError('')

    try {
      const res = await adminApi.getUsers({ page, pageSize: PAGE_SIZE, keyword, status })
      setData(res)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败')
      // 登录态彻底失效（authFetch 已清空本地 token）→ 回登录页
      if (!getAccessToken()) {
        sessionStorage.removeItem('admin_user')
        router.replace('/admin/login')
      }
    } finally {
      setLoading(false)
    }
  }, [page, keyword, status, router])

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  const openDetail = async (id: string) => {
    setDetailLoading(true)
    setDetail(null)
    setReason('')

    try {
      const res = await adminApi.getUser(id)
      setDetail(res)
      setReason(res.bannedReason ?? '')
    } catch (err) {
      alert(err instanceof Error ? err.message : '加载详情失败')
    } finally {
      setDetailLoading(false)
    }
  }

  const handleToggleBan = async (user: AdminUserListItem | AdminUserDetail) => {
    const nextBanned = !user.bannedAt

    const ok = nextBanned
      ? confirm(`确定封禁「${user.username}」吗？封禁后该用户会立刻被踢下线，且无法再登录。`)
      : confirm(`确定解封「${user.username}」吗？`)
    if (!ok) return

    setActing(true)
    try {
      await adminApi.banUser(user.id, {
        banned: nextBanned,
        reason: nextBanned ? reason.trim() || undefined : undefined,
      })
      await fetchUsers()
      if (detail?.id === user.id) await openDetail(user.id)
    } catch (err) {
      alert(err instanceof Error ? err.message : '操作失败')
    } finally {
      setActing(false)
    }
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setPage(1)
    setKeyword(searchInput.trim())
  }

  if (!authorized) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center font-bold text-pink-600">
        正在进行安全校验...
      </div>
    )
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1

  return (
    <div className="max-w-7xl mx-auto px-4 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-pink-100 text-pink-700 text-xs font-bold mb-2">
            <Users className="w-3.5 h-3.5" /> 会员管理
          </div>
          <h1 className="text-3xl font-black text-gray-900">用户列表</h1>
          <p className="text-sm text-gray-400 mt-1">
            共 {data?.total ?? 0} 位用户，封禁后该用户会立刻退出登录且无法再登录
          </p>
        </div>

        <form onSubmit={handleSearch} className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="搜索邮箱 / 用户名"
              className="w-64 pl-9 pr-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-pink-500 text-gray-800"
            />
          </div>
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as 'all' | 'active' | 'banned')
              setPage(1)
            }}
            className="px-3 py-2.5 rounded-xl border border-gray-200 text-sm bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-pink-500"
          >
            <option value="all">全部状态</option>
            <option value="active">正常</option>
            <option value="banned">已封禁</option>
          </select>
          <button
            type="submit"
            className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-pink-500 to-amber-500 text-white text-sm font-bold shadow hover:opacity-95 transition"
          >
            搜索
          </button>
        </form>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-xl bg-red-50 text-red-600 text-sm font-medium">{error}</div>
      )}

      <div className="bg-white rounded-3xl border border-pink-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="text-center py-20 text-pink-500 font-bold">加载中...</div>
        ) : !data || data.items.length === 0 ? (
          <div className="text-center py-20 text-gray-400">没有匹配的用户</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-pink-50/50 border-b border-pink-100 text-xs font-bold text-gray-600 uppercase">
                  <th className="p-4">用户</th>
                  <th className="p-4">注册时间</th>
                  <th className="p-4">订单数</th>
                  <th className="p-4">状态</th>
                  <th className="p-4 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm">
                {data.items.map((user) => (
                  <tr key={user.id} className="hover:bg-pink-50/20 transition">
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <img
                          src={user.avatar || 'https://api.dicebear.com/7.x/bottts/svg?seed=default'}
                          alt=""
                          className="w-10 h-10 rounded-full bg-pink-50 border border-pink-100"
                        />
                        <div>
                          <div className="font-bold text-gray-800">
                            {user.username}
                            {user.isAdmin && (
                              <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-white align-middle">
                                ADMIN
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-gray-400">{user.email}</span>
                        </div>
                      </div>
                    </td>
                    <td className="p-4 text-gray-600">
                      {new Date(user.createdAt).toLocaleDateString()}
                    </td>
                    <td className="p-4 text-gray-600">{user.orderCount}</td>
                    <td className="p-4">
                      {user.bannedAt ? (
                        <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-red-50 text-red-600">
                          已封禁
                        </span>
                      ) : (
                        <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-600">
                          正常
                        </span>
                      )}
                    </td>
                    <td className="p-4 text-right space-x-2 whitespace-nowrap">
                      <button
                        onClick={() => openDetail(user.id)}
                        className="px-3 py-1.5 rounded-xl bg-gray-50 text-gray-600 text-xs font-bold hover:bg-pink-100 hover:text-pink-600 transition"
                      >
                        详情
                      </button>
                      <button
                        onClick={() => handleToggleBan(user)}
                        disabled={acting || user.isAdmin}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition disabled:opacity-40 ${
                          user.bannedAt
                            ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
                            : 'bg-red-50 text-red-600 hover:bg-red-100'
                        }`}
                      >
                        {user.bannedAt ? '解封' : '封禁'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {data && data.total > data.pageSize && (
        <div className="flex items-center justify-between mt-6 text-sm text-gray-500">
          <span>
            第 {data.page} / {totalPages} 页
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={data.page <= 1}
              className="flex items-center gap-1 px-3 py-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40 transition"
            >
              <ChevronLeft className="w-4 h-4" /> 上一页
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={data.page >= totalPages}
              className="flex items-center gap-1 px-3 py-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40 transition"
            >
              下一页 <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {(detail || detailLoading) && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full p-8 relative my-8">
            <button
              onClick={() => {
                setDetail(null)
                setReason('')
              }}
              className="absolute top-6 right-6 text-gray-400 hover:text-gray-600 p-1"
            >
              <X className="w-5 h-5" />
            </button>

            {detailLoading || !detail ? (
              <div className="py-20 text-center text-pink-500 font-bold">加载中...</div>
            ) : (
              <>
                <div className="flex items-center gap-4 mb-6">
                  <img
                    src={detail.avatar || 'https://api.dicebear.com/7.x/bottts/svg?seed=default'}
                    alt=""
                    className="w-16 h-16 rounded-full bg-pink-50 border-2 border-pink-200"
                  />
                  <div>
                    <h2 className="text-2xl font-black text-gray-900">{detail.username}</h2>
                    <div className="flex items-center gap-3 text-xs text-gray-400 mt-1">
                      <span className="flex items-center gap-1">
                        <Mail className="w-3.5 h-3.5" /> {detail.email}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" />
                        {new Date(detail.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </div>

                {detail.bannedAt && (
                  <div className="mb-4 p-3 rounded-xl bg-red-50 text-red-600 text-sm">
                    <div className="font-bold flex items-center gap-1.5">
                      <ShieldBan className="w-4 h-4" /> 已封禁
                    </div>
                    <div className="mt-1 text-xs">
                      封禁时间：{new Date(detail.bannedAt).toLocaleString()}
                      {detail.bannedReason ? `　原因：${detail.bannedReason}` : ''}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-3 gap-3 mb-6">
                  <div className="p-4 rounded-2xl bg-pink-50/40 border border-pink-50">
                    <div className="text-xs text-gray-400">订单数</div>
                    <div className="text-xl font-black text-gray-900">{detail.orderCount}</div>
                  </div>
                  <div className="p-4 rounded-2xl bg-pink-50/40 border border-pink-50">
                    <div className="text-xs text-gray-400">累计消费</div>
                    <div className="text-xl font-black text-pink-600">¥{detail.totalSpent.toFixed(2)}</div>
                  </div>
                  <div className="p-4 rounded-2xl bg-pink-50/40 border border-pink-50">
                    <div className="text-xs text-gray-400">账号状态</div>
                    <div
                      className={`text-xl font-black ${
                        detail.bannedAt ? 'text-red-600' : 'text-emerald-600'
                      }`}
                    >
                      {detail.bannedAt ? '已封禁' : '正常'}
                    </div>
                  </div>
                </div>

                <h3 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
                  <Package className="w-4 h-4 text-pink-600" /> 最近订单
                </h3>

                {detail.orders.length === 0 ? (
                  <p className="text-sm text-gray-400 py-6 text-center">该用户暂无订单</p>
                ) : (
                  <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                    {detail.orders.map((order) => (
                      <div
                        key={order.id}
                        className="p-3 rounded-2xl border border-gray-100 flex items-center justify-between text-sm"
                      >
                        <div>
                          <div className="font-bold text-gray-800">¥{order.totalAmount}</div>
                          <div className="text-xs text-gray-400">
                            {new Date(order.createdAt).toLocaleString()}
                          </div>
                        </div>
                        <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-pink-50 text-pink-600">
                          {order.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="mt-6 pt-5 border-t border-gray-100">
                  {detail.bannedAt ? (
                    <button
                      onClick={() => handleToggleBan(detail)}
                      disabled={acting}
                      className="w-full py-3 rounded-xl bg-emerald-50 text-emerald-600 font-bold hover:bg-emerald-100 transition disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      <ShieldCheck className="w-4 h-4" /> 解封该用户
                    </button>
                  ) : (
                    <div className="space-y-3">
                      <input
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="封禁原因（可选，会展示给用户）"
                        className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-pink-500 text-gray-800"
                      />
                      <button
                        onClick={() => handleToggleBan(detail)}
                        disabled={acting || detail.isAdmin}
                        className="w-full py-3 rounded-xl bg-red-50 text-red-600 font-bold hover:bg-red-100 transition disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        <ShieldBan className="w-4 h-4" />
                        {detail.isAdmin ? '管理员账号不可封禁' : '封禁该用户'}
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
```

### 5.3 改 `apps/admin/src/components/AdminHeader.tsx`（加导航）

把 logo 和右侧用户信息之间的部分改成「logo + 导航 + 用户区」。

**import 补图标：**

```tsx
import { LogOut, Package, ShieldCheck, Users } from "lucide-react";
```

**把整个 `<div className="max-w-7xl ...">` 内部替换为：**

```tsx
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href="/admin/toys" className="flex items-center gap-2 font-bold">
            <span className="w-8 h-8 rounded-lg bg-gradient-to-tr from-pink-500 to-amber-400 flex items-center justify-center">
              <Package className="w-4 h-4" />
            </span>
            Toyland Admin
          </Link>

          <nav className="flex items-center gap-1 text-sm">
            <Link
              href="/admin/toys"
              className={`px-3 py-1.5 rounded-lg transition ${
                pathname?.startsWith('/admin/toys')
                  ? 'bg-white/10 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              商品管理
            </Link>
            <Link
              href="/admin/users"
              className={`px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 ${
                pathname?.startsWith('/admin/users')
                  ? 'bg-white/10 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Users className="w-4 h-4" /> 用户管理
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-4 text-sm">
          {user?.username && (
            <span className="hidden sm:flex items-center gap-1.5 text-slate-300">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              {user.username}
            </span>
          )}
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 text-slate-300 hover:text-white transition"
          >
            <LogOut className="w-4 h-4" /> 退出
          </button>
        </div>
      </div>
```

---

## 6. C 端：让"干坐着"的用户也被踢下线

后端已经保证**任何请求**都会立刻 401，但还差两件事：

1. `authFetch` 刷新失败时只清了 localStorage，**Redux 里的 `user` 还在**，Navbar 依旧显示"已登录"；
2. 用户停在页面不动时不会发请求，感知不到自己已经被封。

### 6.1 改 `apps/web/src/lib/auth-client.ts`（加登出通知）

在文件顶部 `clearTokens()` 之后追加：

```ts
/**
 * 登录态彻底失效时的回调。
 * 由 Providers 注册，用来把 Redux 里的用户信息也清掉——
 * 否则 localStorage 清了但界面还显示"已登录"，得手动刷新页面才正常。
 */
let authLostHandler: (() => void) | null = null;

export function setAuthLostHandler(handler: (() => void) | null) {
  authLostHandler = handler;
}
```

在 `doRefresh()` 里 `if (!res.ok)` 那个分支加上 `authLostHandler`：

```ts
    if (!res.ok) {
      clearTokens();
      authLostHandler?.();
      return null;
    }
```

改完 `doRefresh` 长这样：

```ts
async function doRefresh(): Promise<string | null> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;

  try {
    const res = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    if (!res.ok) {
      clearTokens();
      authLostHandler?.();   // ← 新增：通知 UI 一起登出
      return null;
    }

    const data = await res.json();
    saveTokens(data);
    return data.accessToken as string;
  } catch {
    return null;
  }
}
```

> 只有「refresh token 也失效」才会触发回调。单纯 access token 过期会自动刷新，用户无感。

### 6.2 改 `apps/web/src/providers/Providers.tsx`

**import 改成：**

```tsx
import { logout, setUser } from "@/store/authSlice";
import { clearTokens, getAccessToken, setAuthLostHandler } from "@/lib/auth-client";
```

**把原来那个恢复登录态的 `useEffect` 整段替换为：**

```tsx
  // 1) 注册"登录态失效"回调：任何请求发现 token 救不回来，立刻清 Redux
  useEffect(() => {
    setAuthLostHandler(() => store.dispatch(logout()));
    return () => setAuthLostHandler(null);
  }, []);

  // 2) 刷新页面后 Redux 会重置，用本地 token 换回用户信息；
  //    同时每 60 秒 + 窗口聚焦时校验一次，被封禁后即使不操作也会自动登出
  useEffect(() => {
    let cancelled = false;

    const check = () => {
      if (!getAccessToken()) return;
      api
        .me()
        .then((user) => {
          if (!cancelled) store.dispatch(setUser(user));
        })
        .catch(() => {
          if (cancelled) return;
          // me() 内部已尝试过刷新，走到这里说明登录态彻底没了
          clearTokens();
          store.dispatch(logout());
        });
    };

    check();
    const timer = setInterval(check, 60_000);
    window.addEventListener('focus', check);

    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener('focus', check);
    };
  }, []);
```

这样三处联动，封禁后用户体验是：

| 场景 | 表现 |
| --- | --- |
| 用户正在操作（下单、看订单） | 下一个请求立刻 401 → 刷新失败 → 清 token + 清 Redux → Navbar 变回「登录/注册」 |
| 用户停在页面不动 | 最多 60 秒内轮询触发，自动登出 |
| 切回浏览器标签页 | `focus` 事件立刻触发校验，马上登出 |
| 重新登录 | 被 `/api/auth` 的封禁校验挡住，提示「账号已被封禁：原因」 |

---

## 7. 自测

### 7.1 后端接口

```bash
# 1. 管理员登录拿 token
curl -X POST http://localhost:4000/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@toyland.com","password":"admin_secure_password_123"}'

# 2. 用户列表（把 <ADMIN> 换成上一步的 accessToken）
curl "http://localhost:4000/api/admin/users?page=1&pageSize=10" \
  -H "Authorization: Bearer <ADMIN>"

# 3. 搜索 + 只看已封禁
curl "http://localhost:4000/api/admin/users?keyword=customer&status=banned" \
  -H "Authorization: Bearer <ADMIN>"

# 4. 用户详情（<UID> 换成列表里的 id）
curl http://localhost:4000/api/admin/users/<UID> -H "Authorization: Bearer <ADMIN>"

# 5. 封禁
curl -X PATCH http://localhost:4000/api/admin/users/<UID>/ban \
  -H "Authorization: Bearer <ADMIN>" \
  -H "Content-Type: application/json" \
  -d '{"banned":true,"reason":"恶意刷单"}'

# 6. 被封用户登录 → 应该 403 且提示"账号已被封禁：恶意刷单"
curl -X POST http://localhost:4000/api/auth \
  -H "Content-Type: application/json" \
  -d '{"action":"login","email":"customer@toyland.com","password":"123456password"}'

# 7. 拿封禁前签发的 access token 请求订单 → 应该 401 + ACCOUNT_BANNED
curl -i http://localhost:4000/api/orders -H "Authorization: Bearer <封禁前拿到的ACCESS>"

# 8. 解封
curl -X PATCH http://localhost:4000/api/admin/users/<UID>/ban \
  -H "Authorization: Bearer <ADMIN>" \
  -H "Content-Type: application/json" \
  -d '{"banned":false}'
```

### 7.2 前端

1. 后台 `/admin/users` → 列表能出来，搜索"customer"能过滤。
2. 点「详情」→ 弹窗显示订单数、累计消费、最近订单。
3. 点「封禁」→ 填原因 → 确认 → 状态变红「已封禁」。
4. **关键**：在 C 端已登录的标签页里，随便点个需要登录的页面（个人中心 / 下单）→ 顶部立刻变回「登录 / 注册」，不需要手动刷新。
5. 停在首页不动，60 秒内（或切回标签页时）也会自动退出。
6. 用被封的账号登录 → 提示"账号已被封禁：xxx"。
7. 解封后重新登录 → 一切正常。

---

## 8. 注意事项

1. **性能**：`requireUser` 现在每个请求多一次 `findUnique`。SQLite 本地查询在微秒级，无感。如果以后换成远程数据库或 QPS 上来了，可以改成 `tokenVersion` 方案（token 里带版本号，封禁时 +1，校验只比数字不查库），但那样"用户被删"就检测不到了。
2. **`requireUser` 里的角色以数据库为准**：token 里的 `role` 不再被信任。管理员被降权后会立刻失效，这是好事。
3. **`toPublicUser` 不要加 `bannedAt`**：C 端用不到，泄露了也没意义。后台单独用 `toAdminUser`。
4. **封禁不删用户数据**：订单、地址都保留，解封后恢复原样。
5. **管理员账号不可封禁**：接口层已拦（`isAdmin` 判断 + 不能封自己），前端按钮也置灰。否则误操作会把后台锁死，只能改数据库救回来。
6. 如果之后要做「解封后通知用户」，可以在 `ban` 接口里加邮件/站内信，不影响现有逻辑。
7. **`/api/auth/me` 现在会查两次库**：`requireUser` 查一次确认身份，路由里又查一次取完整字段。功能没问题，想省一次可以改成从 `requireUser` 返回值里拿，但要多带几个字段，不建议为这点性能动它。
8. **lint 可能报 `react-hooks/set-state-in-effect`**：`fetchUsers` 里 `setLoading(true)` 是同步 setState，eslint 会给 warning（不是 error，`pnpm build` 不受影响）。文档里已在对应位置加了 `// eslint-disable-next-line`；如果警告位置飘到 `useEffect` 那一行，把注释挪过去即可。

---

## 9. 改动清单

| 类型 | 文件 |
| --- | --- |
| 修改 | `apps/api/prisma/schema.prisma`（User 加 `bannedAt` / `bannedReason`） |
| 修改 | `apps/api/src/lib/auth.ts`（新增 `banned()`，`requireUser` 改为回查数据库） |
| 修改 | `apps/api/src/lib/user.ts`（新增 `toAdminUser`） |
| 修改 | `apps/api/src/app/api/auth/route.ts`（登录拦截封禁） |
| 修改 | `apps/api/src/app/api/auth/refresh/route.ts`（刷新拦截封禁） |
| 新增 | `apps/api/src/app/api/admin/users/route.ts` |
| 新增 | `apps/api/src/app/api/admin/users/[id]/route.ts` |
| 新增 | `apps/api/src/app/api/admin/users/[id]/ban/route.ts` |
| 修改 | `packages/shared/src/index.ts`（3 个类型） |
| 修改 | `apps/admin/src/services/adminApi.ts`（3 个方法） |
| 新增 | `apps/admin/src/app/admin/users/page.tsx` |
| 修改 | `apps/admin/src/components/AdminHeader.tsx`（导航） |
| 修改 | `apps/web/src/providers/Providers.tsx`（注册失效回调 + 轮询校验） |
| 修改 | `apps/web/src/lib/auth-client.ts`（新增 `setAuthLostHandler`） |
| 不改 | `apps/api/src/app/api/auth/me/route.ts`（`requireUser` 已拦住） |
