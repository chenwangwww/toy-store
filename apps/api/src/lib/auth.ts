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
  return {
    ok: true,
    user: { id: payload.sub, email: payload.email, role: payload.role },
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