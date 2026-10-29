import { NextResponse } from "next/server";
import { prisma } from '@/lib/prisma'

export async function GET() {
    try {
        const toys = await prisma.toy.findMany({
            orderBy: { createdAt: 'desc' }
        })
        return NextResponse.json(toys)
    } catch (error) {
        return NextResponse.json({ error: '获取玩具列表失败' }, { status: 500 })
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json()
        const { name, price, originalPrice, category, ageRange, stock, image, description } = body
        const newToy = await prisma.toy.create({
            data: {
                name,
                price: Number(price),
                originalPrice: originalPrice ? Number(originalPrice) : null,
                category,
                ageRange,
                stock: Number(stock) || 100,
                image,
                description,
            },
        });
        return NextResponse.json(newToy)
    }catch(error) {
        return NextResponse.json({error: '添加玩具失败'}, {status: 500})
    }
}