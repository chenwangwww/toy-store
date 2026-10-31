import type {
  AdminUserDetail,
  AdminUserListItem,
  PaginatedResult,
  Toy,
  ToyInput,
} from "@toy-store/shared";
import { API_BASE_URL } from "@/lib/api-base";
import { authFetch, clearTokens, getRefreshToken, saveTokens } from "@/lib/auth-client";

/** 后台登录成功后的返回结构 */
export interface AdminAuthResponse {
  success: boolean;
  user: {
    id: string;
    username: string;
    email: string;
    isAdmin: boolean;
  };
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
}

async function parseResponse<T>(response: Response, fallbackMessage: string): Promise<T> {
  if (!response.ok) {
    let message = fallbackMessage;
    try {
      const data = await response.json();
      if (data?.error) message = data.error;
    } catch {
      // 忽略非 JSON 响应体
    }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

/** 后台接口客户端：直连纯后端服务，所有请求自动带 access token */
export const adminApi = {
  getToys: async (): Promise<Toy[]> => {
    const res = await authFetch('/api/admin/toys');
    return parseResponse<Toy[]>(res, '获取失败');
  },

  createToy: async (data: ToyInput): Promise<Toy> => {
    const res = await authFetch('/api/admin/toys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return parseResponse<Toy>(res, '创建失败');
  },

  updateToy: async (id: string, data: ToyInput): Promise<Toy> => {
    const res = await authFetch(`/api/admin/toys/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return parseResponse<Toy>(res, '更新失败');
  },

  deleteToy: async (id: string): Promise<void> => {
    const res = await authFetch(`/api/admin/toys/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      let message = '删除失败';
      try {
        const data = await res.json();
        if (data?.error) message = data.error;
      } catch {
        // 忽略非 JSON 响应体
      }
      throw new Error(message);
    }
  },

  login: async (email: string, password: string): Promise<AdminAuthResponse> => {
    const res = await authFetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await parseResponse<AdminAuthResponse>(res, '登录失败');
    // token 落本地，后续请求由 authFetch 自动带上
    saveTokens(data);
    return data;
  },

  getUsers: async (params: {
    page?: number;
    pageSize?: number;
    keyword?: string;
    status?: 'all' | 'active' | 'banned';
  } = {}): Promise<PaginatedResult<AdminUserListItem>> => {
    const qs = new URLSearchParams()
    if (params.page) qs.set('page', String(params.page));
    if (params.pageSize) qs.set('pageSize', String(params.pageSize));
    if (params.keyword) qs.set('keyword', params.keyword);
    if (params.status && params.status !== 'all') qs.set('status', params.status);

    const res = await authFetch(`/api/admin/users?${qs.toString()}`);
    return parseResponse<PaginatedResult<AdminUserListItem>>(res, '获取用户列表失败');
  },

  getUser: async (id: string): Promise<AdminUserDetail> => {
    const res = await authFetch(`/api/admin/users/${id}`);
    return parseResponse<AdminUserDetail>(res, '获取用户详情失败');
  },

  banUser: async (
    id: string,
    payload: { banned: boolean; reason?: string },
  ): Promise<AdminUserListItem> => {
    const res = await authFetch(`/api/admin/users/${id}/ban`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return parseResponse<AdminUserListItem>(res, '操作失败');
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
      // 网络失败也照样清本地
    }
    clearTokens();
  },
};
