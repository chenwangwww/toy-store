import { NextResponse } from "next/server";
import {prisma} from '@/lib/prisma'

export async function GET(
    request: Request,
    {params}: {params: Promise<{id: string}>}
) {
    try {
        const resolvedParams = await params;
        const {id} = resolvedParams
        const toy = await prisma.toy.findUnique({
            where: {id}
        })

        if(!toy){
            return NextResponse.json({error: '未找到该商品'}, {status: 404})
        }
        return NextResponse.json(toy)
    }catch(error) {
        return NextResponse.json({error: '获取商品详情失败'}, {status: 500})
    }

}