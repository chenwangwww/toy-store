import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { issueTokenPair } from '@/lib/auth';
import { toPublicUser } from '@/lib/user';
import { hashPassword, isHashed, verifyPassword } from '@/lib/password';

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json();

    const user = await prisma.user.findUnique({ where: { email } });

    // 校验账号、密码，并且必须是 isAdmin === true
    if (!user || !(await verifyPassword(String(password), user.password)) || !user.isAdmin) {
      return NextResponse.json({ error: '权限不足或账号密码错误' }, { status: 403 });
    }

    // 老库里可能还留着明文密码，登录成功时顺手升级成哈希
    if (!isHashed(user.password)) {
      await prisma.user.update({
        where: { id: user.id },
        data: { password: await hashPassword(String(password)) },
      });
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