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