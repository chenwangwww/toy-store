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
 * 登录态彻底失效时广播的事件名。
 *
 * 这里用 window 事件而不是模块级变量保存回调：Next dev 的 HMR 会重新加载本模块，
 * 模块级变量会被重置成 null，而组件里的 addEventListener 监听器不会丢。
 * 否则会出现「token 已经清掉、Redux 还认为登录着、界面永远卡在已登录」。
 */
export const AUTH_LOST_EVENT = 'toyland:auth-lost';

function notifyAuthLost() {
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event(AUTH_LOST_EVENT));
    }
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
    if (!refreshToken) {
        // 本地还有 access token 却没有 refresh token，说明状态已经不一致了。
        // 直接清干净并通知 UI 登出，否则界面会卡在"已登录"再也回不去。
        if (getAccessToken()) {
            clearTokens();
            notifyAuthLost();
        }
        return null;
    }

    try {
        const res = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken }),
        });

        if (!res.ok) {
            clearTokens();
            notifyAuthLost();
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