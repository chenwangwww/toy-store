import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json();

    const user = await prisma.user.findUnique({ where: { email } });

    // 校验账号、密码，并且必须是 isAdmin === true
    if (!user || user.password !== password || !user.isAdmin) {
      return NextResponse.json({ error: '权限不足或账号密码错误' }, { status: 403 });
    }

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        isAdmin: user.isAdmin,
      },
    });
  } catch (error) {
    console.error('[api/admin/login]', error);
    return NextResponse.json({ error: '登录服务器异常' }, { status: 500 });
  }
}
