import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// 查询用户订单
export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
        return NextResponse.json({ error: '缺少用户ID' }, { status: 400 });
    }

    try {
        const orders = await prisma.order.findMany({
            where: { userId },
            include: {
                items: {
                    include: { toy: true },
                },
            },
            orderBy: { createdAt: 'desc' },
        });
        return NextResponse.json(orders);
    } catch (error) {
        return NextResponse.json({ error: '查询订单失败' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json()
        const { userId, items, totalAmount } = body

        const newOrder = await prisma.$transaction(async (tx) => {
            const order = await tx.order.create({
                data: {
                    userId,
                    totalAmount,
                    status: 'PAID', // 模拟支付成功
                    items: {
                        create: items.map((item: { toy: { id: string; price: number }; quantity: number }) => ({
                            toyId: item.toy.id,
                            quantity: item.quantity,
                            price: item.toy.price,
                        })),
                    },
                },
                include: { items: true }
            })

            for (const item of items) {
                await tx.toy.update({
                    where: { id: item.toy.id },
                    data: {
                        stock: { decrement: item.quantity },
                        sales: { increment: item.quantity },
                    }
                })
            }
            return order
        })

        return NextResponse.json(newOrder)
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: '下单失败' }, { status: 500 });
    }
}