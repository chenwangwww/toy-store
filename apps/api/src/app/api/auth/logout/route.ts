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