import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;

  try {
    const toys = await prisma.toy.findMany({ orderBy: { createdAt: 'desc' } });
    return NextResponse.json(toys);
  } catch {
    return NextResponse.json({ error: '获取玩具列表失败' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const { name, price, originalPrice, category, ageRange, stock, image, description } = body;

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
    return NextResponse.json(newToy);
  } catch {
    return NextResponse.json({ error: '添加玩具失败' }, { status: 500 });
  }
}