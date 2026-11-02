import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';

/** 带 HTTP 状态码的业务异常，让事务里能直接中断并给出可读提示 */
class OrderError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'OrderError';
  }
}

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
    // userId 一律取自 token，绝不信任请求体里的 userId
    const userId = auth.user.id;

    const rawItems: unknown[] = Array.isArray(body?.items) ? body.items : [];
    if (rawItems.length === 0) {
      return NextResponse.json({ error: '购物车是空的' }, { status: 400 });
    }

    // 只认 toyId 和 quantity。价格、商品名一律以数据库为准，
    // 前端传过来的 toy.price 只在「加入购物车」时用于展示，不能作为结算依据。
    const merged = new Map<string, number>();
    for (const raw of rawItems) {
      const item = raw as { toy?: { id?: unknown }; quantity?: unknown };
      const toyId = typeof item?.toy?.id === 'string' ? item.toy.id : '';
      const quantity = Number(item?.quantity);

      if (!toyId) {
        return NextResponse.json({ error: '商品参数不合法' }, { status: 400 });
      }
      if (!Number.isInteger(quantity) || quantity <= 0) {
        return NextResponse.json({ error: '商品数量必须是正整数' }, { status: 400 });
      }
      // 同一个商品出现多次要合并，否则库存会被按行重复校验，可能超卖
      merged.set(toyId, (merged.get(toyId) ?? 0) + quantity);
    }

    const clientTotal = Number(body?.totalAmount);
    const hasClientTotal = Number.isFinite(clientTotal);

    const newOrder = await prisma.$transaction(async (tx) => {
      const toys = await tx.toy.findMany({
        where: { id: { in: [...merged.keys()] } },
        select: { id: true, name: true, price: true, stock: true },
      });
      const toyMap = new Map(toys.map((toy) => [toy.id, toy]));

      let totalAmount = 0;
      for (const [toyId, quantity] of merged) {
        const toy = toyMap.get(toyId);
        if (!toy) throw new OrderError('商品不存在或已下架', 400);
        if (toy.stock < quantity) {
          throw new OrderError(`「${toy.name}」库存不足，仅剩 ${toy.stock} 件`, 409);
        }
        totalAmount += toy.price * quantity;
      }

      // 前端算的金额和数据库对不上，说明价格已变动，让用户刷新购物车再下单
      if (hasClientTotal && Math.abs(clientTotal - totalAmount) > 0.01) {
        throw new OrderError('商品价格已变动，请刷新购物车后重新下单', 409);
      }

      const order = await tx.order.create({
        data: {
          userId,
          totalAmount,
          status: 'PAID', // 模拟支付成功
          items: {
            create: [...merged].map(([toyId, quantity]) => ({
              toyId,
              quantity,
              price: toyMap.get(toyId)!.price, // 快照下单时的价格，商品调价后历史订单不受影响
            })),
          },
        },
        include: { items: { include: { toy: true } } },
      });

      for (const [toyId, quantity] of merged) {
        await tx.toy.update({
          where: { id: toyId },
          data: {
            stock: { decrement: quantity },
            sales: { increment: quantity },
          },
        });
      }

      return order;
    });

    return NextResponse.json(newOrder);
  } catch (error) {
    if (error instanceof OrderError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[api/orders]', error);
    return NextResponse.json({ error: '下单失败' }, { status: 500 });
  }
}
