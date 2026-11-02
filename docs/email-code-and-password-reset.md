# 注册邮箱验证码 + C 端找回密码

> 前置：项目已按 `docs/jwt-guide.md` 接入双 Token，`docs/admin-user-management.md` 里的封禁逻辑已生效。
> 本文补两个缺口：**注册时校验邮箱真实性**、**忘记密码能真正重置**。

---

## 抄之前先看：这次的坑集中在三个地方

| # | 关键点 | 漏了会怎样 |
| --- | --- | --- |
| 1 | **验证码必须"校验通过即作废"**（第 5.2 节 `verifyEmailCode`） | 同一个码在 5 分钟内能反复用，注册完还能再注册一次、重置完还能再重置 |
| 2 | **重置密码后要删光该用户的 refreshToken**（第 5.4 节） | 密码改了，但攻击者手上的 refresh token 还能续 7 天，改密码等于没改 |
| 3 | **发码接口要有冷却 + 次数上限**（第 5.2 节 `issueEmailCode`） | 别人拿你的接口当免费邮件轰炸机，一个脚本就能把邮箱发爆，你的 SMTP 账号被封 |

> 另外：如果你在 `prisma migrate dev` 那一步卡在 **`Drift detected`**，不是你写错了，是这个仓库的历史欠账（当初有人用 `db push` 推库没生成迁移）。处理办法见 **3.3**，**千万不要**直接 `migrate reset`。

---

## 0. 设计说明（先看，后面代码才顺）

### 0.1 为什么是 6 位数字码，而不是"点邮件里的链接"

两种做法都常见，这里选码，理由是这个项目的现状：

| | 6 位码（本文） | 邮件链接 |
| --- | --- | --- |
| 前端工作量 | 一个输入框 + 一个倒计时按钮 | 要新增 `/reset?token=xxx` 页面、要处理链接过期页 |
| 数据表 | 一张 `EmailCode` 表，注册和找回密码共用 | 通常还要区分 reset token / verify token |
| 用户体验 | 要手动抄 6 位数字 | 点一下就行，更好 |
| 安全边界 | 6 位 = 100 万种，靠"5 分钟 + 5 次错误上限"兜住 | token 更长，但同样靠有效期兜 |

**注意**：6 位码的安全性完全依赖"错误次数上限"。`attempts >= 5` 就作废这条不能省，否则 100 万种穷举在脚本面前就是几分钟的事。

### 0.2 验证码存在哪

新建一张 `EmailCode` 表，**不放进 `User` 表**：

```prisma
model EmailCode {
  email      String    // 收件邮箱
  code       String    // 6 位数字
  purpose    String    // 'register' | 'reset'，两种用途互不干扰
  expiresAt  DateTime  // 5 分钟后过期
  consumedAt DateTime? // 非空 = 已用掉 / 已作废
  attempts   Int       // 校验失败次数
}
```

放 `User` 表上的话，一个用户同时只能有一条待验证码，而且"邮箱还没注册"的场景（注册验证）根本没地方存。

### 0.3 三个约束值

| 常量 | 值 | 为什么 |
| --- | --- | --- |
| `CODE_TTL_MS` | 5 分钟 | 够用户切到邮箱抄码，又不至于长期有效 |
| `CODE_COOLDOWN_MS` | 60 秒 | 前端倒计时同款；防止连点刷邮件 |
| `MAX_ATTEMPTS` | 5 次 | 6 位码穷举防护的核心 |

外加一条：**同一邮箱 1 小时内最多 10 封**，防止换着 IP 刷。

### 0.4 接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/auth/email-code` | 发验证码，body `{ email, purpose: 'register' \| 'reset' }` |
| POST | `/api/auth` | 原有登录/注册入口，**注册分支新增必填 `code`** |
| POST | `/api/auth/reset-password` | 新增，body `{ email, code, newPassword }` |

CORS 不用管：`apps/api/src/proxy.ts` 的 matcher 是 `/api/:path*`，新路由自动覆盖。

### 0.5 没有 SMTP 也能跑

这是本文最实用的一个设计：`mailer.ts` 在**没配 SMTP 时不报错**，而是把邮件内容打到控制台；同时发码接口会在非生产环境下把 `devCode` 一起返回，前端自动填进输入框。

所以你本地可以先把流程跑通，等要真发信了再去配 QQ 邮箱授权码。

---

## 1. 改动总览（12 个文件：5 个新建 / 7 个修改）

按这个顺序抄，中间每一步都能单独验证：

| # | 文件 | 动作 |
| --- | --- | --- |
| 1 | `apps/api/package.json` | 装依赖（用命令，别手改） |
| 2 | `apps/api/prisma/schema.prisma` | 末尾追加 `EmailCode` 模型 |
| 3 | `apps/api/.env.example` | 追加 SMTP 配置说明 |
| 4 | `apps/api/src/lib/mailer.ts` | **新建** |
| 5 | `apps/api/src/lib/email-code.ts` | **新建** |
| 6 | `apps/api/src/app/api/auth/email-code/route.ts` | **新建** |
| 7 | `apps/api/src/app/api/auth/reset-password/route.ts` | **新建** |
| 8 | `apps/api/src/app/api/auth/route.ts` | 整文件替换（注册分支加验证码） |
| 9 | `packages/shared/src/index.ts` | 改 `AuthPayload`，加 `EmailCodePurpose` |
| 10 | `apps/web/src/services/api.ts` | 整文件替换（加两个接口） |
| 11 | `apps/web/src/components/SendCodeButton.tsx` | **新建** |
| 12 | `apps/web/src/components/AuthModal.tsx` | 整文件替换（注册加码 + 真找回密码） |

---

## 2. 装依赖

```bash
# 邮件发送
pnpm --filter @toy-store/api add nodemailer
pnpm --filter @toy-store/api add -D @types/nodemailer
```

> 用 pnpm 装，不要手写 `package.json` 里的版本号 —— pnpm workspace 的 lockfile 要一起更新。

---

## 3. 数据库

### 3.1 `apps/api/prisma/schema.prisma`

在文件**末尾追加**（`RefreshToken` 模型之后）：

```prisma
// 邮箱验证码：注册验证 / 找回密码共用一张表
// SQLite 不支持 enum，purpose 用字符串 + 注释约定取值
model EmailCode {
  id         String    @id @default(uuid())
  email      String    // 收件邮箱
  code       String    // 6 位数字，明文存（见 10.2 的取舍说明）
  purpose    String    // 'register' | 'reset'
  expiresAt  DateTime  // 过期时间
  consumedAt DateTime? // 非空 = 已使用或已作废，不能再校验
  attempts   Int       @default(0) // 校验失败次数，达到上限直接作废
  createdAt  DateTime  @default(now())

  // 每次发码/校验都是按 email + purpose 查最近一条，这个联合索引刚好命中
  @@index([email, purpose, createdAt])
}
```

### 3.2 生成迁移 + 客户端

```bash
cd apps/api
npx prisma migrate dev --name add_email_code
```

> 别用 `pnpm --filter @toy-store/api exec prisma ...` 这种长串写法 —— 包名容易被 shell 或手滑改坏（比如写成 `@//toy-store/api`），而且报错信息会混进 pnpm 的递归栈里，很难看清。`cd` 进去直接 `npx` 最省事。

这条命令会顺带跑 `prisma generate`。如果它没跑（比如你只 push 了库），手动补一次：

```bash
npx prisma generate
```

**必须 generate**，否则 `prisma.emailCode` 是 `undefined`，一调用就 `Cannot read properties of undefined`。

### 3.3 如果报 `Drift detected`（很可能遇到）

报错长这样：

```
Drift detected: Your database schema is not in sync with your migration history.
[+] Added tables
- RefreshToken
[*] Changed the `User` table
[+] Added column `bannedAt`
[+] Added column `bannedReason`
We need to reset the SQLite database "dev.db"
Error: P3005 / ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL
```

**这不是你写错了，是仓库的历史欠账**：封禁字段和 `RefreshToken` 表当初是用 `prisma db push` 直接推的，从来没生成过迁移文件。`migrate dev` 会做"重放迁移 vs 实际库"的结构对比，发现对不上就要求 reset。

注意 `migrate status` 此时**显示正常** —— 它只比对迁移记录表，不做结构对比，别被它骗了。

#### 不要直接 reset

`prisma migrate reset` 会重放现有迁移，而现有迁移里**没有** `bannedAt` / `RefreshToken`，重置完库反而缺表，登录和刷新直接挂。

#### 正确做法：把这段历史补成一条基线迁移

```bash
cd apps/api

# 0) 先备份（dev.db 是 git 跟踪的，改坏了能回滚）
cp prisma/dev.db prisma/dev.db.bak

# 1) 生成"从迁移历史到实际库"的差异 SQL
#    注意 --from-migrations 需要影子库；影子库路径每次换个新的，
#    否则第二次跑会报 "table already exists"（Prisma 不会自动清空它）
npx prisma migrate diff \
  --from-migrations prisma/migrations \
  --to-schema-datasource prisma/schema.prisma \
  --shadow-database-url "file:./shadow-tmp.db" \
  --script > /tmp/baseline.sql

# 2) 落成一个迁移文件夹（时间戳要比已有迁移大、比 add_email_code 小）
mkdir -p prisma/migrations/20260101000000_baseline_sync
cp /tmp/baseline.sql prisma/migrations/20260101000000_baseline_sync/migration.sql

# 3) 关键：标记为"已应用"，不要真的执行 —— 库里本来就有这些表
npx prisma migrate resolve --applied 20260101000000_baseline_sync

# 4) 清掉临时影子库
rm -f shadow-tmp.db

# 5) 现在再跑就正常了
npx prisma migrate dev --name add_email_code
```

**第 1 步有个陷阱**：`mkdir` 必须在 `migrate diff` **之后**做。先生成空文件夹再跑 diff 的话，那个空迁移会被算进 `--from-migrations`，diff 结果直接为空，你会得到一个空的 `migration.sql` 还以为成功了。

#### 验证漂移真的没了

```bash
npx prisma migrate status
# → Database schema is up to date!

# 更强的一条：让 Prisma 用迁移历史重建 schema，再和 schema.prisma 比
npx prisma migrate diff \
  --from-migrations prisma/migrations \
  --to-schema-datamodel prisma/schema.prisma \
  --shadow-database-url "file:./shadow-verify.db" \
  --script
# → -- This is an empty migration.   ← 空的就是对的
```

> 本仓库已经补过这条基线（`20261101060000_sync_banned_and_refresh_token`），所以你本地**不会再遇到**这个报错。上面这套流程留着，是给"重新 clone 到另一台机器"或者"以后又有人 `db push` 了"用的。

---

## 4. 环境变量

### 4.1 `apps/api/.env.example`（追加到末尾）

```bash
# ── 邮件服务（发送注册 / 找回密码验证码）────────────────────────────
# 不配置也能跑：验证码会打印在 api 进程的控制台，并回传给前端自动填入
# QQ 邮箱：设置 → 账户 → 开启 SMTP 服务 → 生成"授权码"（不是登录密码！）
# 163 邮箱：设置 → POP3/SMTP/IMAP → 开启服务 → 获取授权码
SMTP_HOST=smtp.qq.com
SMTP_PORT=465
SMTP_USER=your-account@qq.com
SMTP_PASS=这里填授权码，不是邮箱登录密码
SMTP_FROM=Toyland Express <your-account@qq.com>
```

### 4.2 本地 `apps/api/.env.local`

真发信就把上面五项填上；**不发信就整段不写**，走控制台兜底。

> 改完 `.env.local` 必须重启 `pnpm dev` —— 这几个变量是在模块顶层读的，HMR 不会重新读。

---

## 5. 后端

### 5.1 `apps/api/src/lib/mailer.ts`（新建）

```ts
import nodemailer, { type Transporter } from 'nodemailer';

/**
 * 邮件发送封装。
 *
 * 没配 SMTP 时不抛错，只把邮件内容打印到控制台 ——
 * 这样本地开发不用先申请邮箱授权码，也能把注册 / 找回密码流程跑通。
 */
const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT ?? 465);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_FROM = process.env.SMTP_FROM;

/** 是否配齐了 SMTP，路由层用它决定要不要把验证码回传给前端 */
export const isMailConfigured = Boolean(SMTP_HOST && SMTP_USER && SMTP_PASS);

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      // 465 是 SSL 直连；587 是 STARTTLS，nodemailer 会自动升级
      secure: SMTP_PORT === 465,
      auth: { user: SMTP_USER as string, pass: SMTP_PASS as string },
    });
  }
  return transporter;
}

export async function sendMail(options: {
  to: string;
  subject: string;
  html: string;
}): Promise<void> {
  if (!isMailConfigured) {
    const plain = options.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    console.log('\n[mailer] 未配置 SMTP，邮件未真正发送：');
    console.log(`  收件人：${options.to}`);
    console.log(`  主题　：${options.subject}`);
    console.log(`  内容　：${plain}\n`);
    return;
  }

  await getTransporter().sendMail({
    from: SMTP_FROM || SMTP_USER,
    to: options.to,
    subject: options.subject,
    html: options.html,
  });
}
```

### 5.2 `apps/api/src/lib/email-code.ts`（新建）

```ts
import { prisma } from '@/lib/prisma';
import { sendMail, isMailConfigured } from '@/lib/mailer';

/** 验证码用途：注册验证 / 找回密码 */
export type EmailCodePurpose = 'register' | 'reset';

/** 有效期 5 分钟 */
export const CODE_TTL_MS = 5 * 60 * 1000;
/** 同一邮箱同一用途的发信冷却 60 秒 */
export const CODE_COOLDOWN_MS = 60 * 1000;
/** 单个验证码最多校验失败 5 次 */
export const MAX_ATTEMPTS = 5;
/** 同一邮箱 1 小时内最多发 10 封 */
const MAX_SENDS_PER_HOUR = 10;

export type IssueResult =
  | { ok: true; devCode?: string; cooldown: number }
  | { ok: false; status: number; error: string };

export type VerifyResult = { ok: true } | { ok: false; error: string };

/**
 * 生成 6 位数字验证码。
 *
 * 必须用 crypto 而不是 Math.random：Math.random 是可预测的伪随机，
 * 拿到几个样本就能推出后面的值，等于把验证码送给别人。
 */
function randomCode(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  return String(n).padStart(6, '0');
}

function renderEmail(code: string, purpose: EmailCodePurpose): string {
  const title = purpose === 'register' ? '注册验证码' : '重置密码验证码';
  const tip =
    purpose === 'register'
      ? '你正在注册 Toyland Express 账号'
      : '你正在重置 Toyland Express 账号密码';

  return `
  <div style="font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#ffffff">
    <h2 style="margin:0 0 8px;color:#111827;font-size:20px">${title}</h2>
    <p style="margin:0 0 24px;color:#6b7280;font-size:14px">${tip}，验证码 5 分钟内有效。</p>
    <div style="background:#fdf2f8;border:1px solid #fbcfe8;border-radius:16px;padding:20px;text-align:center">
      <div style="font-size:32px;font-weight:800;letter-spacing:8px;color:#db2777">${code}</div>
    </div>
    <p style="margin:24px 0 0;color:#9ca3af;font-size:12px">
      如果不是你本人操作，请忽略这封邮件，你的账号不会有任何变化。
    </p>
  </div>`;
}

/** 生成并发送验证码，内含冷却与次数限制 */
export async function issueEmailCode(
  email: string,
  purpose: EmailCodePurpose,
): Promise<IssueResult> {
  const now = new Date();

  // 1) 冷却：看这个邮箱 + 用途的最近一条
  const latest = await prisma.emailCode.findFirst({
    where: { email, purpose },
    orderBy: { createdAt: 'desc' },
  });

  if (latest) {
    const elapsed = now.getTime() - latest.createdAt.getTime();
    if (elapsed < CODE_COOLDOWN_MS) {
      const retryAfter = Math.ceil((CODE_COOLDOWN_MS - elapsed) / 1000);
      return { ok: false, status: 429, error: `请求过于频繁，请 ${retryAfter} 秒后再试` };
    }
  }

  // 2) 一小时内最多 10 封，防止被当成免费邮件轰炸机
  const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const sentInHour = await prisma.emailCode.count({
    where: { email, purpose, createdAt: { gte: hourAgo } },
  });
  if (sentInHour >= MAX_SENDS_PER_HOUR) {
    return { ok: false, status: 429, error: '该邮箱发送次数过多，请一小时后再试' };
  }

  // 3) 旧的未用验证码直接作废，保证同一时刻只有最新一条有效
  await prisma.emailCode.updateMany({
    where: { email, purpose, consumedAt: null },
    data: { consumedAt: now },
  });

  const code = randomCode();
  await prisma.emailCode.create({
    data: {
      email,
      purpose,
      code,
      expiresAt: new Date(now.getTime() + CODE_TTL_MS),
    },
  });

  await sendMail({
    to: email,
    subject:
      purpose === 'register'
        ? '【Toyland Express】注册验证码'
        : '【Toyland Express】重置密码验证码',
    html: renderEmail(code, purpose),
  });

  // 只在"本地没配 SMTP"时回传，方便开发时直接抄码；生产环境永远不返回
  const devCode = !isMailConfigured && process.env.NODE_ENV !== 'production' ? code : undefined;

  return { ok: true, devCode, cooldown: CODE_COOLDOWN_MS / 1000 };
}

/** 校验验证码：通过即作废，失败则累加 attempts */
export async function verifyEmailCode(
  email: string,
  purpose: EmailCodePurpose,
  code: string,
): Promise<VerifyResult> {
  const record = await prisma.emailCode.findFirst({
    where: { email, purpose, consumedAt: null },
    orderBy: { createdAt: 'desc' },
  });

  if (!record) return { ok: false, error: '请先获取验证码' };
  if (record.expiresAt <= new Date()) return { ok: false, error: '验证码已过期，请重新获取' };
  if (record.attempts >= MAX_ATTEMPTS) {
    return { ok: false, error: '验证码错误次数过多，请重新获取' };
  }

  if (record.code !== code) {
    // 错一次就记一次，超过上限这条码自然废掉
    await prisma.emailCode.update({
      where: { id: record.id },
      data: { attempts: { increment: 1 } },
    });
    const left = MAX_ATTEMPTS - record.attempts - 1;
    return {
      ok: false,
      error: left > 0 ? `验证码错误，还可尝试 ${left} 次` : '验证码错误次数过多，请重新获取',
    };
  }

  // 一次性：校验通过立刻标记已消费，防止同一个码用两次
  await prisma.emailCode.update({
    where: { id: record.id },
    data: { consumedAt: new Date() },
  });

  return { ok: true };
}
```

### 5.3 `apps/api/src/app/api/auth/email-code/route.ts`（新建）

```ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { issueEmailCode, type EmailCodePurpose } from '@/lib/email-code';

export async function POST(request: Request) {
  try {
    const { email, purpose } = (await request.json()) as {
      email?: string;
      purpose?: EmailCodePurpose;
    };

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: '请输入正确的邮箱地址' }, { status: 400 });
    }
    if (purpose !== 'register' && purpose !== 'reset') {
      return NextResponse.json({ error: '参数 purpose 非法' }, { status: 400 });
    }

    const account = email.trim();
    const exists = await prisma.user.findUnique({
      where: { email: account },
      select: { id: true },
    });

    // 注册：邮箱不能已存在；找回密码：邮箱必须已存在
    if (purpose === 'register' && exists) {
      return NextResponse.json({ error: '该邮箱已被注册，请直接登录' }, { status: 400 });
    }
    if (purpose === 'reset' && !exists) {
      return NextResponse.json({ error: '该邮箱尚未注册' }, { status: 404 });
    }

    const result = await issueEmailCode(account, purpose);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({
      success: true,
      message: '验证码已发送，5 分钟内有效',
      cooldown: result.cooldown,
      // 只有本地没配 SMTP 时才有这个字段，生产环境不存在
      ...(result.devCode ? { devCode: result.devCode } : {}),
    });
  } catch (error) {
    console.error('[api/auth/email-code]', error);
    return NextResponse.json({ error: '验证码发送失败，请稍后重试' }, { status: 500 });
  }
}
```

### 5.4 `apps/api/src/app/api/auth/reset-password/route.ts`（新建）

```ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyEmailCode } from '@/lib/email-code';

export async function POST(request: Request) {
  try {
    const { email, code, newPassword } = await request.json();

    if (!email || !code || !newPassword) {
      return NextResponse.json({ error: '邮箱、验证码和新密码都不能为空' }, { status: 400 });
    }
    if (String(newPassword).length < 6) {
      return NextResponse.json({ error: '新密码至少 6 位' }, { status: 400 });
    }

    const account = String(email).trim();

    const user = await prisma.user.findUnique({ where: { email: account } });
    if (!user) {
      return NextResponse.json({ error: '该邮箱尚未注册' }, { status: 404 });
    }

    // 校验通过即作废，同一个码不能重置两次
    const verified = await verifyEmailCode(account, 'reset', String(code).trim());
    if (!verified.ok) {
      return NextResponse.json({ error: verified.error }, { status: 400 });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { password: String(newPassword) },
    });

    // 关键：密码变了，之前签发的 refresh token 全部作废
    // 不删的话，旧设备 / 攻击者手上的 token 还能继续续期 7 天
    await prisma.refreshToken.deleteMany({ where: { userId: user.id } });

    return NextResponse.json({ success: true, message: '密码已重置，请用新密码登录' });
  } catch (error) {
    console.error('[api/auth/reset-password]', error);
    return NextResponse.json({ error: '重置密码失败，请稍后重试' }, { status: 500 });
  }
}
```

### 5.5 `apps/api/src/app/api/auth/route.ts`（整文件替换）

```ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { issueTokenPair } from '@/lib/auth';
import { toPublicUser } from '@/lib/user';
import { verifyEmailCode } from '@/lib/email-code';

export async function POST(request: Request) {
  try {
    const { action, email, password, username, code } = await request.json();

    if (!email || !password) {
      return NextResponse.json({ error: '邮箱和密码不能为空' }, { status: 400 });
    }

    // 统一去掉首尾空格：发码时存的是 trim 过的邮箱，这里不 trim 会对不上
    const account = String(email).trim();

    if (action === 'register') {
      // 注册必须带邮箱验证码
      if (!code || typeof code !== 'string') {
        return NextResponse.json({ error: '请输入邮箱验证码' }, { status: 400 });
      }
      if (String(password).length < 6) {
        return NextResponse.json({ error: '密码至少 6 位' }, { status: 400 });
      }

      const existingUser = await prisma.user.findUnique({ where: { email: account } });
      if (existingUser) {
        return NextResponse.json({ error: '邮箱已被注册' }, { status: 400 });
      }

      // 校验通过即作废，同一个码不能注册两次
      const verified = await verifyEmailCode(account, 'register', code.trim());
      if (!verified.ok) {
        return NextResponse.json({ error: verified.error }, { status: 400 });
      }

      const newUser = await prisma.user.create({
        data: {
          email: account,
          password, // 生产环境请使用 bcrypt 加密
          username: username || account.split('@')[0],
          avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(account)}`,
          isAdmin: false,
        },
      });

      // 注册即登录：直接发一对 token
      const tokens = await issueTokenPair(newUser);
      return NextResponse.json({ user: toPublicUser(newUser), ...tokens });
    }

    if (action === 'login') {
      const user = await prisma.user.findUnique({ where: { email: account } });
      if (!user || user.password !== password) {
        return NextResponse.json({ error: '账号或密码错误' }, { status: 401 });
      }
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

    return NextResponse.json({ error: '非法操作' }, { status: 400 });
  } catch (error) {
    console.error('[api/auth]', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
```

---

## 6. 共享类型

### `packages/shared/src/index.ts`

把原来的 `AuthPayload` **替换**成下面这个，并在后面加 `EmailCodePurpose`：

```ts
export interface AuthPayload {
  action: 'login' | 'register';
  email: string;
  password?: string;
  username?: string;
  /** 注册时必填：邮箱验证码 */
  code?: string;
}

/** 邮箱验证码用途：注册验证 / 找回密码 */
export type EmailCodePurpose = 'register' | 'reset';
```

> `code` 用可选是因为登录不需要它；注册时后端会强制要求。这样 `AuthPayload` 一份类型能同时覆盖登录和注册两个分支，不用拆成两个 interface。

---

## 7. 前端

### 7.1 `apps/web/src/services/api.ts`（整文件替换）

```ts
import type { AuthPayload, EmailCodePurpose, Order, Toy, User } from '@toy-store/shared';
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

/** 发验证码的返回结构（devCode 只会在本地没配 SMTP 时出现） */
export interface SendCodeResponse {
  success: boolean;
  message: string;
  cooldown: number;
  devCode?: string;
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

  /** 发送邮箱验证码：注册和找回密码共用，靠 purpose 区分 */
  sendEmailCode: async (payload: {
    email: string;
    purpose: EmailCodePurpose;
  }): Promise<SendCodeResponse> => {
    const res = await fetch(`${API_BASE_URL}/api/auth/email-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return parseResponse<SendCodeResponse>(res, '验证码发送失败');
  },

  /** 用邮箱验证码重置密码：不需要登录态 */
  resetPassword: async (payload: {
    email: string;
    code: string;
    newPassword: string;
  }): Promise<{ success: boolean; message: string }> => {
    const res = await fetch(`${API_BASE_URL}/api/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return parseResponse<{ success: boolean; message: string }>(res, '重置密码失败');
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

### 7.2 `apps/web/src/components/SendCodeButton.tsx`（新建）

```tsx
"use client";

import React, { useEffect, useState } from "react";
import { api } from "@/services/api";
import type { EmailCodePurpose } from "@toy-store/shared";

interface SendCodeButtonProps {
  /** 当前表单里填的邮箱，点击时才会校验 */
  email: string;
  purpose: EmailCodePurpose;
  disabled?: boolean;
  /** 成功提示（绿色框），例如「验证码已发送」 */
  onMessage?: (message: string) => void;
  /** 失败提示（红色框）。和 onMessage 分开，否则报错会显示成绿色的成功样式 */
  onError?: (message: string) => void;
  /** 本地没配 SMTP 时，后端会把码回传，这里自动填进输入框 */
  onDevCode?: (code: string) => void;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function SendCodeButton({
  email,
  purpose,
  disabled,
  onMessage,
  onError,
  onDevCode,
}: SendCodeButtonProps) {
  const [seconds, setSeconds] = useState(0);
  const [sending, setSending] = useState(false);

  // 倒计时用「每次 seconds 变化排一个 setTimeout」实现，
  // 比 setInterval 稳：组件卸载 / 重复点击都不会留下野定时器
  useEffect(() => {
    if (seconds <= 0) return;
    const timer = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [seconds]);

  const handleClick = async () => {
    if (seconds > 0 || sending) return;

    if (!EMAIL_PATTERN.test(email.trim())) {
      onError?.("请先填写正确的邮箱地址");
      return;
    }

    setSending(true);
    try {
      const res = await api.sendEmailCode({ email: email.trim(), purpose });
      onMessage?.(res.message || "验证码已发送");
      if (res.devCode) onDevCode?.(res.devCode);
      // 用后端返回的冷却时间，前后端只认一个数，不会出现前端 60 秒后端 30 秒的错位
      setSeconds(res.cooldown || 60);
    } catch (err) {
      onError?.(err instanceof Error ? err.message : "验证码发送失败");
    } finally {
      setSending(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || sending || seconds > 0}
      className="shrink-0 px-3 py-3 rounded-xl border border-pink-200 text-pink-600 text-sm font-bold whitespace-nowrap hover:bg-pink-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {sending ? "发送中..." : seconds > 0 ? `${seconds}s 后重发` : "获取验证码"}
    </button>
  );
}
```

### 7.3 `apps/web/src/components/AuthModal.tsx`（整文件替换）

```tsx
"use client";

import React, { useEffect, useState } from "react";
import { useAppSelector, useAppDispatch } from "@/store/hooks";
import { setAuthModalOpen, setAuthModalMode, setUser } from "@/store/authSlice";
import { api } from "@/services/api";
import { X, Sparkles, KeyRound } from "lucide-react";
import SendCodeButton from "@/components/SendCodeButton";

const CODE_PATTERN = /^\d{6}$/;

export default function AuthModal() {
  const dispatch = useAppDispatch();
  const { authModalOpen, authModalMode } = useAppSelector((state) => state.auth);

  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // 在 登录 / 注册 / 找回密码 之间切换时，清掉上一次的输入和提示
  useEffect(() => {
    setPassword("");
    setConfirmPassword("");
    setCode("");
    setMessage("");
    setError("");
  }, [authModalMode]);

  if (!authModalOpen) return null;

  const isRegister = authModalMode === "register";
  const isForgot = authModalMode === "forgot";
  const needCode = isRegister || isForgot;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setMessage("");

    const email = account.trim();

    // ── 找回密码：邮箱 + 验证码 + 新密码，不需要旧密码 ──
    if (isForgot) {
      if (!CODE_PATTERN.test(code.trim())) {
        setError("请输入 6 位邮箱验证码");
        return;
      }
      if (password.length < 6) {
        setError("新密码至少 6 位");
        return;
      }
      if (password !== confirmPassword) {
        setError("两次输入的新密码不一致");
        return;
      }

      setLoading(true);
      try {
        const res = await api.resetPassword({
          email,
          code: code.trim(),
          newPassword: password,
        });
        setMessage(res.message || "密码已重置，请用新密码登录");
        setTimeout(() => dispatch(setAuthModalMode("login")), 1500);
      } catch (err) {
        setError(err instanceof Error ? err.message : "重置密码失败");
      } finally {
        setLoading(false);
      }
      return;
    }

    // ── 注册 / 登录 ──
    if (isRegister && !CODE_PATTERN.test(code.trim())) {
      setError("请输入 6 位邮箱验证码");
      return;
    }

    setLoading(true);
    try {
      // 真实登录/注册：走纯后端 /api/auth，成功后 token 已在 api.auth 里存好
      const { user } = await api.auth({
        action: isRegister ? "register" : "login",
        email,
        password,
        ...(isRegister ? { code: code.trim() } : {}),
      });

      dispatch(setUser(user));
      dispatch(setAuthModalOpen(false));
      setPassword("");
      setCode("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "认证失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-8 relative animate-in fade-in zoom-in-95 duration-200">
        <button
          onClick={() => dispatch(setAuthModalOpen(false))}
          className="absolute top-6 right-6 text-gray-400 hover:text-gray-600 p-1"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2 mb-2">
          <div className="w-8 h-8 rounded-lg bg-pink-500 flex items-center justify-center text-white">
            <Sparkles className="w-5 h-5" />
          </div>
          <h2 className="text-2xl font-bold text-gray-800">
            {authModalMode === "login" && "欢迎回到 Toyland"}
            {isRegister && "加入童趣俱乐部"}
            {isForgot && "找回密码"}
          </h2>
        </div>

        <p className="text-xs text-gray-400 mb-6">
          {authModalMode === "login" && "登录后即可下单、查看订单"}
          {isRegister && "需要邮箱验证码，确保是你本人的邮箱"}
          {isForgot && "验证码 5 分钟内有效，验证通过后直接设置新密码"}
        </p>

        {error && (
          <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-xl text-sm font-medium">
            {error}
          </div>
        )}
        {message && (
          <div className="mb-4 p-3 bg-emerald-50 text-emerald-600 rounded-xl text-sm font-medium">
            {message}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">电子邮箱</label>
            <input
              type="email"
              required
              value={account}
              onChange={(e) => setAccount(e.target.value)}
              placeholder="customer@toyland.com"
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-pink-500 text-gray-800"
            />
          </div>

          {needCode && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">邮箱验证码</label>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <KeyRound className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    inputMode="numeric"
                    maxLength={6}
                    required
                    value={code}
                    // 只留数字：粘贴带空格的验证码时不会因为空格校验失败
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                    placeholder="6 位数字"
                    className="w-full pl-9 pr-3 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-pink-500 text-gray-800 tracking-widest"
                  />
                </div>
                <SendCodeButton
                  email={account}
                  purpose={isRegister ? "register" : "reset"}
                  disabled={loading}
                  // 成功和失败分别走绿色 / 红色提示框，并且互斥（出现一个就清掉另一个）
                  onMessage={(msg) => {
                    setError("");
                    setMessage(msg);
                  }}
                  onError={(msg) => {
                    setMessage("");
                    setError(msg);
                  }}
                  onDevCode={setCode}
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {isForgot ? "新密码" : isRegister ? "设置密码" : "登录密码"}
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={needCode ? "至少 6 位" : "请输入密码"}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-pink-500 text-gray-800"
            />
          </div>

          {isForgot && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">确认新密码</label>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="再输入一次新密码"
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-pink-500 text-gray-800"
              />
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-pink-500 to-amber-500 text-white font-bold shadow-lg shadow-pink-500/25 hover:opacity-95 transition disabled:opacity-60"
          >
            {loading
              ? "处理中..."
              : authModalMode === "login"
                ? "立即登录"
                : isRegister
                  ? "确认注册"
                  : "重置密码"}
          </button>
        </form>

        <div className="mt-6 flex items-center justify-between text-sm text-gray-500">
          {authModalMode === "login" ? (
            <>
              <button
                onClick={() => dispatch(setAuthModalMode("forgot"))}
                className="hover:text-pink-600"
              >
                忘记密码？
              </button>
              <button
                onClick={() => dispatch(setAuthModalMode("register"))}
                className="text-pink-600 font-semibold"
              >
                注册新账号
              </button>
            </>
          ) : (
            <button
              onClick={() => dispatch(setAuthModalMode("login"))}
              className="text-pink-600 font-semibold mx-auto"
            >
              已有账号？返回登录
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
```

---

## 8. 自测清单

### 8.1 先跑通接口（不用配 SMTP）

```bash
# 1. 发注册验证码 → 记下响应里的 devCode
curl -X POST http://localhost:4000/api/auth/email-code \
  -H "Content-Type: application/json" \
  -d '{"email":"newbie@toyland.com","purpose":"register"}'
# {"success":true,"message":"验证码已发送，5 分钟内有效","cooldown":60,"devCode":"482913"}

# 2. 用这个码注册（把 482913 换成上一步真实返回的）
curl -X POST http://localhost:4000/api/auth \
  -H "Content-Type: application/json" \
  -d '{"action":"register","email":"newbie@toyland.com","password":"123456","code":"482913"}'
# → 返回 user + accessToken + refreshToken

# 3. 60 秒内再发一次 → 429
curl -i -X POST http://localhost:4000/api/auth/email-code \
  -H "Content-Type: application/json" \
  -d '{"email":"newbie@toyland.com","purpose":"register"}'
# HTTP/1.1 429

# 4. 找回密码：发 reset 码
curl -X POST http://localhost:4000/api/auth/email-code \
  -H "Content-Type: application/json" \
  -d '{"email":"newbie@toyland.com","purpose":"reset"}'

# 5. 重置
curl -X POST http://localhost:4000/api/auth/reset-password \
  -H "Content-Type: application/json" \
  -d '{"email":"newbie@toyland.com","code":"<reset码>","newPassword":"654321"}'

# 6. 用新密码登录
curl -X POST http://localhost:4000/api/auth \
  -H "Content-Type: application/json" \
  -d '{"action":"login","email":"newbie@toyland.com","password":"654321"}'
```

### 8.2 再验页面

| # | 验证点 | 期望 |
| --- | --- | --- |
| 1 | 点「注册新账号」 | 出现邮箱、验证码（带「获取验证码」按钮）、设置密码三个字段 |
| 2 | 不填验证码直接点「确认注册」 | 请求发不出去，弹窗不动。**提示是浏览器原生的「请填写此字段」气泡**，不是我们写的文案 —— 因为 `code` 输入框带了 `required`，原生校验在 `onSubmit` 之前就拦了。这不算 bug，但别指望看到自己写的那句 |
| 3 | 点「获取验证码」 | 按钮变「60s 后重发」并逐秒递减；本地无 SMTP 时验证码自动填进输入框 |
| 4 | 注册已存在的邮箱 | **红色框**提示「该邮箱已被注册，请直接登录」（在发码阶段就被拦）。如果你看到它是绿色的，说明 `SendCodeButton` 的 `onError` 没接上 |
| 5 | 注册成功 | 直接登录，弹窗关闭，Navbar 显示用户名 |
| 6 | 点「忘记密码？」 | 出现验证码 + 新密码 + 确认新密码，**没有旧密码输入框** |
| 7 | 两次新密码不一致 | 前端拦下：「两次输入的新密码不一致」 |
| 8 | 故意输错验证码 5 次 | 第 5 次后提示「错误次数过多，请重新获取」，第 6 次仍失败 |
| 9 | 重置成功 | 绿字提示，1.5 秒后自动跳回登录态 |
| 10 | **重置后用旧密码登录** | 失败；用新密码成功 |
| 11 | **重置前在另一浏览器登录着，重置后刷新** | 被踢下线（refresh token 已删） |

第 11 条最容易漏测：重置密码后旧会话必须失效，不然改密码就是心理安慰。

### 8.3 本地实测结果（2026-11-01）

这套流程在本地完整跑过，记录一下基线，方便你抄完对照：

- **接口层 23 条用例全过**：参数边界（邮箱格式 / purpose 非法 / 未注册邮箱 / 已注册邮箱）、发码冷却 429、错码剩余次数递减、连续 5 次锁定、验证码一次性、旧密码失效、新密码可用、重置前签发的 refresh token 返回 401。
- **页面层 16 条用例全过**：弹窗切换、倒计时按钮、验证码自动填入、注册成功关窗、退出、找回密码表单字段、两次密码不一致拦截、重置成功绿字提示、1.5 秒回登录、旧密码登录失败 / 新密码成功。
- 数据库侧抽查：注册码 `attempts=1, consumed=yes`；被锁定的码 `attempts=5, consumed=no`（锁定靠 attempts，不靠 consumed，这是对的）；重置后该用户 `refreshToken` 归零。

两个**不是 bug 但会让你困惑**的观察：

1. 不填验证码点提交，看到的是浏览器原生「请填写此字段」气泡，而不是我们写的「请输入 6 位邮箱验证码」—— 因为输入框有 `required`，原生校验先于 `onSubmit`。
2. 关闭弹窗再打开，会**保留上一次的模式**（比如停在注册页而不是回到登录页）。这是原项目就有的行为（`authModalMode` 存在 Redux 里，关闭时没重置），本次改动没有引入也没有修。想修的话，在 `setAuthModalOpen(false)` 的地方顺手 `dispatch(setAuthModalMode("login"))`。

---

## 9. 七个容易抄错的点

| # | 坑 | 后果 |
| --- | --- | --- |
| 1 | 忘了 `prisma generate` | `prisma.emailCode` 是 `undefined`，接口 500 |
| 2 | `verifyEmailCode` 里校验通过后没写 `consumedAt` | 同一个码能用无限次，重置完还能再重置 |
| 3 | 重置密码后没删 `refreshToken` | 旧会话还能续 7 天 |
| 4 | 发码接口没做冷却 | 被脚本当免费邮件轰炸机，SMTP 账号会被封 |
| 5 | `AuthModal` 的 `useEffect` 写在 `if (!authModalOpen) return null` 后面 | React 报 "Rendered fewer hooks than expected"，整个弹窗白屏 |
| 6 | 用 `Math.random()` 生成验证码 | 可预测，等于没做验证 |
| 7 | `SendCodeButton` 只暴露一个 `onMessage`，成功和失败都往里塞 | 报错会渲染在**绿色的成功框**里（「该邮箱已被注册」配绿底），用户看着像成功了。必须拆成 `onMessage` / `onError` 两个回调 |

另外有个不是坑但容易困惑的点：`/api/auth` 里我把 `email` 统一改成了 `account = email.trim()`，登录分支也跟着变了。**这是有意的**——发码时存的是 trim 过的邮箱，如果登录/注册不 trim，用户复制邮箱时多带一个空格就对不上。如果你原来的库里真有带空格的邮箱（基本不可能），需要先清洗数据。

---

## 10. 几个设计取舍

### 10.1 为什么注册即登录，而不是"验证后返回登录页"

注册成功后直接 `issueTokenPair`，用户少一次输入密码。代价是**邮箱真实性只靠验证码保证**，没有"激活"这一步。对这个项目够用；如果要做"未激活不能下单"，把 `User` 加个 `emailVerifiedAt` 字段，在 `requireUser` 里拦一下即可。

### 10.2 验证码为什么明文存

`EmailCode.code` 是明文。这在这里可接受，因为同时满足：5 分钟过期、一次性、5 次错误上限、6 位随机（crypto）。

**如果要更严**，把 `code` 换成 `codeHash`：

```ts
// 存的时候
const codeHash = crypto.createHash('sha256').update(`${email}:${code}`).digest('hex');
// 校验的时候用同样方式算一遍再比对
```

代价是你在数据库里再也看不到码，排查"用户说没收到"时只能重发。教学项目里明文更直观，所以我选了明文并在这里说明。

### 10.3 重置密码后，旧 access token 还有 15 分钟寿命

`refreshToken` 删了，但 access token 是无状态的，验签通过就放行，最多还能用 15 分钟。要彻底封死，给 `User` 加一个 `passwordChangedAt`，在 `requireUser` 里比对签发时间（第 11.1 节）。

### 10.4 前端为什么单独抽一个 `SendCodeButton`

注册和找回密码都要"发码 + 倒计时 + 错误提示"，逻辑完全一样。抽成组件后，`AuthModal` 里只是两处引用，倒计时状态也不会互相干扰（各自一份 state）。

---

## 11. 可选加固（不影响主流程，想深入再做）

### 11.1 让旧 access token 立刻失效

`apps/api/prisma/schema.prisma` 的 `User` 加一行：

```prisma
passwordChangedAt DateTime?
```

`apps/api/src/lib/auth.ts` 的 `requireUser` 里，查库那段改成：

```ts
const user = await prisma.user.findUnique({
  where: { id: payload.sub },
  select: { id: true, email: true, isAdmin: true, bannedAt: true, passwordChangedAt: true },
});

if (!user) return { ok: false, response: unauthorized('账号不存在') };
if (user.bannedAt) return { ok: false, response: banned('账号已被封禁') };

// 密码改过之后签发的旧 token 一律不认
if (
  user.passwordChangedAt &&
  payload.iat &&
  payload.iat * 1000 < user.passwordChangedAt.getTime()
) {
  return { ok: false, response: unauthorized('密码已修改，请重新登录') };
}
```

重置密码时顺手写 `passwordChangedAt: new Date()`。

### 11.2 给发码接口加 IP 限流

现在是"按邮箱限流"。有人换着邮箱刷，你还是会发信。生产环境在前面挂个 Nginx / Cloudflare 的 rate limit，或者按 `request.headers.get('x-forwarded-for')` 在内存里做个滑动窗口（单机可用，多机要上 Redis）。

### 11.3 密码哈希（重要但独立）

现在全项目密码是明文比对（`user.password !== password`），`schema.prisma` 里也写着"实际场景保存哈希加密密码"。这是个独立的大改动：老用户是明文、新用户是哈希，得做"登录时顺便升级"的迁移，不适合塞进这次改动里。

要做的话大致是：

```bash
pnpm --filter @toy-store/api add bcryptjs
pnpm --filter @toy-store/api add -D @types/bcryptjs
```

```ts
// 登录成功分支里，发现是明文就顺手升级成哈希
const isHashed = user.password.startsWith('$2');
const ok = isHashed ? await bcrypt.compare(password, user.password) : user.password === password;
if (!ok) return 401;

if (!isHashed) {
  await prisma.user.update({
    where: { id: user.id },
    data: { password: await bcrypt.hash(password, 10) },
  });
}
```

`register` 和 `reset-password` 里改成 `bcrypt.hash(newPassword, 10)` 再存。**注意**：这会让 `seed.ts` 里的明文密码也失效，需要一起改成哈希。

---

## 12. 已知未做（心里有数就行）

| 项 | 说明 |
| --- | --- |
| 密码哈希 | 见 11.3，独立改动 |
| IP 维度限流 | 现在只按邮箱限流 |
| 邮箱大小写归一 | 现在只 `trim()`，不 `toLowerCase()`。SQLite 的 `=` 区分大小写，`A@b.com` 和 `a@b.com` 会被当成两个邮箱。要统一得连历史数据一起改 |
| 管理员找回密码 | 管理员账号也能走 C 端找回，重置后用新密码去 `/admin/login` 登录即可，行为正确但路径有点绕 |
| 邮件模板多语言 / 品牌化 | 现在是内联 HTML，够用 |
