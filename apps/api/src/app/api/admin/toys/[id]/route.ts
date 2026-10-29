import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function PUT(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params
        const body = await request.json()
        const { name, price, originalPrice, category, ageRange, stock, image, description } = body;

        const updateToy = await prisma.toy.update({
            where: { id },
            data: {
                name,
                price: Number(price),
                originalPrice: originalPrice ? Number(originalPrice) : null,
                category,
                ageRange,
                stock: Number(stock),
                image,
                description,
            }
        })

        return NextResponse.json(updateToy)
    } catch(error){
        return NextResponse.json({ error: '更新玩具失败' }, { status: 500 });
    }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    // 先删除关联的订单明细，防止外键冲突
    await prisma.orderItem.deleteMany({ where: { toyId: id } });
    
    // 删除玩具
    await prisma.toy.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: '删除玩具失败' }, { status: 500 });
  }
}