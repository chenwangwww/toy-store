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