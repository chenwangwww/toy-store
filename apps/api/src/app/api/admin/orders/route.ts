import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from '@/lib/prisma'
import { requireAdmin } from "@/lib/auth";
import { ORDER_STATUSES, isOrderStatus } from '@/lib/order-status';

export async function GET(request: Request) {
    const auth = await requireAdmin(request)
    if (!auth.ok) {
        return auth.response
    }

    const { searchParams } = new URL(request.url)
    const page = Math.max(1, Number(searchParams.get('page')) || 1)
    const pageSize = Math.min(50, Math.max(1, Number(searchParams.get('pageSize')) || 10));

    const email = (searchParams.get('email') ?? '').trim()
    const statusParam = searchParams.get('status') ?? 'all'
    const status = isOrderStatus(statusParam) ? statusParam : 'all'

    // 只含邮箱条件的 where：专门给状态角标做统计。
    // 状态筛选不能进这里，否则点「已支付」后其他角标全变 0。
    const scopeWhere: Prisma.OrderWhereInput = {};
    if (email) {
        // 模糊匹配：管理员通常记不住完整邮箱
        scopeWhere.user = { email: { contains: email } };
    }

    // 列表查询用的 where：邮箱 + 状态
    const where: Prisma.OrderWhereInput = { ...scopeWhere };
    if (status !== 'all') where.status = status;

    try {
        const [total, rows, grouped] = await Promise.all([
            prisma.order.count({ where }),
            prisma.order.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * pageSize,
                take: pageSize,
                include: {
                    user: { select: { id: true, username: true, email: true } },
                    items: {
                        include: {
                            toy: {
                                select: { id: true, name: true, image: true }
                            }
                        }
                    }
                }
            }),

            prisma.order.groupBy({
                by: ['status'],
                where: scopeWhere,
                _count: { _all: true },
            })
        ]);

        // 先把 5 个状态都填 0：某个状态一单都没有时，角标不能是 undefined
        const counts: Record<string, number> = {}
        ORDER_STATUSES.forEach((value) => {
            counts[value] = 0
        })

        let allCount = 0
        grouped.forEach((row) => {
            counts[row.status] = row._count._all
            allCount += row._count._all
        })
        counts.all = allCount
        return NextResponse.json({
            items: rows.map((order) => ({
                id: order.id,
                userId: order.userId,
                totalAmount: order.totalAmount,
                status: order.status,
                createdAt: order.createdAt,
                itemCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
                user: order.user,
                items: order.items.map((item) => ({
                    id: item.id,
                    toyId: item.toyId,
                    quantity: item.quantity,
                    price: item.price,
                    toy: item.toy,
                })),
            })),
            total,
            page,
            pageSize,
            counts,
        });
    } catch (error) {
        console.error('[api/admin/orders]', error);
        return NextResponse.json({ error: '获取订单列表失败' }, { status: 500 });
    }

}