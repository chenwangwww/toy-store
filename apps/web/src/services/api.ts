import type { AuthPayload, Order, Toy, User } from "@toy-store/shared";
import { API_BASE_URL } from "@/lib/api-base";

/** 统一处理响应：失败时优先使用后端返回的 error 文案 */
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
  getToys: async (category?: string): Promise<Toy[]> => {
    const query = category && category !== "all" ? `?category=${encodeURIComponent(category)}` : "";
    const res = await fetch(`${API_BASE_URL}/api/toys${query}`);
    return parseResponse<Toy[]>(res, "获取商品失败");
  },

  getToyById: async (id: string): Promise<Toy> => {
    const res = await fetch(`${API_BASE_URL}/api/toys/${id}`);
    return parseResponse<Toy>(res, "获取详情失败");
  },

  createOrder: async (
    userId: string,
    items: { toy: Toy; quantity: number }[],
    totalAmount: number,
  ): Promise<Order> => {
    const res = await fetch(`${API_BASE_URL}/api/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, items, totalAmount }),
    });
    return parseResponse<Order>(res, "下单失败");
  },

  getOrders: async (userId: string): Promise<Order[]> => {
    const res = await fetch(`${API_BASE_URL}/api/orders?userId=${encodeURIComponent(userId)}`);
    return parseResponse<Order[]>(res, "获取订单失败");
  },

  auth: async (payload: AuthPayload): Promise<User> => {
    const res = await fetch(`${API_BASE_URL}/api/auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return parseResponse<User>(res, "认证失败");
  },
};
