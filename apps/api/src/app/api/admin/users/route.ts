import { NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';

export async function GET(request: Request) {
    const auth = await requireAdmin(request)
    if (!auth.ok) return auth.response

    const { searchParams } = new URL(request.url)
    const page = Math.max(1, Number(searchParams.get('page')) || 1)
    const pageSize = Math.min(50, Math.max(1, Number(searchParams.get('pageSize')) || 10))

    const keyword = (searchParams.get('keyword') ?? '').trim()
    const status = searchParams.get('status') ?? 'all'
    const where: Prisma.UserWhereInput = {}

    if (keyword) {
        // SQLite 的 LIKE 对 ASCII 本身不区分大小写，这里直接 contains 即可
        where.OR = [
            { email: { contains: keyword } },
            { username: { contains: keyword } },
        ]
    }

    if (status === 'banned') where.bannedAt = { not: null }
    if (status === 'active') where.bannedAt = null;

    try {
        const [total, rows] = await Promise.all([
            prisma.user.count({ where }),
            prisma.user.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * pageSize,
                take: pageSize,
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
                }
            })
        ])

        return NextResponse.json({
            items: rows.map(({ _count, ...user }) => ({ ...user, orderCount: _count.orders })),
            total,
            page,
            pageSize,
        })
    } catch (error) {
        console.error('[api/admin/users]', error);
        return NextResponse.json({ error: '获取用户列表失败' }, { status: 500 });
    }
}