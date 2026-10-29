import { NextResponse } from "next/server";
import {prisma} from '@/lib/prisma'

export async function GET(request: Request) {
    const {searchParams} = new URL(request.url)
    const category = searchParams.get('category')

    try {
        const whereCondition = category && category !== 'all' ? {category} : {}
        const toys = await prisma.toy.findMany({
            where: whereCondition,
            orderBy: {createdAt: 'desc'}
        })
        return NextResponse.json(toys)
    } catch(error) {
        return NextResponse.json({error: '获取玩具列表失败'}, {status: 500})
    }
}