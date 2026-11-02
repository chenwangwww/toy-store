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