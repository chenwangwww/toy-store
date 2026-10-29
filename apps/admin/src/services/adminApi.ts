import type { Toy, ToyInput } from "@toy-store/shared";
import { API_BASE_URL } from "@/lib/api-base";

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

/** 后台接口客户端：直连纯后端服务 */
export const adminApi = {
  getToys: async (): Promise<Toy[]> => {
    const res = await fetch(`${API_BASE_URL}/api/admin/toys`);
    return parseResponse<Toy[]>(res, "获取失败");
  },

  createToy: async (data: ToyInput): Promise<Toy> => {
    const res = await fetch(`${API_BASE_URL}/api/admin/toys`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return parseResponse<Toy>(res, "创建失败");
  },

  updateToy: async (id: string, data: ToyInput): Promise<Toy> => {
    const res = await fetch(`${API_BASE_URL}/api/admin/toys/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return parseResponse<Toy>(res, "更新失败");
  },

  deleteToy: async (id: string): Promise<void> => {
    const res = await fetch(`${API_BASE_URL}/api/admin/toys/${id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      let message = "删除失败";
      try {
        const data = await res.json();
        if (data?.error) message = data.error;
      } catch {
        // 忽略非 JSON 响应体
      }
      throw new Error(message);
    }
  },

  login: async (email: string, password: string): Promise<{ success: boolean; user: unknown }> => {
    const res = await fetch(`${API_BASE_URL}/api/admin/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    return parseResponse<{ success: boolean; user: unknown }>(res, "登录失败");
  },
};
