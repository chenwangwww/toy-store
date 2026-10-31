import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';
import { toAdminUser } from '@/lib/user';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;

  const { id } = await params;

  try {
    const body = await request.json();
    const { banned, reason } = body as { banned?: boolean; reason?: string };

    if (typeof banned !== 'boolean') {
      return NextResponse.json({ error: '参数 banned 必须是布尔值' }, { status: 400 });
    }

    // 不能封自己
    if (id === auth.user.id) {
      return NextResponse.json({ error: '不能封禁自己的账号' }, { status: 400 });
    }

    const target = await prisma.user.findUnique({
      where: { id },
      select: { id: true, isAdmin: true },
    });

    if (!target) {
      return NextResponse.json({ error: '用户不存在' }, { status: 404 });
    }

    // 管理员账号一律不允许封禁，避免把后台锁死
    if (target.isAdmin) {
      return NextResponse.json({ error: '不能封禁管理员账号' }, { status: 400 });
    }

    const updated = await prisma.user.update({
      where: { id },
      data: banned
        ? { bannedAt: new Date(), bannedReason: reason?.trim() || null }
        : { bannedAt: null, bannedReason: null },
      select: {
        id: true,
        username: true,
        email: true,
        phone: true,
        avatar: true,
        isAdmin: true,
        bannedAt: true,
        bannedReason: true,
        createdAt: true,
      },
    });

    // 关键：立刻作废该用户所有 refresh token，让他连刷新都做不到
    if (banned) {
      await prisma.refreshToken.deleteMany({ where: { userId: id } });
    }

    return NextResponse.json(toAdminUser(updated));
  } catch (error) {
    console.error('[api/admin/users/:id/ban]', error);
    return NextResponse.json({ error: '操作失败' }, { status: 500 });
  }
}