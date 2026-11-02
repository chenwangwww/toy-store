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