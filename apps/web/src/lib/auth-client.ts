import { API_BASE_URL } from '@/lib/api-base';

const ACCESS_TOKEN_KEY = 'toyland_access_token';
const REFRESH_TOKEN_KEY = 'toyland_refresh_token';

export function getAccessToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function saveTokens(tokens: { accessToken: string; refreshToken: string }) {
    localStorage.setItem(ACCESS_TOKEN_KEY, tokens.accessToken);
    localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
}

export function clearTokens() {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
}

/**
 * 登录态彻底失效时的回调。
 * 由 Providers 注册，用来把 Redux 里的用户信息也清掉——
 * 否则 localStorage 清了但界面还显示"已登录"，得手动刷新页面才正常。
 */
let authLostHandler: (() => void) | null = null;

export function setAuthLostHandler(handler: (() => void) | null) {
    authLostHandler = handler;
}

/** 多个请求同时 401 时，只发一次刷新请求（单飞） */
let refreshPromise: Promise<string | null> | null = null;

export function refreshAccessToken(): Promise<string | null> {
    if (!refreshPromise) {
        refreshPromise = doRefresh().finally(() => {
            refreshPromise = null;
        });
    }
    return refreshPromise;
}

async function doRefresh(): Promise<string | null> {
    const refreshToken = getRefreshToken();
    if (!refreshToken) return null;

    try {
        const res = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken }),
        });

        if (!res.ok) {
            clearTokens();
            authLostHandler?.();
            return null;
        }

        const data = await res.json();
        saveTokens(data);
        return data.accessToken as string;
    } catch {
        return null;
    }
}

/**
 * 需要登录的请求统一走这里：
 * 自动带 Authorization 头，401 时自动刷新一次并重放原请求。
 */
export async function authFetch(path: string, init: RequestInit = {}): Promise<Response> {
    const send = (token: string | null) => {
        const headers: Record<string, string> = {
            ...((init.headers as Record<string, string> | undefined) ?? {}),
        };
        if (token) headers.Authorization = `Bearer ${token}`;
        return fetch(`${API_BASE_URL}${path}`, { ...init, headers });
    };

    const res = await send(getAccessToken());
    if (res.status !== 401) return res;

    const newToken = await refreshAccessToken();
    if (!newToken) return res;
    return send(newToken);
}