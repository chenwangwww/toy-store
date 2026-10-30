import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';

// 查询当前登录用户的订单
export async function GET(request: Request) {
  const auth = await requireUser(request);
  if (!auth.ok) return auth.response;

  try {
    const orders = await prisma.order.findMany({
      where: { userId: auth.user.id },
      include: {
        items: { include: { toy: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(orders);
  } catch {
    return NextResponse.json({ error: '查询订单失败' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireUser(request);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const { items, totalAmount } = body;
    // userId 一律取自 token，绝不信任请求体里的 userId
    const userId = auth.user.id;

    const newOrder = await prisma.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          userId,
          totalAmount,
          status: 'PAID', // 模拟支付成功
          items: {
            create: items.map(
              (item: { toy: { id: string; price: number }; quantity: number }) => ({
                toyId: item.toy.id,
                quantity: item.quantity,
                price: item.toy.price,
              }),
            ),
          },
        },
        include: { items: true },
      });

      for (const item of items) {
        await tx.toy.update({
          where: { id: item.toy.id },
          data: {
            stock: { decrement: item.quantity },
            sales: { increment: item.quantity },
          },
        });
      }

      return order;
    });

    return NextResponse.json(newOrder);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: '下单失败' }, { status: 500 });
  }
}