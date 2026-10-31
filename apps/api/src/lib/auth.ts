import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
    ACCESS_TOKEN_TTL,
    REFRESH_TOKEN_TTL,
    signAccessToken,
    signRefreshToken,
    verifyAccessToken,
    type AccessTokenPayload,
} from '@/lib/jwt';

export type AuthUser = {
    id: string;
    email: string;
    role: 'user' | 'admin';
};

/** 统一的 401：前端看到 code=UNAUTHORIZED 就去刷新 token */
export function unauthorized(message = '未登录或登录已过期') {
    return NextResponse.json({ error: message, code: 'UNAUTHORIZED' }, { status: 401 });
}

export function forbidden(message = '权限不足') {
    return NextResponse.json({ error: message, code: 'FORBIDDEN' }, { status: 403 });
}

/**
 * 账号被封禁。
 * 故意用 401 而不是 403：前端 authFetch 只在 401 时才会去刷新 token，
 * 刷新接口同样会返回 401，于是自动清空本地 token 并退出登录。
 */
export function banned(message = '账号已被封禁') {
    return NextResponse.json({
        error: message, code: 'ACCOUNT_BANNED'
    },
        {
            status: 401
        })
}

/** 从 Authorization: Bearer xxx 里取出并校验 access token */
export async function getAuthPayload(request: Request): Promise<AccessTokenPayload | null> {
    const header = request.headers.get('authorization') ?? '';
    const [scheme, token] = header.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token) return null;
    try {
        return await verifyAccessToken(token);
    } catch {
        return null;
    }
}

type AuthResult =
    | { ok: true; user: AuthUser }
    | { ok: false; response: NextResponse };

/** 需要登录的接口用这个 */
export async function requireUser(request: Request): Promise<AuthResult> {
    const payload = await getAuthPayload(request);
    if (!payload) return { ok: false, response: unauthorized() };

    // 每个请求都回查一次数据库：
    // 1) 用户被删除 → 立刻失效
    // 2) 用户被封禁 → 立刻踢下线（不用等 access token 过期）
    // 3) 角色以数据库为准 → 降权也能立刻生效
    const user = await prisma.user.findUnique({
        where: {id: payload.sub},
        select: {id:true, email: true, isAdmin:true, bannedAt: true}
    })

    if(!user) return{ok: false, response:unauthorized('账号不存在')}
    if(user.bannedAt) return {ok:false, response:banned('账号已被封禁')}
    return {
        ok: true,
        user: { id: user.id, email: user.email, role: user.isAdmin ? 'admin' : 'user' },
    };
}

/** 需要管理员权限的接口用这个 */
export async function requireAdmin(request: Request): Promise<AuthResult> {
    const result = await requireUser(request);
    if (!result.ok) return result;
    if (result.user.role !== 'admin') {
        return { ok: false, response: forbidden('需要管理员权限') };
    }
    return result;
}

export interface TokenPair {
    accessToken: string;
    refreshToken: string;
    tokenType: 'Bearer';
    expiresIn: number;
}

/** 签发一对 token，并把 refresh token 的 jti 落库 */
export async function issueTokenPair(user: {
    id: string;
    email: string;
    isAdmin: boolean;
}): Promise<TokenPair> {
    const jti = crypto.randomUUID();

    const [accessToken, refreshToken] = await Promise.all([
        signAccessToken(user),
        signRefreshToken(user.id, jti),
    ]);

    await prisma.refreshToken.create({
        data: {
            id: jti,
            userId: user.id,
            expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL * 1000),
        },
    });

    return { accessToken, refreshToken, tokenType: 'Bearer', expiresIn: ACCESS_TOKEN_TTL };
}