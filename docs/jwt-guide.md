# JWT 双 Token 接入指南（access + refresh）

> 适用于当前 monorepo：`apps/api`（后端 :4000）、`apps/web`（C 端 :3000）、`apps/admin`（后台 :3001）。  
> 全程只改这 3 个子项目，不改动 `packages/shared` 的领域类型（只新增 token 相关类型）。

## 0. 设计说明（先看这一段，后面代码才好理解）

| 项目   | access token                                  | refresh token                                  |
| ---- | --------------------------------------------- | ---------------------------------------------- |
| 存放位置 | 前端 `localStorage`（key：`toyland_access_token`） | 前端 `localStorage`（key：`toyland_refresh_token`） |
| 有效期  | 15 分钟                                         | 7 天                                            |
| 传递方式 | 请求头 `Authorization: Bearer xxx`               | 只在 `POST /api/auth/refresh` 的 body 里传          |
| 是否入库 | 否，纯无状态                                        | **是**，存 `RefreshToken` 表（可吊销、可轮换）              |
| 失效处理 | 过期返回 401 + `code: "UNAUTHORIZED"`             | 刷新一次即作废，换新的一对（rotation）                        |

为什么 refresh token 要入库：JWT 本身无法吊销，只有把 `jti`（token 唯一 id）落库，才能在「退出登录 / 被踢下线 / token 泄露」时真正让它失效。

刷新流程：

```
前端请求 → 带 accessToken → 后端校验失败(401) → 前端自动调 /api/auth/refresh
       → 拿到新 accessToken + 新 refreshToken → 重放原请求（只重放一次）
       → 刷新也失败 → 清空 token，跳登录
```

> 用 `jose` 而不是 `jsonwebtoken`：`jose` 基于 Web Crypto，Node 运行时和 Edge 运行时（`proxy.ts`）都能跑；`jsonwebtoken` 依赖 Node 的 `crypto`，放进 `proxy.ts` 会直接报错。

---

## 1. 安装依赖

```bash
pnpm --filter @toy-store/api add jose
```

只装在后端。前端不需要解析 JWT，不需要装任何东西。

---

## 2. 配置环境变量

生成两串随机密钥（各跑一次，两次结果要不一样）：

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

新建 `apps/api/.env.local`：

```env
JWT_ACCESS_SECRET=把上面生成的第一串粘这里
JWT_REFRESH_SECRET=把上面生成的第二串粘这里
```

同时把这两行补进 `apps/api/.env.example`（不要写真实值）：

```env
# JWT 密钥：至少 32 位，两个必须不同。生成方式：
# node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
JWT_ACCESS_SECRET=change-me-access-secret-at-least-32-chars
JWT_REFRESH_SECRET=change-me-refresh-secret-at-least-32-chars
```

---

## 3. 数据库：新增 RefreshToken 表

### 3.1 `apps/api/prisma/schema.prisma`

在 `User` 模型里加一行关系字段：

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
  refreshTokens RefreshToken[]   // ← 新增这一行
  createdAt DateTime @default(now())
}
```

在文件末尾追加新模型：

```prisma
// 刷新令牌表：一条记录 = 一个已签发的 refresh token
// id 就是 JWT 里的 jti，退出登录 / 轮换时按 id 作废
model RefreshToken {
  id        String    @id              // = jti（uuid）
  userId    String
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  expiresAt DateTime
  revokedAt DateTime?                  // 非空表示已作废
  createdAt DateTime  @default(now())

  @@index([userId])
}
```

### 3.2 同步数据库

```bash
pnpm db:push
pnpm db:generate
```

---

## 4. 后端新文件

### 4.1 新建 `apps/api/src/lib/jwt.ts`

```ts
import { SignJWT, jwtVerify, type JWTPayload } from 'jose';

/**
 * JWT 签发 / 校验。
 * 用 jose 而不是 jsonwebtoken：jose 基于 Web Crypto，Node 与 Edge 运行时（proxy.ts）都能用。
 */

const ISSUER = 'toyland';
const AUDIENCE = 'toyland-client';

/** access token 有效期：15 分钟（秒） */
export const ACCESS_TOKEN_TTL = 15 * 60;
/** refresh token 有效期：7 天（秒） */
export const REFRESH_TOKEN_TTL = 7 * 24 * 60 * 60;

function getSecret(name: 'JWT_ACCESS_SECRET' | 'JWT_REFRESH_SECRET'): Uint8Array {
  const value = process.env[name];
  if (!value || value.length < 32) {
    throw new Error(`[jwt] 环境变量 ${name} 未配置或长度不足 32 位`);
  }
  return new TextEncoder().encode(value);
}

export type TokenRole = 'user' | 'admin';

export interface AccessTokenPayload extends JWTPayload {
  sub: string;
  email: string;
  role: TokenRole;
  type: 'access';
}

export interface RefreshTokenPayload extends JWTPayload {
  sub: string;
  jti: string;
  type: 'refresh';
}

/** 签发 access token（短命，前端每次请求都带） */
export async function signAccessToken(user: {
  id: string;
  email: string;
  isAdmin: boolean;
}): Promise<string> {
  return new SignJWT({
    email: user.email,
    role: user.isAdmin ? 'admin' : 'user',
    type: 'access',
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TOKEN_TTL}s`)
    .sign(getSecret('JWT_ACCESS_SECRET'));
}

/** 签发 refresh token（长命，只用来换新 token，jti 与数据库记录对应） */
export async function signRefreshToken(userId: string, jti: string): Promise<string> {
  return new SignJWT({ type: 'refresh' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setJti(jti)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${REFRESH_TOKEN_TTL}s`)
    .sign(getSecret('JWT_REFRESH_SECRET'));
}

/** 校验 access token，失败抛异常 */
export async function verifyAccessToken(token: string): Promise<AccessTokenPayload> {
  const { payload } = await jwtVerify<AccessTokenPayload>(
    token,
    getSecret('JWT_ACCESS_SECRET'),
    { issuer: ISSUER, audience: AUDIENCE },
  );
  // 防止拿 refresh token 当 access token 用
  if (payload.type !== 'access') throw new Error('token 类型不匹配');
  return payload;
}

/** 校验 refresh token，失败抛异常 */
export async function verifyRefreshToken(token: string): Promise<RefreshTokenPayload> {
  const { payload } = await jwtVerify<RefreshTokenPayload>(
    token,
    getSecret('JWT_REFRESH_SECRET'),
    { issuer: ISSUER, audience: AUDIENCE },
  );
  if (payload.type !== 'refresh') throw new Error('token 类型不匹配');
  return payload;
}
```

### 4.2 新建 `apps/api/src/lib/user.ts`

把原来写在 `api/auth/route.ts` 里的 `toPublicUser` 抽出来，几个路由都要用：

```ts
import type { User } from '@prisma/client';

/** 对外返回用户信息时一定要去掉密码等敏感字段 */
export function toPublicUser(user: User) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    phone: user.phone,
    avatar: user.avatar,
    isAdmin: user.isAdmin,
    createdAt: user.createdAt,
  };
}
```

### 4.3 新建 `apps/api/src/lib/auth.ts`

```ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  ACCESS_TOKEN_TTL,
  REFRESH_TOKEN_TTL,
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  type AccessTokenPayload,
} from '@/lib/jwt';

export type AuthUser = {
  id: string;
  email: string;
  role: 'user' | 'admin';
};

/** 统一的 401：前端看到 code=UNAUTHORIZED 就去刷新 token */
export function unauthorized(message = '未登录或登录已过期') {
  return NextResponse.json({ error: message, code: 'UNAUTHORIZED' }, { status: 401 });
}

export function forbidden(message = '权限不足') {
  return NextResponse.json({ error: message, code: 'FORBIDDEN' }, { status: 403 });
}

/** 从 Authorization: Bearer xxx 里取出并校验 access token */
export async function getAuthPayload(request: Request): Promise<AccessTokenPayload | null> {
  const header = request.headers.get('authorization') ?? '';
  const [scheme, token] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null;
  try {
    return await verifyAccessToken(token);
  } catch {
    return null;
  }
}

type AuthResult =
  | { ok: true; user: AuthUser }
  | { ok: false; response: NextResponse };

/** 需要登录的接口用这个 */
export async function requireUser(request: Request): Promise<AuthResult> {
  const payload = await getAuthPayload(request);
  if (!payload) return { ok: false, response: unauthorized() };
  return {
    ok: true,
    user: { id: payload.sub, email: payload.email, role: payload.role },
  };
}

/** 需要管理员权限的接口用这个 */
export async function requireAdmin(request: Request): Promise<AuthResult> {
  const result = await requireUser(request);
  if (!result.ok) return result;
  if (result.user.role !== 'admin') {
    return { ok: false, response: forbidden('需要管理员权限') };
  }
  return result;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
}

/** 签发一对 token，并把 refresh token 的 jti 落库 */
export async function issueTokenPair(user: {
  id: string;
  email: string;
  isAdmin: boolean;
}): Promise<TokenPair> {
  const jti = crypto.randomUUID();

  const [accessToken, refreshToken] = await Promise.all([
    signAccessToken(user),
    signRefreshToken(user.id, jti),
  ]);

  await prisma.refreshToken.create({
    data: {
      id: jti,
      userId: user.id,
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL * 1000),
    },
  });

  return { accessToken, refreshToken, tokenType: 'Bearer', expiresIn: ACCESS_TOKEN_TTL };
}
```

---

## 5. 后端路由改造

### 5.1 改 `apps/api/src/app/api/auth/route.ts`（整份替换）

登录 / 注册都返回 `{ user, accessToken, refreshToken, tokenType, expiresIn }`。

```ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { issueTokenPair } from '@/lib/auth';
import { toPublicUser } from '@/lib/user';

export async function POST(request: Request) {
  try {
    const { action, email, password, username } = await request.json();

    if (!email || !password) {
      return NextResponse.json({ error: '邮箱和密码不能为空' }, { status: 400 });
    }

    if (action === 'register') {
      const existingUser = await prisma.user.findUnique({ where: { email } });
      if (existingUser) {
        return NextResponse.json({ error: '邮箱已被注册' }, { status: 400 });
      }

      const newUser = await prisma.user.create({
        data: {
          email,
          password, // 生产环境请使用 bcrypt 加密
          username: username || email.split('@')[0],
          avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${email}`,
          isAdmin: false,
        },
      });

      // 注册即登录：直接发一对 token
      const tokens = await issueTokenPair(newUser);
      return NextResponse.json({ user: toPublicUser(newUser), ...tokens });
    }

    if (action === 'login') {
      const user = await prisma.user.findUnique({ where: { email } });
      if (!user || user.password !== password) {
        return NextResponse.json({ error: '账号或密码错误' }, { status: 401 });
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

    return NextResponse.json({ error: '非法操作' }, { status: 400 });
  } catch (error) {
    console.error('[api/auth]', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
```

### 5.2 新建 `apps/api/src/app/api/auth/refresh/route.ts`

```ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyRefreshToken } from '@/lib/jwt';
import { issueTokenPair } from '@/lib/auth';
import { toPublicUser } from '@/lib/user';

export async function POST(request: Request) {
  try {
    const { refreshToken } = await request.json();

    if (!refreshToken || typeof refreshToken !== 'string') {
      return NextResponse.json(
        { error: '缺少 refreshToken', code: 'UNAUTHORIZED' },
        { status: 401 },
      );
    }

    let payload;
    try {
      payload = await verifyRefreshToken(refreshToken);
    } catch {
      return NextResponse.json(
        { error: 'refreshToken 无效或已过期', code: 'UNAUTHORIZED' },
        { status: 401 },
      );
    }

    // 签名对还不够，必须能在库里查到这条记录，否则说明已注销 / 已轮换 / 伪造
    const stored = await prisma.refreshToken.findUnique({ where: { id: payload.jti } });
    if (
      !stored ||
      stored.userId !== payload.sub ||
      stored.revokedAt !== null ||
      stored.expiresAt <= new Date()
    ) {
      return NextResponse.json(
        { error: '登录状态已失效，请重新登录', code: 'UNAUTHORIZED' },
        { status: 401 },
      );
    }

    const user = await prisma.user.findUnique({ where: { id: stored.userId } });
    if (!user) {
      return NextResponse.json(
        { error: '用户不存在', code: 'UNAUTHORIZED' },
        { status: 401 },
      );
    }

    // 轮换：旧 refresh token 立即作废，换一对新的
    await prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    const tokens = await issueTokenPair(user);
    return NextResponse.json({ user: toPublicUser(user), ...tokens });
  } catch (error) {
    console.error('[api/auth/refresh]', error);
    return NextResponse.json({ error: '刷新登录状态失败' }, { status: 500 });
  }
}
```


### 5.3 新建 `apps/api/src/app/api/auth/logout/route.ts`

```ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyRefreshToken } from '@/lib/jwt';

export async function POST(request: Request) {
  try {
    const { refreshToken } = await request.json().catch(() => ({ refreshToken: null }));

    if (refreshToken && typeof refreshToken === 'string') {
      try {
        const payload = await verifyRefreshToken(refreshToken);
        // deleteMany 而不是 delete：记录可能已经被轮换掉了，不能因此报错
        await prisma.refreshToken.deleteMany({ where: { id: payload.jti } });
      } catch {
        // token 无效也当作退出成功，前端只管清本地状态
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[api/auth/logout]', error);
    return NextResponse.json({ success: true });
  }
}
```

### 5.4 新建 `apps/api/src/app/api/auth/me/route.ts`

前端刷新页面后用它恢复登录态。

```ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { toPublicUser } from '@/lib/user';

export async function GET(request: Request) {
  const auth = await requireUser(request);
  if (!auth.ok) return auth.response;

  const user = await prisma.user.findUnique({ where: { id: auth.user.id } });
  if (!user) {
    return NextResponse.json({ error: '用户不存在', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  return NextResponse.json(toPublicUser(user));
}
```

### 5.5 改 `apps/api/src/app/api/orders/route.ts`（整份替换）

**这是最关键的一步**：`userId` 必须从 token 里取，不能再信前端传的 `userId`，否则任何人改个 id 就能查别人订单。

```ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';

// 查询当前登录用户的订单
export async function GET(request: Request) {
  const auth = await requireUser(request);
  if (!auth.ok) return auth.response;

  try {
    const orders = await prisma.order.findMany({
      where: { userId: auth.user.id },
      include: {
        items: { include: { toy: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(orders);
  } catch {
    return NextResponse.json({ error: '查询订单失败' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireUser(request);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const { items, totalAmount } = body;
    // userId 一律取自 token，绝不信任请求体里的 userId
    const userId = auth.user.id;

    const newOrder = await prisma.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          userId,
          totalAmount,
          status: 'PAID', // 模拟支付成功
          items: {
            create: items.map(
              (item: { toy: { id: string; price: number }; quantity: number }) => ({
                toyId: item.toy.id,
                quantity: item.quantity,
                price: item.toy.price,
              }),
            ),
          },
        },
        include: { items: true },
      });

      for (const item of items) {
        await tx.toy.update({
          where: { id: item.toy.id },
          data: {
            stock: { decrement: item.quantity },
            sales: { increment: item.quantity },
          },
        });
      }

      return order;
    });

    return NextResponse.json(newOrder);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: '下单失败' }, { status: 500 });
  }
}
```

### 5.6 改 `apps/api/src/app/api/admin/login/route.ts`（整份替换）

```ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { issueTokenPair } from '@/lib/auth';
import { toPublicUser } from '@/lib/user';

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json();

    const user = await prisma.user.findUnique({ where: { email } });

    // 校验账号、密码，并且必须是 isAdmin === true
    if (!user || user.password !== password || !user.isAdmin) {
      return NextResponse.json({ error: '权限不足或账号密码错误' }, { status: 403 });
    }

    const tokens = await issueTokenPair(user);

    return NextResponse.json({
      success: true,
      user: toPublicUser(user),
      ...tokens,
    });
  } catch (error) {
    console.error('[api/admin/login]', error);
    return NextResponse.json({ error: '登录服务器异常' }, { status: 500 });
  }
}
```

### 5.7 给后台商品接口加管理员校验

`apps/api/src/app/api/admin/toys/route.ts`：

```ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;

  try {
    const toys = await prisma.toy.findMany({ orderBy: { createdAt: 'desc' } });
    return NextResponse.json(toys);
  } catch {
    return NextResponse.json({ error: '获取玩具列表失败' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const { name, price, originalPrice, category, ageRange, stock, image, description } = body;

    const newToy = await prisma.toy.create({
      data: {
        name,
        price: Number(price),
        originalPrice: originalPrice ? Number(originalPrice) : null,
        category,
        ageRange,
        stock: Number(stock) || 100,
        image,
        description,
      },
    });
    return NextResponse.json(newToy);
  } catch {
    return NextResponse.json({ error: '添加玩具失败' }, { status: 500 });
  }
}
```

`apps/api/src/app/api/admin/toys/[id]/route.ts`：在 `PUT` 和 `DELETE` 开头各加三行，其余不动：

```ts
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin(request);   // ← 新增
  if (!auth.ok) return auth.response;         // ← 新增

  try {
    const { id } = await params;
    // ...下面原样不动
  }
}
```

```ts
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin(request);   // ← 新增
  if (!auth.ok) return auth.response;         // ← 新增

  try {
    // ...原样不动
  }
}
```

并在文件头加 `import { requireAdmin } from '@/lib/auth';`。

> `apps/api/src/proxy.ts` **不用改**：它已经把 `Authorization` 加进了 `Access-Control-Allow-Headers`，跨域带 token 不会触发预检失败。

---

## 6. C 端前端改造（`apps/web`）

### 6.1 新建 `apps/web/src/lib/auth-client.ts`

```ts
import { API_BASE_URL } from '@/lib/api-base';

const ACCESS_TOKEN_KEY = 'toyland_access_token';
const REFRESH_TOKEN_KEY = 'toyland_refresh_token';

export function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function saveTokens(tokens: { accessToken: string; refreshToken: string }) {
  localStorage.setItem(ACCESS_TOKEN_KEY, tokens.accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
}

export function clearTokens() {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

/** 多个请求同时 401 时，只发一次刷新请求（单飞） */
let refreshPromise: Promise<string | null> | null = null;

export function refreshAccessToken(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = doRefresh().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

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
      return null;
    }

    const data = await res.json();
    saveTokens(data);
    return data.accessToken as string;
  } catch {
    return null;
  }
}

/**
 * 需要登录的请求统一走这里：
 * 自动带 Authorization 头，401 时自动刷新一次并重放原请求。
 */
export async function authFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const send = (token: string | null) => {
    const headers: Record<string, string> = {
      ...((init.headers as Record<string, string> | undefined) ?? {}),
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    return fetch(`${API_BASE_URL}${path}`, { ...init, headers });
  };

  const res = await send(getAccessToken());
  if (res.status !== 401) return res;

  const newToken = await refreshAccessToken();
  if (!newToken) return res;
  return send(newToken);
}
```

### 6.2 改 `apps/web/src/services/api.ts`（整份替换）

```ts
import type { AuthPayload, Order, Toy, User } from '@toy-store/shared';
import { API_BASE_URL } from '@/lib/api-base';
import { authFetch, clearTokens, getRefreshToken, saveTokens } from '@/lib/auth-client';

/** 登录 / 注册成功后的返回结构 */
export interface AuthResponse {
  user: User;
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
      // 响应体不是 JSON 时忽略，使用兜底文案
    }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

export const api = {
  // 公开接口：不需要 token
  getToys: async (category?: string): Promise<Toy[]> => {
    const query =
      category && category !== 'all' ? `?category=${encodeURIComponent(category)}` : '';
    const res = await fetch(`${API_BASE_URL}/api/toys${query}`);
    return parseResponse<Toy[]>(res, '获取商品失败');
  },

  getToyById: async (id: string): Promise<Toy> => {
    const res = await fetch(`${API_BASE_URL}/api/toys/${id}`);
    return parseResponse<Toy>(res, '获取详情失败');
  },

  // 需要登录的接口：全部走 authFetch
  createOrder: async (
    items: { toy: Toy; quantity: number }[],
    totalAmount: number,
  ): Promise<Order> => {
    const res = await authFetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items, totalAmount }),
    });
    return parseResponse<Order>(res, '下单失败');
  },

  getOrders: async (): Promise<Order[]> => {
    const res = await authFetch('/api/orders');
    return parseResponse<Order[]>(res, '获取订单失败');
  },

  // 认证
  auth: async (payload: AuthPayload): Promise<AuthResponse> => {
    const res = await fetch(`${API_BASE_URL}/api/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await parseResponse<AuthResponse>(res, '认证失败');
    saveTokens(data);
    return data;
  },

  /** 刷新页面后用本地 token 恢复登录态（access 过期会自动刷新） */
  me: async (): Promise<User> => {
    const res = await authFetch('/api/auth/me');
    return parseResponse<User>(res, '获取用户信息失败');
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
      // 网络失败也照样清本地，不影响用户退出
    }
    clearTokens();
  },
};
```


### 6.3 改 `apps/web/src/components/AuthModal.tsx`（只改 `handleSubmit` 里的成功分支）

```ts
    try {
      // 真实登录/注册：走纯后端 /api/auth，成功后 token 已在 api.auth 里存好
      const { user } = await api.auth({
        action: authModalMode === "register" ? "register" : "login",
        email: account,
        password,
      });

      dispatch(setUser(user));
      dispatch(setAuthModalOpen(false));
      setPassword("");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "认证失败，请稍后重试");
    } finally {
      setLoading(false);
    }
```

> 原来那行 `sessionStorage.setItem("client_user", ...)` 删掉，用户信息改为由 `/api/auth/me` 恢复，不再落 sessionStorage。

### 6.4 改 `apps/web/src/providers/Providers.tsx`（替换恢复登录态的 `useEffect`）

```tsx
import { api } from "@/services/api";
import { clearTokens, getAccessToken } from "@/lib/auth-client";

  // 刷新页面后 Redux 会重置，这里用本地 token 向后端换回用户信息
  useEffect(() => {
    if (!getAccessToken()) return;
    api
      .me()
      .then((user) => store.dispatch(setUser(user)))
      .catch(() => clearTokens());
  }, []);
```

### 6.5 改退出登录的两处

`apps/web/src/components/Navbar.tsx`：

```tsx
  const handleClientLogout = async () => {
    await api.logout();
    dispatch(logout());
    router.push("/");
  };
```

`apps/web/src/app/profile/page.tsx` 的退出按钮：

```tsx
          <button
            onClick={async () => {
              await api.logout();
              dispatch(logout());
              router.push("/");
            }}
            ...
```

### 6.6 改 `apps/web/src/app/profile/page.tsx` 的订单查询

```tsx
  const { data: orders = [], isLoading } = useQuery<Order[]>({
    queryKey: ["orders", user?.id],
    queryFn: () => api.getOrders(),   // 不再传 userId，后端从 token 里取
    enabled: Boolean(user?.id),
  });
```

### 6.7 改 `apps/web/src/app/cart/page.tsx` 第 26 行

```ts
            const order = await api.createOrder(cartItems, totalAmount)
```

（去掉了第一个 `user.id` 参数，后端从 token 里取用户。）

---

## 7. 管理后台改造（`apps/admin`）

### 7.1 新建 `apps/admin/src/lib/auth-client.ts`

内容与 6.1 **完全相同**，只把两个 key 换成后台专用的，避免和 C 端同域冲突：

```ts
const ACCESS_TOKEN_KEY = 'toyland_admin_access_token';
const REFRESH_TOKEN_KEY = 'toyland_admin_refresh_token';
```

### 7.2 改 `apps/admin/src/services/adminApi.ts`（整份替换）

```ts
import type { Toy, ToyInput } from '@toy-store/shared';
import { authFetch, clearTokens, getRefreshToken, saveTokens } from '@/lib/auth-client';

export interface AdminAuthResponse {
  success: boolean;
  user: { id: string; username: string; email: string; isAdmin: boolean };
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
    saveTokens(data);
    return data;
  },

  logout: async (): Promise<void> => {
    const refreshToken = getRefreshToken();
    try {
      await fetch(`${API_BASE_URL}/api/auth/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
    } catch {
      // 忽略
    }
    clearTokens();
  },
};
```

> `logout` 里用到了 `API_BASE_URL`，记得在文件顶部加：  
> `import { API_BASE_URL } from '@/lib/api-base';`

### 7.3 改 `apps/admin/src/app/admin/login/page.tsx`

```tsx
    const handleAdminLogin = async (e: React.FormEvent) => {
        e.preventDefault()
        try {
            const data = await adminApi.login(email, password)
            // token 已在 adminApi.login 里存好，这里只留一份展示用的用户信息
            sessionStorage.setItem('admin_user', JSON.stringify(data.user))
            router.push('/admin/toys')
        } catch (err) {
            setError(err instanceof Error ? err.message : '登录失败')
        }
    }
```

### 7.4 改 `apps/admin/src/app/admin/toys/page.tsx` 的权限校验

```tsx
  useEffect(() => {
    const adminData = sessionStorage.getItem('admin_user');

    // 没有本地 token 说明登录态已失效，直接回登录页
    if (!adminData || !getAccessToken()) {
      sessionStorage.removeItem('admin_user');
      router.replace('/admin/login');
      return;
    }

    const user = JSON.parse(adminData)
    if (!user.isAdmin) {
      sessionStorage.removeItem('admin_user');
      router.replace('/admin/login');
      return;
    }
    setAuthorized(true)
  }, [router])
```

文件头加：`import { getAccessToken } from '@/lib/auth-client'`

另外 `fetchToys` 的 `catch` 建议加一句：token 彻底失效（刷新也失败）时跳登录页。

```tsx
  const fetchToys = async () => {
    try {
      const data = await adminApi.getToys()
      setToys(data)
    } catch (err) {
      console.error(err)
      if (!getAccessToken()) {
        sessionStorage.removeItem('admin_user')
        router.replace('/admin/login')
      }
    } finally {
      setLoading(false)
    }
  }
```

### 7.5 改 `apps/admin/src/components/AdminHeader.tsx` 的退出

```tsx
  const handleLogout = async () => {
    await adminApi.logout();
    sessionStorage.removeItem("admin_user");
    setUser(null);
    router.replace("/admin/login");
  };
```

文件头加 `import { adminApi } from "@/services/adminApi";`

---

## 8. 自测流程

后端启动（`pnpm dev:api`）后按顺序验证：

```bash
# 1. 登录，拿一对 token
curl -X POST http://localhost:4000/api/auth \
  -H "Content-Type: application/json" \
  -d '{"action":"login","email":"customer@toyland.com","password":"123456"}'

# 2. 用 accessToken 查自己的订单（把 <ACCESS> 换成上一步的值）
curl http://localhost:4000/api/orders -H "Authorization: Bearer <ACCESS>"

# 3. 不带 token 查订单 → 应该 401 + {"code":"UNAUTHORIZED"}
curl -i http://localhost:4000/api/orders

# 4. 用 refreshToken 换新的一对（<REFRESH> 换成第 1 步的值）
curl -X POST http://localhost:4000/api/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"<REFRESH>"}'

# 5. 拿第 4 步返回的旧 refreshToken 再刷一次 → 应该 401（已轮换作废）
```

前端验证：

1. C 端登录 → DevTools → Application → Local Storage 里能看到两个 token。
2. 手动把 `toyland_access_token` 改成乱码 → 刷新页面 → 应该自动刷新成功、仍处于登录态。
3. 把两个 token 都改乱 → 刷新页面 → 回到未登录状态。
4. 后台：不带 token 直接访问 `/admin/toys` → 跳回登录页。

---

## 8.1 抄代码时最容易踩的两个坑（已修）

1. **`signAccessToken` 漏了 `.setAudience(AUDIENCE)`**
   签发时没写 `aud`，校验时却要求 `aud`，jose 会抛 `JWTClaimValidationFailed: unexpected "aud" claim value`。
   表现：登录接口 200 正常，但之后**任何带 token 的请求都 401**，前端不停刷新也没用。
   签发和校验的 `issuer` / `audience` 必须成对出现。

2. **`apps/api/.env.local` 没建**
   `getSecret()` 找不到 `JWT_ACCESS_SECRET` 会直接抛错，登录接口返回 500「服务器错误」。
   `.env.local` 在 `.gitignore` 里（`.env*` 全忽略，`.env.example` 例外），所以新建后不会误提交。

---

## 9. 两个可选的加固点

1. **refresh token 换成 httpOnly Cookie**（防 XSS 偷 token）。做法：`/api/auth` 登录成功时用 `cookies()` 写入 `httpOnly: true` 的 cookie，前端 `fetch` 加 `credentials: 'include'`，后端 `proxy.ts` 的 CORS 要补 `Access-Control-Allow-Credentials: true`。注意 `localhost:3000 → localhost:4000` 属于同站，`SameSite=Lax` 即可；真正跨站部署（不同主域）必须 `SameSite=None; Secure` + HTTPS。
2. **密码加密**。当前库里是明文密码，接 JWT 的同时建议一起换成 `bcryptjs`，注册时 `hash`、登录时 `compare`，改动很小但收益很大。

---

## 10. 改动清单速查

| 类型 | 文件                                              |
| -- | ----------------------------------------------- |
| 新增 | `apps/api/src/lib/jwt.ts`                       |
| 新增 | `apps/api/src/lib/auth.ts`                      |
| 新增 | `apps/api/src/lib/user.ts`                      |
| 新增 | `apps/api/src/app/api/auth/refresh/route.ts`    |
| 新增 | `apps/api/src/app/api/auth/logout/route.ts`     |
| 新增 | `apps/api/src/app/api/auth/me/route.ts`         |
| 新增 | `apps/web/src/lib/auth-client.ts`               |
| 新增 | `apps/admin/src/lib/auth-client.ts`             |
| 修改 | `apps/api/prisma/schema.prisma`                 |
| 修改 | `apps/api/.env.local`、`apps/api/.env.example`   |
| 修改 | `apps/api/src/app/api/auth/route.ts`            |
| 修改 | `apps/api/src/app/api/admin/login/route.ts`     |
| 修改 | `apps/api/src/app/api/admin/toys/route.ts`      |
| 修改 | `apps/api/src/app/api/admin/toys/[id]/route.ts` |
| 修改 | `apps/api/src/app/api/orders/route.ts`          |
| 修改 | `apps/web/src/services/api.ts`                  |
| 修改 | `apps/web/src/components/AuthModal.tsx`         |
| 修改 | `apps/web/src/components/Navbar.tsx`            |
| 修改 | `apps/web/src/providers/Providers.tsx`          |
| 修改 | `apps/web/src/app/profile/page.tsx`             |
| 修改 | `apps/web/src/app/cart/page.tsx`                |
| 修改 | `apps/admin/src/services/adminApi.ts`           |
| 修改 | `apps/admin/src/app/admin/login/page.tsx`       |
| 修改 | `apps/admin/src/app/admin/toys/page.tsx`        |
| 修改 | `apps/admin/src/components/AdminHeader.tsx`     |
| 不改 | `apps/api/src/proxy.ts`（已允许 Authorization 头）    |
