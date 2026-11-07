import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';
import { isOrderStatus } from '@/lib/order-status';

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

export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> },
) {
    const auth = await requireAdmin(request);
    if (!auth.ok) return auth.response;

    // Next 16 的 params 是 Promise，必须 await
    const { id } = await params;

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: '请求体不是合法 JSON' }, { status: 400 });
    }

    const status = (body as { status?: unknown } | null)?.status;
    if (!isOrderStatus(status)) {
        return NextResponse.json({ error: '订单状态不合法' }, { status: 400 });
    }

    try {
        const updated = await prisma.$transaction(async (tx) => {
            const order = await tx.order.findUnique({
                where: { id },
                include: { items: true },
            });

            if (!order) throw new OrderError('订单不存在', 404);

            // 状态没变就直接返回，绝不能再动一次库存
            if (order.status === status) {
                return tx.order.findUnique({
                    where: { id },
                    include: {
                        user: { select: { id: true, username: true, email: true } },
                        items: { include: { toy: { select: { id: true, name: true, image: true } } } },
                    },
                });
            }

            const wasCancelled = order.status === 'CANCELLED';
            const willCancel = status === 'CANCELLED';

            if (!wasCancelled && willCancel) {
                // 改成「已取消」：货退回来了，库存加回去、销量减回去
                for (const item of order.items) {
                    await tx.toy.update({
                        where: { id: item.toyId },
                        data: {
                            stock: { increment: item.quantity },
                            sales: { decrement: item.quantity },
                        },
                    });
                }
            } else if (wasCancelled && !willCancel) {
                // 从「已取消」改回其他状态：重新占用库存。
                // 先整体检查够不够，不够就整单拒绝，避免扣到一半失败留下脏数据
                for (const item of order.items) {
                    const toy = await tx.toy.findUnique({
                        where: { id: item.toyId },
                        select: { stock: true, name: true },
                    });
                    if (!toy) throw new OrderError('订单中的商品已被删除，无法恢复该订单', 409);
                    if (toy.stock < item.quantity) {
                        throw new OrderError(
                            `「${toy.name}」库存不足（剩 ${toy.stock} 件），无法恢复该订单`,
                            409,
                        );
                    }
                }

                for (const item of order.items) {
                    await tx.toy.update({
                        where: { id: item.toyId },
                        data: {
                            stock: { decrement: item.quantity },
                            sales: { increment: item.quantity },
                        },
                    });
                }
            }

            return tx.order.update({
                where: { id },
                data: { status },
                include: {
                    user: { select: { id: true, username: true, email: true } },
                    items: { include: { toy: { select: { id: true, name: true, image: true } } } },
                },
            });
        });

        if (!updated) throw new OrderError('订单不存在', 404);

        return NextResponse.json({
            id: updated.id,
            userId: updated.userId,
            totalAmount: updated.totalAmount,
            status: updated.status,
            createdAt: updated.createdAt,
            itemCount: updated.items.reduce((sum, item) => sum + item.quantity, 0),
            user: updated.user,
            items: updated.items.map((item) => ({
                id: item.id,
                toyId: item.toyId,
                quantity: item.quantity,
                price: item.price,
                toy: item.toy,
            })),
        });
    } catch (error) {
        if (error instanceof OrderError) {
            return NextResponse.json({ error: error.message }, { status: error.status });
        }
        console.error('[api/admin/orders/:id]', error);
        return NextResponse.json({ error: '更新订单状态失败' }, { status: 500 });
    }
}