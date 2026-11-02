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