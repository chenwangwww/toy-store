# 后台订单管理：按用户邮箱筛选 + 编辑订单状态

> 承接 `docs/admin-user-management.md`、`docs/admin-user-role-tabs.md`。
> 本篇做两件事：后台新增一个「订单管理」页面，**能按用户邮箱筛出某个人的订单**，并且**能直接改订单状态**。

## 抄之前先看：这次动 7 个文件（4 新建 / 3 修改）

| # | 文件 | 动作 | 说明 |
| --- | --- | --- | --- |
| 1 | `packages/shared/src/index.ts` | 末尾**追加**三个类型 | `AdminOrderItem`、`AdminOrderListItem`、`AdminOrderListResult` |
| 2 | `apps/api/src/lib/order-status.ts` | **新建** | 订单状态白名单 + 校验函数 |
| 3 | `apps/api/src/app/api/admin/orders/route.ts` | **新建** | `GET` 订单列表（邮箱 / 状态筛选 + 分页） |
| 4 | `apps/api/src/app/api/admin/orders/[id]/route.ts` | **新建** | `PATCH` 改订单状态（含库存回滚） |
| 5 | `apps/admin/src/services/adminApi.ts` | **整文件替换** | 加 `getOrders`、`updateOrderStatus` |
| 6 | `apps/admin/src/components/AdminHeader.tsx` | **整文件替换** | 导航栏加「订单管理」 |
| 7 | `apps/admin/src/app/admin/orders/page.tsx` | **新建** | 订单管理页面 |

**数据库不用动。** `Order.status` 早就是 `String` 字段（默认 `"PAID"`），这次只是把它当成可编辑字段用起来，不需要 `prisma migrate`。

---

## 0. 设计说明（先看这段，不然抄完不知道为什么这么写）

### 0.1 邮箱筛选用模糊匹配，不是精确匹配

`GET /api/admin/orders?email=xxx` 走的是 `contains`：

```ts
where.user = { email: { contains: email } }
```

理由：后台最常见的操作是「记得这人邮箱里有 `chenwang`，但记不住完整地址」。精确匹配的话差一个字符就查不到。

SQLite 的 `LIKE` 对 ASCII 本身不区分大小写，所以输 `@SINA.COM` 也能命中 `@sina.com`，不用额外做 `mode: 'insensitive'`（Prisma 在 SQLite 上也不支持这个参数）。

### 0.2 状态角标只受邮箱影响，不受状态筛选影响

页面顶部有 6 个状态按钮（全部 / 待支付 / 已支付 / 已发货 / 已完成 / 已取消），每个后面带数字。这个数字的统计口径是：

| 筛选条件 | 是否影响角标数字 |
| --- | --- |
| 邮箱 | ✅ 影响（只统计这个人的订单） |
| 状态 | ❌ 不影响 |

如果状态也参与统计，点了「已支付」之后其他 5 个角标会全变成 0，看着像数据丢了。所以后端用**两份 where**：

```ts
const scopeWhere = {}            // 只含邮箱条件 → 给 groupBy 统计用
const where = { ...scopeWhere }  // 邮箱 + 状态 → 给列表查询用
```

### 0.3 改状态会连带改库存，只有「已取消」这一个方向特殊

下单时 `POST /api/orders` 会 `stock -= quantity`、`sales += quantity`。所以后台改状态时：

| 状态变化 | 库存 / 销量 |
| --- | --- |
| 普通状态之间互改（如 已支付 → 已发货） | 不动 |
| **改成「已取消」** | `stock += quantity`、`sales -= quantity`（货退回来了） |
| **从「已取消」改回其他状态** | `stock -= quantity`、`sales += quantity`（重新占用），**且先检查库存够不够** |

第三种情况必须检查库存：订单取消后那批货可能已经被别人买走了，直接扣会扣成负数。库存不够时返回 `409`，提示「「xxx」库存不足（剩 N 件），无法恢复该订单」。

另外，`order.status === 新状态` 时直接返回成功、**不碰库存**——否则重复点两次「已取消」，库存会被还两次。

### 0.4 状态编辑用原生 `<select>` + `confirm`，不用弹窗

行内 `<select>` 改状态最快，管理员不用点开弹窗再关掉。但原生 select 有个坑：

> 用户选了新值、弹 `confirm` 点了取消，此时 React 的 `value` prop 没变（还是旧状态），React 认为 DOM 不需要更新，**select 会停在用户刚选的新值上**，看起来像改成功了。

所以取消或失败时要手动还原：`select.value = order.status`。这一句不能漏，文档第 7 节有完整写法。

### 0.5 接口一览

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/admin/orders?email=&status=&page=&pageSize=` | 订单列表，返回 `items / total / page / pageSize / counts` |
| `PATCH` | `/api/admin/orders/{id}` | 请求体 `{ "status": "SHIPPED" }`，返回更新后的订单 |

`status` 取值：`PENDING` `PAID` `SHIPPED` `COMPLETED` `CANCELLED`，列表接口额外接受 `all`。

---

## 1. `packages/shared/src/index.ts`

在文件**末尾追加**下面三段（`AdminUserListResult` 之后）：

```ts
/** 后台订单列表里的商品行：只带展示需要的字段，不返回完整 Toy */
export interface AdminOrderItem {
  id: string;
  toyId: string;
  quantity: number;
  price: number;
  toy: {
    id: string;
    name: string;
    image: string;
  };
}

/** 后台订单列表项 */
export interface AdminOrderListItem {
  id: string;
  userId: string;
  totalAmount: number;
  status: OrderStatus;
  createdAt: string;
  /** 商品总件数（所有明细 quantity 之和），列表里显示「共 N 件」 */
  itemCount: number;
  /** 下单用户：邮箱筛选和列表展示都要用 */
  user: {
    id: string;
    username: string;
    email: string;
  };
  items: AdminOrderItem[];
}

/** 后台订单列表返回：counts 是各状态的订单数，给状态筛选按钮的角标用 */
export interface AdminOrderListResult extends PaginatedResult<AdminOrderListItem> {
  counts: Record<OrderStatus | 'all', number>;
}
```

> `OrderStatus` 和 `PaginatedResult` 在上面已经定义过了，`interface` 会提升，顺序不影响。

---

## 2. `apps/api/src/lib/order-status.ts`（新建）

```ts
/**
 * 订单状态白名单。
 *
 * 为什么不从 @toy-store/shared 引：shared 包约定"只放类型，不放运行时代码"，
 * 而 api 侧又没装这个 workspace 依赖，所以这里单独维护一份常量。
 * 改状态枚举时，这个数组和 shared 里的 OrderStatus 要一起改。
 */
export const ORDER_STATUSES = ['PENDING', 'PAID', 'SHIPPED', 'COMPLETED', 'CANCELLED'] as const;

export type OrderStatusValue = (typeof ORDER_STATUSES)[number];

/**
 * 校验请求体里的状态值。
 * Order.status 在 Prisma 里是 String 不是 enum，数据库不会帮我们拦非法值，
 * 所以必须在应用层做白名单校验，不能直接把 body.status 写进库。
 */
export function isOrderStatus(value: unknown): value is OrderStatusValue {
  return typeof value === 'string' && (ORDER_STATUSES as readonly string[]).includes(value);
}
```

---

## 3. `apps/api/src/app/api/admin/orders/route.ts`（新建）

```ts
import { NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';
import { ORDER_STATUSES, isOrderStatus } from '@/lib/order-status';

export async function GET(request: Request) {
    const auth = await requireAdmin(request);
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, Number(searchParams.get('page')) || 1);
    const pageSize = Math.min(50, Math.max(1, Number(searchParams.get('pageSize')) || 10));

    const email = (searchParams.get('email') ?? '').trim();
    const statusParam = searchParams.get('status') ?? 'all';
    const status = isOrderStatus(statusParam) ? statusParam : 'all';

    // 只含邮箱条件的 where：专门给状态角标做统计。
    // 状态筛选不能进这里，否则点「已支付」后其他角标全变 0。
    const scopeWhere: Prisma.OrderWhereInput = {};
    if (email) {
        // 模糊匹配：管理员通常记不住完整邮箱
        scopeWhere.user = { email: { contains: email } };
    }

    // 列表查询用的 where：邮箱 + 状态
    const where: Prisma.OrderWhereInput = { ...scopeWhere };
    if (status !== 'all') where.status = status;

    try {
        const [total, rows, grouped] = await Promise.all([
            prisma.order.count({ where }),
            prisma.order.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * pageSize,
                take: pageSize,
                include: {
                    user: { select: { id: true, username: true, email: true } },
                    items: {
                        include: {
                            toy: { select: { id: true, name: true, image: true } },
                        },
                    },
                },
            }),
            prisma.order.groupBy({
                by: ['status'],
                where: scopeWhere,
                _count: { _all: true },
            }),
        ]);

        // 先把 5 个状态都填 0：某个状态一单都没有时，角标不能是 undefined
        const counts: Record<string, number> = {};
        ORDER_STATUSES.forEach((value) => {
            counts[value] = 0;
        });

        let allCount = 0;
        grouped.forEach((row) => {
            counts[row.status] = row._count._all;
            allCount += row._count._all;
        });
        counts.all = allCount;

        return NextResponse.json({
            items: rows.map((order) => ({
                id: order.id,
                userId: order.userId,
                totalAmount: order.totalAmount,
                status: order.status,
                createdAt: order.createdAt,
                itemCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
                user: order.user,
                items: order.items.map((item) => ({
                    id: item.id,
                    toyId: item.toyId,
                    quantity: item.quantity,
                    price: item.price,
                    toy: item.toy,
                })),
            })),
            total,
            page,
            pageSize,
            counts,
        });
    } catch (error) {
        console.error('[api/admin/orders]', error);
        return NextResponse.json({ error: '获取订单列表失败' }, { status: 500 });
    }
}
```

---

## 4. `apps/api/src/app/api/admin/orders/[id]/route.ts`（新建）

> 注意路径里是 `orders/[id]/route.ts`，和 `admin/users/[id]/route.ts` 平级。

```ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';
import { isOrderStatus } from '@/lib/order-status';

/** 带 HTTP 状态码的业务异常，让事务里能直接中断并给出可读提示 */
class OrderError extends Error {
    constructor(
        message: string,
        readonly status: number,
    ) {
        super(message);
        this.name = 'OrderError';
    }
}

export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> },
) {
    const auth = await requireAdmin(request);
    if (!auth.ok) return auth.response;

    // Next 16 的 params 是 Promise，必须 await
    const { id } = await params;

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: '请求体不是合法 JSON' }, { status: 400 });
    }

    const status = (body as { status?: unknown } | null)?.status;
    if (!isOrderStatus(status)) {
        return NextResponse.json({ error: '订单状态不合法' }, { status: 400 });
    }

    try {
        const updated = await prisma.$transaction(async (tx) => {
            const order = await tx.order.findUnique({
                where: { id },
                include: { items: true },
            });

            if (!order) throw new OrderError('订单不存在', 404);

            // 状态没变就直接返回，绝不能再动一次库存
            if (order.status === status) {
                return tx.order.findUnique({
                    where: { id },
                    include: {
                        user: { select: { id: true, username: true, email: true } },
                        items: { include: { toy: { select: { id: true, name: true, image: true } } } },
                    },
                });
            }

            const wasCancelled = order.status === 'CANCELLED';
            const willCancel = status === 'CANCELLED';

            if (!wasCancelled && willCancel) {
                // 改成「已取消」：货退回来了，库存加回去、销量减回去
                for (const item of order.items) {
                    await tx.toy.update({
                        where: { id: item.toyId },
                        data: {
                            stock: { increment: item.quantity },
                            sales: { decrement: item.quantity },
                        },
                    });
                }
            } else if (wasCancelled && !willCancel) {
                // 从「已取消」改回其他状态：重新占用库存。
                // 先整体检查够不够，不够就整单拒绝，避免扣到一半失败留下脏数据
                for (const item of order.items) {
                    const toy = await tx.toy.findUnique({
                        where: { id: item.toyId },
                        select: { stock: true, name: true },
                    });
                    if (!toy) throw new OrderError('订单中的商品已被删除，无法恢复该订单', 409);
                    if (toy.stock < item.quantity) {
                        throw new OrderError(
                            `「${toy.name}」库存不足（剩 ${toy.stock} 件），无法恢复该订单`,
                            409,
                        );
                    }
                }

                for (const item of order.items) {
                    await tx.toy.update({
                        where: { id: item.toyId },
                        data: {
                            stock: { decrement: item.quantity },
                            sales: { increment: item.quantity },
                        },
                    });
                }
            }

            return tx.order.update({
                where: { id },
                data: { status },
                include: {
                    user: { select: { id: true, username: true, email: true } },
                    items: { include: { toy: { select: { id: true, name: true, image: true } } } },
                },
            });
        });

        if (!updated) throw new OrderError('订单不存在', 404);

        return NextResponse.json({
            id: updated.id,
            userId: updated.userId,
            totalAmount: updated.totalAmount,
            status: updated.status,
            createdAt: updated.createdAt,
            itemCount: updated.items.reduce((sum, item) => sum + item.quantity, 0),
            user: updated.user,
            items: updated.items.map((item) => ({
                id: item.id,
                toyId: item.toyId,
                quantity: item.quantity,
                price: item.price,
                toy: item.toy,
            })),
        });
    } catch (error) {
        if (error instanceof OrderError) {
            return NextResponse.json({ error: error.message }, { status: error.status });
        }
        console.error('[api/admin/orders/:id]', error);
        return NextResponse.json({ error: '更新订单状态失败' }, { status: 500 });
    }
}
```

---

## 5. `apps/admin/src/services/adminApi.ts`（整文件替换）

```ts
import type {
  AdminOrderListItem,
  AdminOrderListResult,
  AdminUserDetail,
  AdminUserListItem,
  AdminUserListResult,
  AdminUserRole,
  OrderStatus,
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

  /** 订单列表：email 走模糊匹配，status 传 'all' 表示不筛选 */
  getOrders: async (params: {
    page?: number;
    pageSize?: number;
    email?: string;
    status?: OrderStatus | 'all';
  } = {}): Promise<AdminOrderListResult> => {
    const qs = new URLSearchParams()
    if (params.page) qs.set('page', String(params.page));
    if (params.pageSize) qs.set('pageSize', String(params.pageSize));
    if (params.email) qs.set('email', params.email);
    if (params.status && params.status !== 'all') qs.set('status', params.status);

    const res = await authFetch(`/api/admin/orders?${qs.toString()}`);
    return parseResponse<AdminOrderListResult>(res, '获取订单列表失败');
  },

  /** 改订单状态：改成 CANCELLED / 从 CANCELLED 改回都会连带调整库存 */
  updateOrderStatus: async (id: string, status: OrderStatus): Promise<AdminOrderListItem> => {
    const res = await authFetch(`/api/admin/orders/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    return parseResponse<AdminOrderListItem>(res, '更新订单状态失败');
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

---

## 6. `apps/admin/src/components/AdminHeader.tsx`（整文件替换）

只加了 `Receipt` 图标和一个导航项，其余没动：

```tsx
"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Package, Receipt, ShieldCheck, Users } from "lucide-react";
import { adminApi } from "@/services/adminApi";

type AdminUser = { id?: string; username?: string; email?: string };

export default function AdminHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<AdminUser | null>(null);

  // 登录页不显示顶栏
  const isLoginPage = pathname?.startsWith("/admin/login");

  useEffect(() => {
    if (isLoginPage) return;
    const raw = sessionStorage.getItem("admin_user");
    if (!raw) return;
    try {
      // sessionStorage 只能在挂载后读取，这里同步回填一次展示用的用户名
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setUser(JSON.parse(raw));
    } catch {
      sessionStorage.removeItem("admin_user");
    }
  }, [isLoginPage, pathname]);

  if (isLoginPage) return null;

  const handleLogout = async () => {
    // 先让服务端吊销 refresh token，再清本地状态
    await adminApi.logout();
    sessionStorage.removeItem("admin_user");
    setUser(null);
    router.replace("/admin/login");
  };

  return (
    <header className="sticky top-0 z-40 bg-slate-900 text-white shadow">
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
              className={`px-3 py-1.5 rounded-lg transition ${pathname?.startsWith('/admin/toys')
                  ? 'bg-white/10 text-white'
                  : 'text-slate-400 hover:text-white'
                }`}
            >
              商品管理
            </Link>
            <Link
              href="/admin/orders"
              className={`px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 ${pathname?.startsWith('/admin/orders')
                  ? 'bg-white/10 text-white'
                  : 'text-slate-400 hover:text-white'
                }`}
            >
              <Receipt className="w-4 h-4" /> 订单管理
            </Link>
            <Link
              href="/admin/users"
              className={`px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 ${pathname?.startsWith('/admin/users')
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
    </header>
  );
}
```

---

## 7. `apps/admin/src/app/admin/orders/page.tsx`（新建）

```tsx
'use client'

import React, { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { adminApi } from '@/services/adminApi'
import { getAccessToken } from '@/lib/auth-client'
import type {
  AdminOrderListItem,
  AdminOrderListResult,
  OrderStatus,
} from '@toy-store/shared'
import {
  Search,
  ChevronLeft,
  ChevronRight,
  Receipt,
  Mail,
} from 'lucide-react'

const PAGE_SIZE = 10

const STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING: '待支付',
  PAID: '已支付',
  SHIPPED: '已发货',
  COMPLETED: '已完成',
  CANCELLED: '已取消',
}

/** 下拉框和状态角标共用一套配色 */
const STATUS_STYLE: Record<OrderStatus, string> = {
  PENDING: 'bg-amber-50 text-amber-700 border-amber-200',
  PAID: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  SHIPPED: 'bg-sky-50 text-sky-700 border-sky-200',
  COMPLETED: 'bg-gray-50 text-gray-600 border-gray-200',
  CANCELLED: 'bg-red-50 text-red-600 border-red-200',
}

const STATUS_TABS: { key: OrderStatus | 'all'; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'PENDING', label: '待支付' },
  { key: 'PAID', label: '已支付' },
  { key: 'SHIPPED', label: '已发货' },
  { key: 'COMPLETED', label: '已完成' },
  { key: 'CANCELLED', label: '已取消' },
]

const STATUS_OPTIONS: OrderStatus[] = ['PENDING', 'PAID', 'SHIPPED', 'COMPLETED', 'CANCELLED']

/** 列表里只显示前一个商品名，剩下的用"等 N 种"带过 */
function itemSummary(order: AdminOrderListItem) {
  const names = order.items.map((item) => item.toy.name)
  if (names.length === 0) return '—'
  return names.length === 1 ? names[0] : `${names[0]} 等 ${names.length} 种`
}

export default function AdminOrdersPage() {
  const router = useRouter()
  const [authorized, setAuthorized] = useState(false)

  const [emailInput, setEmailInput] = useState('')
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<OrderStatus | 'all'>('all')
  const [page, setPage] = useState(1)

  const [data, setData] = useState<AdminOrderListResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  // 权限校验：与 toys / users 页同一套
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

  const fetchOrders = useCallback(async () => {
    if (!getAccessToken()) {
      router.replace('/admin/login')
      return
    }

    setLoading(true)
    setError('')

    try {
      const res = await adminApi.getOrders({ page, pageSize: PAGE_SIZE, email, status })
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
  }, [page, email, status, router])

  useEffect(() => {
    // 首屏 / 翻页 / 筛选变化时重新拉取，进入 loading 态需要同步 setState
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchOrders()
  }, [fetchOrders])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setPage(1)
    setEmail(emailInput.trim())
  }

  /** 切换状态筛选：页码必须归 1，否则从第 3 页切过去可能直接空列表 */
  const handleSwitchStatus = (next: OrderStatus | 'all') => {
    if (next === status) return
    setStatus(next)
    setPage(1)
  }

  const handleStatusChange = async (
    e: React.ChangeEvent<HTMLSelectElement>,
    order: AdminOrderListItem,
  ) => {
    // 先把元素抓在手里：await 之后 React 会把 currentTarget 置空
    const select = e.currentTarget
    const next = select.value as OrderStatus
    if (next === order.status) return

    const tip =
      next === 'CANCELLED'
        ? '\n取消后该订单的商品库存和销量会一并还原。'
        : order.status === 'CANCELLED'
          ? '\n该订单之前已取消，恢复状态会重新扣减库存、增加销量。'
          : ''

    if (!confirm(`把订单 ${order.id.slice(0, 8)} 的状态改为「${STATUS_LABEL[next]}」吗？${tip}`)) {
      // 原生 select 不受控：value prop 没变，React 不会重置 DOM，得手动还原
      select.value = order.status
      return
    }

    setUpdatingId(order.id)
    setError('')

    try {
      await adminApi.updateOrderStatus(order.id, next)
      await fetchOrders()
    } catch (err) {
      // 失败同样要还原，不然下拉框会显示一个数据库里并不存在的状态
      select.value = order.status
      setError(err instanceof Error ? err.message : '更新订单状态失败')
    } finally {
      setUpdatingId(null)
    }
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
      {/* 状态筛选：角标数字受邮箱影响，不受当前状态影响 */}
      <div className="flex flex-wrap items-center gap-2 mb-6">
        {STATUS_TABS.map((tab) => {
          const active = status === tab.key
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => handleSwitchStatus(tab.key)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-bold transition border ${
                active
                  ? 'bg-gradient-to-r from-pink-500 to-amber-500 text-white border-transparent shadow'
                  : 'bg-white text-gray-500 border-pink-100 hover:bg-pink-50 hover:text-pink-600'
              }`}
            >
              {tab.label}
              <span
                className={`px-1.5 py-0.5 rounded-md text-[10px] font-black leading-none ${
                  active ? 'bg-white/25 text-white' : 'bg-gray-100 text-gray-500'
                }`}
              >
                {data?.counts[tab.key] ?? 0}
              </span>
            </button>
          )
        })}
      </div>

      <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-pink-100 text-pink-700 text-xs font-bold mb-2">
            <Receipt className="w-3.5 h-3.5" /> 交易管理
          </div>
          <h1 className="text-3xl font-black text-gray-900">订单列表</h1>
          <p className="text-sm text-gray-400 mt-1">
            共 {data?.total ?? 0} 笔订单
            {email ? `（邮箱包含「${email}」）` : ''}
            ，改状态会同步调整商品库存
          </p>
        </div>

        <form onSubmit={handleSearch} className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              placeholder="按用户邮箱筛选，如 chenwang"
              className="w-72 pl-9 pr-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-pink-500 text-gray-800"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-pink-500 to-amber-500 text-white text-sm font-bold shadow hover:opacity-95 transition"
          >
            搜索
          </button>
          {(email || status !== 'all') && (
            <button
              type="button"
              onClick={() => {
                setEmailInput('')
                setEmail('')
                setStatus('all')
                setPage(1)
              }}
              className="px-3 py-2.5 rounded-xl border border-gray-200 bg-white text-gray-500 text-sm hover:bg-gray-50 transition"
            >
              重置
            </button>
          )}
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
            {email ? `没有找到邮箱包含「${email}」的订单` : '暂无订单'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-pink-50/50 border-b border-pink-100 text-xs font-bold text-gray-600 uppercase">
                  <th className="p-4">订单</th>
                  <th className="p-4">用户</th>
                  <th className="p-4">商品</th>
                  <th className="p-4">金额</th>
                  <th className="p-4">状态</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm">
                {data.items.map((order) => (
                  <tr key={order.id} className="hover:bg-pink-50/20 transition">
                    <td className="p-4">
                      <div className="font-mono text-xs font-bold text-gray-700">
                        {order.id.slice(0, 8)}
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        {new Date(order.createdAt).toLocaleString()}
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="font-bold text-gray-800">{order.user.username}</div>
                      <div className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                        <Mail className="w-3 h-3" />
                        {order.user.email}
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="text-gray-700 max-w-[220px] truncate">
                        {itemSummary(order)}
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5">共 {order.itemCount} 件</div>
                    </td>
                    <td className="p-4 font-black text-gray-900">¥{order.totalAmount}</td>
                    <td className="p-4">
                      <select
                        value={order.status}
                        disabled={updatingId === order.id}
                        onChange={(e) => handleStatusChange(e, order)}
                        className={`text-xs font-bold px-2.5 py-1.5 rounded-full border cursor-pointer transition disabled:opacity-50 disabled:cursor-wait ${STATUS_STYLE[order.status]}`}
                      >
                        {STATUS_OPTIONS.map((value) => (
                          <option key={value} value={value}>
                            {STATUS_LABEL[value]}
                          </option>
                        ))}
                      </select>
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
    </div>
  )
}
```

---

## 8. 六个容易抄错的点

| # | 关键点 | 漏了会怎样 |
| --- | --- | --- |
| 1 | `params` 是 `Promise`，要 `await params`（第 4 节） | 拿到的是 `Promise` 对象，`prisma.order.findUnique({ where: { id } })` 直接报类型错误或查不到 |
| 2 | 改状态前先判断 `order.status === status`，相同就直接返回 | 连点两次「已取消」，库存被还两次，商品越卖越多 |
| 3 | 从「已取消」改回来要先查库存（第 4 节第二个分支） | 那批货早被别人买走了，直接扣会扣成负库存 |
| 4 | 状态角标的 `groupBy` 只用 `scopeWhere`，不带 status | 点「已支付」后其他角标全变 0，看着像数据丢了 |
| 5 | `counts` 先把 5 个状态都初始化成 0 | 某个状态一单都没有时，角标显示 `undefined` |
| 6 | 原生 `<select>` 取消/失败后要 `select.value = order.status` | 下拉框停在用户刚选的值上，看着像改成功了，其实没改 |

另外两个小地方：

- **表头 5 列，`<td>` 也必须是 5 个**。少一个整行错位，多一个会被挤到下一行。
- `apps/api/src/lib/order-status.ts` 里的状态数组要和 `packages/shared/src/index.ts` 里的 `OrderStatus` 保持一致。以后加状态（比如「退款中」）两边都要改，只改一边会出现「接口能存、前端类型报错」。

---

## 9. 抄完怎么自测

### 9.1 接口（先确认服务在跑）

```bash
# 1. 管理员登录，拿 token
curl -s -X POST http://localhost:4000/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@toyland.com","password":"admin_secure_password_123"}'
```

把返回的 `accessToken` 填进下面：

```bash
TOKEN=粘贴你的accessToken

# 2. 不带筛选，看列表和 counts
curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:4000/api/admin/orders"

# 3. 按邮箱筛选（模糊，只输一部分就行）
curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:4000/api/admin/orders?email=chenwang"

# 4. 邮箱 + 状态
curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:4000/api/admin/orders?email=customer&status=PAID"

# 5. 改状态（把 ORDER_ID 换成列表里真实的 id）
curl -s -X PATCH -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"SHIPPED"}' \
  "http://localhost:4000/api/admin/orders/ORDER_ID"

# 6. 非法状态应该 400
curl -s -X PATCH -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"WHATEVER"}' \
  "http://localhost:4000/api/admin/orders/ORDER_ID"

# 7. 不带 token 应该 401
curl -s "http://localhost:4000/api/admin/orders"
```

### 9.2 页面

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 打开 `http://localhost:3001/admin/orders` | 顶部导航出现「订单管理」，列表按时间倒序 |
| 2 | 输入 `chenwang` 点搜索 | 只剩该邮箱相关订单，顶部角标数字同步变少 |
| 3 | 点「已支付」 | 只显示已支付订单，**其他角标的数字不变** |
| 4 | 把某笔订单改成「已发货」 | 弹确认框，确认后行内状态变蓝 |
| 5 | 改状态时点「取消」 | 下拉框**回到原来的状态**，不发请求 |
| 6 | 把一笔订单改成「已取消」 | 去商品管理看，库存 +N、销量 -N |
| 7 | 再把同一笔从「已取消」改回「已支付」 | 库存 -N、销量 +N；若库存不够，提示「库存不足，无法恢复该订单」 |
| 8 | 搜一个不存在的邮箱 | 显示「没有找到邮箱包含「xxx」的订单」 |
| 9 | 点「重置」 | 邮箱清空、状态回「全部」、页码回 1 |
| 10 | 清掉 localStorage 的 token 再刷新 | 跳回 `/admin/login` |

第 6、7 条是最容易漏测的，**务必去商品管理页核对库存数字**，别只看订单状态变了。

---

## 10. 以后想扩展的话

- **加订单详情弹窗**：接口已经返回了 `items`（含商品名和图片），在行上挂个「详情」按钮，把 `order.items` 铺开就行，不用再请求接口。
- **加发货单号**：`Order` 表加 `trackingNo String?` 字段，`PATCH` 里多接一个可选参数，记得跑 `prisma migrate dev --name add_order_tracking`。
- **批量改状态**：表格左侧加 checkbox，接口换成 `PATCH /api/admin/orders` 接收 `{ ids: string[], status }`，事务里循环调用现在这段逻辑。
- **加状态流转限制**（比如「已完成」不能再改回「待支付」）：在 `[id]/route.ts` 里加一张 `ALLOWED_TRANSITIONS` 映射表，`if (!ALLOWED_TRANSITIONS[order.status].includes(status)) return 400`。现在故意不限制，因为后台初期经常需要手工纠错。
