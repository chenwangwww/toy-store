import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(request: Request) {
    try {
        const { action, email, password, username } = await request.json()
        if (action === 'register') {
            let existingUser = await prisma.user.findUnique({ where: { email } })
            if (existingUser) {
                return NextResponse.json({ error: '邮箱已被注册' }, { status: 400 })
            }
            const newUser = await prisma.user.create({
                data: {
                    email,
                    password, // 生产环境请使用 bcrypt 加密
                    username: username || email.split('@')[0],
                    avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${email}`,
                }
            })
            return NextResponse.json(newUser)
        }
        if (action === 'login') {
            const user = await prisma.user.findUnique({where: {email}})
            if (!user || user.password !== password) {
                return NextResponse.json({ error: '账号或密码错误' }, { status: 401 });
            }

            return NextResponse.json(user);
        }
        return NextResponse.json({ error: '非法操作' }, { status: 400 });
    } catch (error) {
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}