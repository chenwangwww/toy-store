import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;

  const { id } = await params;

  try {
    const user = await prisma.user.findUnique({
      where: { id },
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
        _count: { select: { orders: true } },
        // 最近 10 笔订单，够详情页展示了
        orders: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          include: { items: { include: { toy: true } } },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: '用户不存在' }, { status: 404 });
    }

    // 累计消费单独聚合，避免把全部订单捞出来再求和
    const agg = await prisma.order.aggregate({
      where: { userId: id },
      _sum: { totalAmount: true },
    });

    const { _count, ...rest } = user;

    return NextResponse.json({
      ...rest,
      orderCount: _count.orders,
      totalSpent: agg._sum.totalAmount ?? 0,
    });
  } catch (error) {
    console.error('[api/admin/users/:id]', error);
    return NextResponse.json({ error: '获取用户详情失败' }, { status: 500 });
  }
}