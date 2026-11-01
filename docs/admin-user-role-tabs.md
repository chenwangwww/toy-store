# 后台用户管理：顶部「客户 / 后台管理员」标签栏

> 承接 `docs/admin-user-management.md`。本篇只做一件事：在后台用户管理页顶部加一个标签栏，把**客户**和**后台管理员**分开看。

## 抄之前先看：这次只动 4 个文件

| # | 文件 | 动作 | 说明 |
| --- | --- | --- | --- |
| 1 | `packages/shared/src/index.ts` | 末尾**追加**两个类型 | `AdminUserRole`、`AdminUserListResult` |
| 2 | `apps/api/src/app/api/admin/users/route.ts` | **整文件替换** | 加 `role` 查询参数 + 返回 `counts` |
| 3 | `apps/admin/src/services/adminApi.ts` | **整文件替换** | `getUsers` 支持传 `role`，返回类型换成 `AdminUserListResult` |
| 4 | `apps/admin/src/app/admin/users/page.tsx` | **整文件替换** | 标签栏 + 按标签页切换表头/操作列 |

**数据库不用动**：`User.isAdmin` 字段早就在了，这次只是把它当成一个筛选维度用起来。

---

## 0. 设计说明

### 0.1 为什么用 `isAdmin` 而不是新加一个 `role` 字段

`User` 表已经有 `isAdmin Boolean @default(false)`，两种角色就是它的两个取值：

```
isAdmin = false  →  客户（C 端注册用户）
isAdmin = true   →  后台管理员（能登录 /admin）
```

再引入 `role: 'user' | 'admin'` 属于同一个信息存两份，迟早打架。所以**筛选维度直接复用 `isAdmin`**，前端只用一个更语义化的 `role: 'customer' | 'admin'` 参数，后端翻成 `where.isAdmin`。

### 0.2 接口变化

`GET /api/admin/users` 新增一个查询参数：

| 参数 | 取值 | 默认 | 说明 |
| --- | --- | --- | --- |
| `role` | `customer` \| `admin` \| `all` | `customer` | 角色分组。默认只看客户，和以前的行为一致 |

返回值多一个 `counts`，专门给标签栏角标用：

```json
{
  "items": [ ... ],
  "total": 8,
  "page": 1,
  "pageSize": 10,
  "counts": { "customer": 12, "admin": 2 }
}
```

`counts` 是**全量**的两类账号总数，**不受当前搜索词 / 状态筛选影响**——否则搜完关键字，另一个标签页的角标会变成 0，看着像数据丢了。

### 0.3 三个交互细节

1. **切标签页 → 页码归 1**，搜索词和状态筛选保留（各标签页内自己生效）。不归 1 的话，客户有 5 页、管理员只有 1 页，从第 5 页切过去会直接空列表。
2. **管理员标签页不出现「封禁」按钮**，只留「详情」。后端本来就拒绝封禁管理员（`ban/route.ts` 里 `if (target.isAdmin) return 400`），前端就别给这个入口，省得点了才报错。
3. **管理员标签页不显示「订单数」列**。管理员一般没订单，这一列全是 0，纯占位。表头和数据行一起条件渲染，别只隐藏表头——那样会错列。

---

## 1. `packages/shared/src/index.ts`

在文件**末尾追加**下面两段（`PaginatedResult` 之后）：

```ts
/** 通用分页返回 */
export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** 后台用户列表的角色分组：customer = 普通客户，admin = 后台管理员 */
export type AdminUserRole = 'customer' | 'admin';

/** 后台用户列表返回：额外带一份两类账号的总数，给顶部标签栏的角标用 */
export interface AdminUserListResult extends PaginatedResult<AdminUserListItem> {
  counts: Record<AdminUserRole, number>;
}
```

> `AdminUserListItem` 在上面已经定义过了，`interface` 会提升，顺序不影响。

---

## 2. `apps/api/src/app/api/admin/users/route.ts`（整文件替换）

```ts
import { NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';

export async function GET(request: Request) {
    const auth = await requireAdmin(request)
    if (!auth.ok) return auth.response

    const { searchParams } = new URL(request.url)
    const page = Math.max(1, Number(searchParams.get('page')) || 1)
    const pageSize = Math.min(50, Math.max(1, Number(searchParams.get('pageSize')) || 10))

    const keyword = (searchParams.get('keyword') ?? '').trim()
    const status = searchParams.get('status') ?? 'all'

    // 角色标签：默认只看客户，管理员单独一个标签页
    const roleParam = searchParams.get('role')
    const role: 'all' | 'customer' | 'admin' =
        roleParam === 'admin' || roleParam === 'all' ? roleParam : 'customer'

    const where: Prisma.UserWhereInput = {}
    // 角色是"硬过滤"，只作用在当前标签页内，和搜索/状态条件是 AND 关系
    if (role === 'customer') where.isAdmin = false
    if (role === 'admin') where.isAdmin = true

    if (keyword) {
        // SQLite 的 LIKE 对 ASCII 本身不区分大小写，这里直接 contains 即可
        where.OR = [
            { email: { contains: keyword } },
            { username: { contains: keyword } },
        ]
    }

    if (status === 'banned') where.bannedAt = { not: null }
    if (status === 'active') where.bannedAt = null;

    try {
        const [total, rows, customerCount, adminCount] = await Promise.all([
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
                }
            }),
            // 两类账号的总数：不受当前搜索/状态条件影响，专门给标签栏角标用
            prisma.user.count({ where: { isAdmin: false } }),
            prisma.user.count({ where: { isAdmin: true } }),
        ])

        return NextResponse.json({
            items: rows.map(({ _count, ...user }) => ({ ...user, orderCount: _count.orders })),
            total,
            page,
            pageSize,
            counts: { customer: customerCount, admin: adminCount },
        })
    } catch (error) {
        console.error('[api/admin/users]', error);
        return NextResponse.json({ error: '获取用户列表失败' }, { status: 500 });
    }
}
```

**抄的时候注意**：`where.OR` 和 `where.isAdmin` 是同级字段，Prisma 会自己用 AND 拼起来，不需要写成 `AND: [...]`。不要手贱把 `where.OR` 改成 `where.AND.push(...)`。

---

## 3. `apps/admin/src/services/adminApi.ts`（整文件替换）

```ts
import type {
  AdminUserDetail,
  AdminUserListItem,
  AdminUserListResult,
  AdminUserRole,
  Toy,
  ToyInput,
} from "@toy-store/shared";
import { API_BASE_URL } from "@/lib/api-base";
import { authFetch, clearTokens, getRefreshToken, saveTokens } from "@/lib/auth-client";

/** 后台登录成功后的返回结构 */
export interface AdminAuthResponse {
  success: boolean;
  user: {
    id: string;
    username: string;
    email: string;
    isAdmin: boolean;
  };
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
}

async function parseResponse<T>(response: Response, fallbackMessage: string): Promise<T> {
  if (!response.ok) {
    let message = fallbackMessage;
    try {
      const data = await response.json();
      if (data?.error) message = data.error;
    } catch {
      // 忽略非 JSON 响应体
    }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

/** 后台接口客户端：直连纯后端服务，所有请求自动带 access token */
export const adminApi = {
  getToys: async (): Promise<Toy[]> => {
    const res = await authFetch('/api/admin/toys');
    return parseResponse<Toy[]>(res, '获取失败');
  },

  createToy: async (data: ToyInput): Promise<Toy> => {
    const res = await authFetch('/api/admin/toys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return parseResponse<Toy>(res, '创建失败');
  },

  updateToy: async (id: string, data: ToyInput): Promise<Toy> => {
    const res = await authFetch(`/api/admin/toys/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return parseResponse<Toy>(res, '更新失败');
  },

  deleteToy: async (id: string): Promise<void> => {
    const res = await authFetch(`/api/admin/toys/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      let message = '删除失败';
      try {
        const data = await res.json();
        if (data?.error) message = data.error;
      } catch {
        // 忽略非 JSON 响应体
      }
      throw new Error(message);
    }
  },

  login: async (email: string, password: string): Promise<AdminAuthResponse> => {
    const res = await authFetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await parseResponse<AdminAuthResponse>(res, '登录失败');
    // token 落本地，后续请求由 authFetch 自动带上
    saveTokens(data);
    return data;
  },

  getUsers: async (params: {
    page?: number;
    pageSize?: number;
    keyword?: string;
    status?: 'all' | 'active' | 'banned';
    role?: AdminUserRole;
  } = {}): Promise<AdminUserListResult> => {
    const qs = new URLSearchParams()
    if (params.page) qs.set('page', String(params.page));
    if (params.pageSize) qs.set('pageSize', String(params.pageSize));
    if (params.keyword) qs.set('keyword', params.keyword);
    if (params.status && params.status !== 'all') qs.set('status', params.status);
    if (params.role) qs.set('role', params.role);

    const res = await authFetch(`/api/admin/users?${qs.toString()}`);
    return parseResponse<AdminUserListResult>(res, '获取用户列表失败');
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

  /** 退出登录：吊销服务端 refresh token + 清本地 */
  logout: async (): Promise<void> => {
    const refreshToken = getRefreshToken();
    try {
      await fetch(`${API_BASE_URL}/api/auth/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
    } catch {
      // 网络失败也照样清本地
    }
    clearTokens();
  },
};
```

**抄的时候注意**：`PaginatedResult` 已经从 import 里删掉了（不再直接用到），留着会报 `未使用`。

---

## 4. `apps/admin/src/app/admin/users/page.tsx`（整文件替换）

```tsx
'use client'

import React, { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { adminApi } from '@/services/adminApi'
import { getAccessToken } from '@/lib/auth-client'
import type {
  AdminUserDetail,
  AdminUserListItem,
  AdminUserListResult,
  AdminUserRole,
} from '@toy-store/shared'
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

/** 顶部标签栏：客户 / 后台管理员 */
const ROLE_TABS: { key: AdminUserRole; label: string; icon: typeof Users }[] = [
  { key: 'customer', label: '客户', icon: Users },
  { key: 'admin', label: '后台管理员', icon: ShieldCheck },
]

export default function AdminUsersPage() {
  const router = useRouter()
  const [authorized, setAuthorized] = useState(false)

  const [role, setRole] = useState<AdminUserRole>('customer')
  const [searchInput, setSearchInput] = useState('')
  const [keyword, setKeyword] = useState('')
  const [status, setStatus] = useState<'all' | 'active' | 'banned'>('all')
  const [page, setPage] = useState(1)

  const [data, setData] = useState<AdminUserListResult | null>(null)
  // 标签栏角标用的两类账号总数，跟列表分开存，切标签时不会闪成 0
  const [counts, setCounts] = useState<Record<AdminUserRole, number>>({ customer: 0, admin: 0 })
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

    setLoading(true)
    setError('')

    try {
      const res = await adminApi.getUsers({ page, pageSize: PAGE_SIZE, keyword, status, role })
      setData(res)
      setCounts(res.counts)
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
  }, [page, keyword, status, role, router])

  useEffect(() => {
    // 首屏 / 翻页 / 筛选变化时重新拉取，进入 loading 态需要同步 setState
    // eslint-disable-next-line react-hooks/set-state-in-effect
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

  /** 切标签页：回到第一页，搜索词和状态筛选保留（按标签页各自生效） */
  const handleSwitchRole = (next: AdminUserRole) => {
    if (next === role) return
    setRole(next)
    setPage(1)
  }

  if (!authorized) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center font-bold text-pink-600">
        正在进行安全校验...
      </div>
    )
  }

  const isAdminTab = role === 'admin'
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1

  return (
    <div className="max-w-7xl mx-auto px-4 py-10">
      {/* 顶部标签栏：客户 / 后台管理员 */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="inline-flex items-center gap-1 p-1.5 rounded-2xl bg-white border border-pink-100 shadow-sm">
          {ROLE_TABS.map((tab) => {
            const active = role === tab.key
            const Icon = tab.icon
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => handleSwitchRole(tab.key)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition ${
                  active
                    ? 'bg-gradient-to-r from-pink-500 to-amber-500 text-white shadow'
                    : 'text-gray-500 hover:bg-pink-50 hover:text-pink-600'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
                <span
                  className={`px-1.5 py-0.5 rounded-md text-[10px] font-black leading-none ${
                    active ? 'bg-white/25 text-white' : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  {counts[tab.key]}
                </span>
              </button>
            )
          })}
        </div>

        <p className="text-xs text-gray-400">
          {isAdminTab
            ? '可登录管理后台的账号，管理员账号不可封禁'
            : '商城的注册用户，封禁后立刻踢下线且无法再登录'}
        </p>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-pink-100 text-pink-700 text-xs font-bold mb-2">
            {isAdminTab ? <ShieldCheck className="w-3.5 h-3.5" /> : <Users className="w-3.5 h-3.5" />}
            {isAdminTab ? '权限管理' : '会员管理'}
          </div>
          <h1 className="text-3xl font-black text-gray-900">
            {isAdminTab ? '管理员列表' : '用户列表'}
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            共 {data?.total ?? 0} {isAdminTab ? '位管理员' : '位用户'}，
            {isAdminTab ? '管理员账号不可封禁' : '封禁后该用户会立刻退出登录且无法再登录'}
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
          <div className="text-center py-20 text-gray-400">
            {isAdminTab ? '没有匹配的管理员' : '没有匹配的用户'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-pink-50/50 border-b border-pink-100 text-xs font-bold text-gray-600 uppercase">
                  <th className="p-4">用户</th>
                  <th className="p-4">注册时间</th>
                  {!isAdminTab && <th className="p-4">订单数</th>}
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
                    {!isAdminTab && <td className="p-4 text-gray-600">{user.orderCount}</td>}
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
                      {/* 管理员标签页不出现封禁入口：管理员账号一律不可封禁 */}
                      {!isAdminTab && (
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
                      )}
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

---

## 5. 抄完自测

```bash
# 1. 类型检查（两个都要过）
cd apps/api && npx tsc --noEmit -p tsconfig.json
cd ../admin && npx tsc --noEmit -p tsconfig.json

# 2. 起服务
pnpm dev
```

打开 `http://localhost:3001/admin/users`，逐条对：

| # | 验证点 | 期望 |
| --- | --- | --- |
| 1 | 页面顶部 | 出现「客户 / 后台管理员」两个标签，各带一个数字角标，客户为选中态（粉橙渐变） |
| 2 | 点「后台管理员」 | 列表只剩 `isAdmin = true` 的账号，页码回到 1，**没有「封禁」按钮**，**没有「订单数」列** |
| 3 | 切回「客户」 | 列表只剩普通用户，封禁按钮和订单数列都回来 |
| 4 | 在客户标签搜关键字 | 结果被过滤，但**两个标签的角标数字不变**（counts 是全量） |
| 5 | 客户标签翻到第 2 页后切管理员 | 页码归 1，不会空列表 |
| 6 | 详情弹窗 | 管理员账号的封禁按钮显示「管理员账号不可封禁」且为禁用态 |

顺手验一下接口：

```bash
# role 不传 → 默认客户
curl -H "Authorization: Bearer <accessToken>" "http://localhost:4000/api/admin/users"
# role=admin → 只有管理员
curl -H "Authorization: Bearer <accessToken>" "http://localhost:4000/api/admin/users?role=admin"
# role=all → 混合，total 应等于 customer + admin
curl -H "Authorization: Bearer <accessToken>" "http://localhost:4000/api/admin/users?role=all"
```

---

## 6. 四个容易抄错的点

| # | 坑 | 后果 |
| --- | --- | --- |
| 1 | `counts` 的两次 `count` 也套上 `where`（带 keyword/status） | 搜索时另一个标签的角标变 0，看起来像数据被删了。必须用 `{ isAdmin: false }` / `{ isAdmin: true }` 裸条件 |
| 2 | 切标签只 `setRole` 没 `setPage(1)` | 从第 3 页切到只有 1 页数据的标签 → 空列表，还以为没数据 |
| 3 | 只隐藏表头 `<th>订单数</th>`，忘了数据行的 `<td>` | 表头 4 列、数据 5 列，整行错位 |
| 4 | 把 `counts` 存进 `data` 里（`data.counts`）再读 | 切标签瞬间 `data` 还是旧值 / `null`，角标会闪一下 0。所以单独用 `counts` state 存 |

---

## 7. 想再加一个角色怎么办

如果以后要区分「运营」和「超管」，不要在这套 `isAdmin` 上打补丁，改成枚举字段：

```prisma
enum Role { CUSTOMER OPERATOR SUPER_ADMIN }
model User { role Role @default(CUSTOMER) }
```

然后 `ROLE_TABS` 加一项、后端 `where.role` 换一下即可——标签栏本身是数据驱动的（`ROLE_TABS.map`），不用动布局代码。
