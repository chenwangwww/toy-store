import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { toPublicUser } from '@/lib/user';

export async function GET(request: Request) {
  const auth = await requireUser(request);
  if (!auth.ok) return auth.response;

  const user = await prisma.user.findUnique({ where: { id: auth.user.id } });
  if (!user) {
    return NextResponse.json({ error: '用户不存在', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  return NextResponse.json(toPublicUser(user));
}