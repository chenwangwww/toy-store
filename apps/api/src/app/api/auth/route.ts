import { NextResponse } from 'next/server';
import type { User } from '@prisma/client';
import { prisma } from '@/lib/prisma';

/** 对外返回用户信息时一定要去掉密码等敏感字段 */
function toPublicUser(user: User) {
    return {
        id: user.id,
        username: user.username,
        email: user.email,
        phone: user.phone,
        avatar: user.avatar,
        isAdmin: user.isAdmin,
        createdAt: user.createdAt,
    };
}

export async function POST(request: Request) {
    try {
        const { action, email, password, username } = await request.json();

        if (!email || !password) {
            return NextResponse.json({ error: '邮箱和密码不能为空' }, { status: 400 });
        }

        if (action === 'register') {
            const existingUser = await prisma.user.findUnique({ where: { email } });
            if (existingUser) {
                return NextResponse.json({ error: '邮箱已被注册' }, { status: 400 });
            }
            const newUser = await prisma.user.create({
                data: {
                    email,
                    password, // 生产环境请使用 bcrypt 加密
                    username: username || email.split('@')[0],
                    avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${email}`,
                    isAdmin: false,
                },
            });
            return NextResponse.json(toPublicUser(newUser));
        }

        if (action === 'login') {
            const user = await prisma.user.findUnique({ where: { email } });
            if (!user || user.password !== password) {
                return NextResponse.json({ error: '账号或密码错误' }, { status: 401 });
            }
            if (user.isAdmin) {
                return NextResponse.json(
                    {error: '该账号为管理员账号，请前往管理后台登录'},
                    {status: 403}
                )
            }
            return NextResponse.json(toPublicUser(user));
        }

        return NextResponse.json({ error: '非法操作' }, { status: 400 });
    } catch (error) {
        console.error('[api/auth]', error);
        return NextResponse.json({ error: '服务器错误' }, { status: 500 });
    }
}
