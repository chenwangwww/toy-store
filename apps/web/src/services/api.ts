import type { AuthPayload, EmailCodePurpose, Order, Toy, User } from '@toy-store/shared';
import { API_BASE_URL } from '@/lib/api-base';
import { authFetch, clearTokens, getRefreshToken, saveTokens } from '@/lib/auth-client';

/** 登录 / 注册成功后的返回结构 */
export interface AuthResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
}

/** 发验证码的返回结构（devCode 只会在本地没配 SMTP 时出现） */
export interface SendCodeResponse {
  success: boolean;
  message: string;
  cooldown: number;
  devCode?: string;
}

async function parseResponse<T>(response: Response, fallbackMessage: string): Promise<T> {
  if (!response.ok) {
    let message = fallbackMessage;
    try {
      const data = await response.json();
      if (data?.error) message = data.error;
    } catch {
      // 响应体不是 JSON 时忽略，使用兜底文案
    }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

export const api = {
  // 公开接口：不需要 token
  getToys: async (category?: string): Promise<Toy[]> => {
    const query =
      category && category !== 'all' ? `?category=${encodeURIComponent(category)}` : '';
    const res = await fetch(`${API_BASE_URL}/api/toys${query}`);
    return parseResponse<Toy[]>(res, '获取商品失败');
  },

  getToyById: async (id: string): Promise<Toy> => {
    const res = await fetch(`${API_BASE_URL}/api/toys/${id}`);
    return parseResponse<Toy>(res, '获取详情失败');
  },

  // 需要登录的接口：全部走 authFetch
  createOrder: async (
    items: { toy: Toy; quantity: number }[],
    totalAmount: number,
  ): Promise<Order> => {
    const res = await authFetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items, totalAmount }),
    });
    return parseResponse<Order>(res, '下单失败');
  },

  getOrders: async (): Promise<Order[]> => {
    const res = await authFetch('/api/orders');
    return parseResponse<Order[]>(res, '获取订单失败');
  },

  // 认证
  auth: async (payload: AuthPayload): Promise<AuthResponse> => {
    const res = await fetch(`${API_BASE_URL}/api/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await parseResponse<AuthResponse>(res, '认证失败');
    saveTokens(data);
    return data;
  },

  /** 发送邮箱验证码：注册和找回密码共用，靠 purpose 区分 */
  sendEmailCode: async (payload: {
    email: string;
    purpose: EmailCodePurpose;
  }): Promise<SendCodeResponse> => {
    const res = await fetch(`${API_BASE_URL}/api/auth/email-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return parseResponse<SendCodeResponse>(res, '验证码发送失败');
  },

  /** 用邮箱验证码重置密码：不需要登录态 */
  resetPassword: async (payload: {
    email: string;
    code: string;
    newPassword: string;
  }): Promise<{ success: boolean; message: string }> => {
    const res = await fetch(`${API_BASE_URL}/api/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return parseResponse<{ success: boolean; message: string }>(res, '重置密码失败');
  },

  /** 刷新页面后用本地 token 恢复登录态（access 过期会自动刷新） */
  me: async (): Promise<User> => {
    const res = await authFetch('/api/auth/me');
    return parseResponse<User>(res, '获取用户信息失败');
  },

  /** 退出登录：吊销服务端 refresh token + 清本地 */
  logout: async (): Promise<void> => {
    const refreshToken = getRefreshToken();
    try {
      await fetch(`${API_BASE_URL}/api/auth/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
    } catch {
      // 网络失败也照样清本地，不影响用户退出
    }
    clearTokens();
  },
};