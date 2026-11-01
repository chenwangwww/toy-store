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

    // 角色标签：默认只看客户，管理员单独一个标签页
    const roleParam = searchParams.get('role')
    const role: 'all' | 'customer' | 'admin' =
        roleParam === 'admin' || roleParam === 'all' ? roleParam : 'customer'

    const where: Prisma.UserWhereInput = {}
    // 角色是"硬过滤"，只作用在当前标签页内，和搜索/状态条件是 AND 关系
    if (role === 'customer') where.isAdmin = false
    if (role === 'admin') where.isAdmin = true

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
        const [total, rows, customerCount, adminCount] = await Promise.all([
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
            }),
            // 两类账号的总数：不受当前搜索/状态条件影响，专门给标签栏角标用
            prisma.user.count({ where: { isAdmin: false } }),
            prisma.user.count({ where: { isAdmin: true } }),
        ])

        return NextResponse.json({
            items: rows.map(({ _count, ...user }) => ({ ...user, orderCount: _count.orders })),
            total,
            page,
            pageSize,
            counts: { customer: customerCount, admin: adminCount },
        })
    } catch (error) {
        console.error('[api/admin/users]', error);
        return NextResponse.json({ error: '获取用户列表失败' }, { status: 500 });
    }
}