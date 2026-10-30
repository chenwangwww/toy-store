import { SignJWT, jwtVerify, type JWTPayload } from "jose";

const ISSUER = 'toyland'
const AUDIENCE = 'toyland-client'

export const ACCESS_TOKEN_TTL = 15 * 60
export const REFRESH_TOKEN_TTL = 7 * 24 * 60 * 60

function getSecret(name: 'JWT_ACCESS_SECRET' | 'JWT_REFRESH_SECRET'): Uint8Array {
    const value = process.env[name]
    if (!value || value.length < 32) {
        throw new Error(`[jwt] 环境变量 ${name} 未配置或长度不足 32 位`)
    }
    return new TextEncoder().encode(value)
}

export type TokenRole = 'user' | 'admin'

export interface AccessTokenPayload extends JWTPayload {
    sub: string;
    email: string;
    role: TokenRole;
    type: 'access'
}

export interface RefreshTokenPayload extends JWTPayload {
    sub: string;
    jti: string;
    type: 'refresh'
}

export async function signAccessToken(user: {
    id: string;
    email: string;
    isAdmin: boolean;
}): Promise<string> {
    return new SignJWT({
        email: user.email,
        role: user.isAdmin ? 'admin' : 'user',
        type: 'access',
    }).setProtectedHeader({ alg: 'HS256' })
        .setSubject(user.id)
        .setIssuer(ISSUER)
        .setAudience(AUDIENCE)
        .setIssuedAt()
        .setExpirationTime(`${ACCESS_TOKEN_TTL}s`)
        .sign(getSecret('JWT_ACCESS_SECRET'))
}

export async function signRefreshToken(userId: string, jti: string): Promise<string> {
    return new SignJWT({ type: 'refresh' })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject(userId)
        .setJti(jti)
        .setIssuer(ISSUER)
        .setAudience(AUDIENCE)
        .setIssuedAt()
        .setExpirationTime(`${REFRESH_TOKEN_TTL}s`)
        .sign(getSecret('JWT_REFRESH_SECRET'));
}

/** 校验 access token，失败抛异常 */
export async function verifyAccessToken(token: string): Promise<AccessTokenPayload> {
    const { payload } = await jwtVerify<AccessTokenPayload>(
        token,
        getSecret('JWT_ACCESS_SECRET'),
        { issuer: ISSUER, audience: AUDIENCE },
    );
    if (payload.type !== 'access') throw new Error('token 类型不匹配')
    return payload
}

/** 校验 refresh token，失败抛异常 */
export async function verifyRefreshToken(token: string): Promise<RefreshTokenPayload> {
  const { payload } = await jwtVerify<RefreshTokenPayload>(
    token,
    getSecret('JWT_REFRESH_SECRET'),
    { issuer: ISSUER, audience: AUDIENCE },
  );
  if (payload.type !== 'refresh') throw new Error('token 类型不匹配');
  return payload;
}