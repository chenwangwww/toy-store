"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useAppSelector, useAppDispatch } from "@/store/hooks";
import { logout } from "@/store/authSlice";
import { api } from "@/services/api";
import { useHydrated } from "@/lib/use-hydrated";
import type { Order, OrderStatus } from "@toy-store/shared";
import { Package, LogOut } from "lucide-react";

/** 订单状态的中文展示，避免直接把 PAID 这种枚举值甩给用户 */
const STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING: "待支付",
  PAID: "已支付",
  SHIPPED: "已发货",
  COMPLETED: "已完成",
  CANCELLED: "已取消",
};

/** 不同状态配不同底色，扫一眼就知道哪些单还没走完 */
const STATUS_STYLE: Record<OrderStatus, string> = {
  PENDING: "bg-amber-100 text-amber-700",
  PAID: "bg-emerald-100 text-emerald-700",
  SHIPPED: "bg-sky-100 text-sky-700",
  COMPLETED: "bg-gray-100 text-gray-600",
  CANCELLED: "bg-red-100 text-red-600",
};

export default function ProfilePage() {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const { user, isAuthenticated, initialized } = useAppSelector((state) => state.auth);
  // 服务端渲染的一定是占位态；客户端页面边界水合时也必须渲染同样的占位态，
  // 否则会撞上"服务端有 div、客户端是 null"的 hydration mismatch
  const hydrated = useHydrated();

  // 必须等首次登录态恢复完成再判断，否则刷新页面时 Redux 还是空的，
  // 会在 api.me() 返回之前就被误判成未登录、直接踢回首页
  useEffect(() => {
    if (initialized && !isAuthenticated) router.replace("/");
  }, [initialized, isAuthenticated, router]);

  const { data: orders = [], isLoading } = useQuery<Order[]>({
    queryKey: ["orders", user?.id],
    queryFn: () => api.getOrders(),
    enabled: Boolean(user?.id),
    // 全局 staleTime 是 5 分钟，但订单是"随时可能变"的数据（下单、发货、取消）。
    // 这里单独设 0：每次进页面都重新拉一次，避免看到过期列表。
    staleTime: 0,
  });

  if (!hydrated || !initialized) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-20 text-center text-sm text-gray-400">
        正在恢复登录状态...
      </div>
    );
  }

  if (!isAuthenticated || !user) return null;

  return (
    <div className="max-w-7xl mx-auto px-4 py-10">
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        <div className="bg-white p-6 rounded-3xl border border-pink-100 shadow-sm h-fit space-y-6">
          <div className="flex items-center gap-4">
            <img
              src={user.avatar || "https://api.dicebear.com/7.x/bottts/svg?seed=default"}
              alt="avatar"
              className="w-16 h-16 rounded-full bg-pink-50 border-2 border-pink-200"
            />
            <div>
              <h2 className="font-bold text-lg text-gray-900">{user.username}</h2>
              <span className="text-xs text-gray-400">{user.email}</span>
            </div>
          </div>
          <button
            onClick={async () => {
              await api.logout();
              dispatch(logout());
              router.push("/");
            }}
            className="w-full py-2.5 rounded-xl bg-red-50 text-red-600 font-bold hover:bg-red-100 transition flex items-center justify-center gap-2 text-sm"
          >
            <LogOut className="w-4 h-4" /> 退出登录
          </button>
        </div>

        <div className="lg:col-span-3 space-y-6">
          <div className="bg-white p-6 rounded-3xl border border-pink-100 shadow-sm">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <Package className="w-5 h-5 text-pink-600" /> 我的订单记录 ({orders.length})
            </h2>
            {isLoading ? (
              <p className="text-gray-400 text-sm py-8 text-center">订单加载中...</p>
            ) : orders.length === 0 ? (
              <p className="text-gray-400 text-sm py-8 text-center">暂无历史订单</p>
            ) : (
              <div className="space-y-4">
                {orders.map((order) => {
                  const totalQuantity = order.items.reduce((sum, item) => sum + item.quantity, 0);

                  return (
                    <div
                      key={order.id}
                      className="rounded-2xl border border-pink-50 bg-pink-50/20 overflow-hidden"
                    >
                      {/* 订单头：状态、单号、时间、总额 */}
                      <div className="p-4 flex flex-col sm:flex-row justify-between gap-4">
                        <div>
                          <span
                            className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                              STATUS_STYLE[order.status] ?? "bg-gray-100 text-gray-600"
                            }`}
                          >
                            {STATUS_LABEL[order.status] ?? order.status}
                          </span>
                          <p className="text-xs text-gray-400 mt-2">订单号：{order.id}</p>
                          <p className="text-xs text-gray-400">
                            下单时间：{new Date(order.createdAt).toLocaleString()}
                          </p>
                        </div>
                        <div className="sm:text-right">
                          <span className="text-lg font-black text-gray-900">¥{order.totalAmount}</span>
                          <p className="text-xs text-gray-500 mt-1">共 {totalQuantity} 件商品</p>
                        </div>
                      </div>

                      {/* 商品明细：接口本来就 include 了 items.toy，之前没用上 */}
                      <div className="border-t border-pink-100/70 divide-y divide-pink-100/70 bg-white/60">
                        {order.items.map((item, index) => {
                          const name = item.toy?.name ?? "商品已下架";
                          const unitPrice = item.price ?? item.toy?.price ?? 0;

                          return (
                            <div
                              key={item.id ?? `${item.toyId}-${index}`}
                              className="px-4 py-3 flex items-center gap-3"
                            >
                              <img
                                src={
                                  item.toy?.image ||
                                  "https://api.dicebear.com/7.x/bottts/svg?seed=toy"
                                }
                                alt={name}
                                className="w-12 h-12 rounded-xl object-cover bg-white border border-pink-50 shrink-0"
                              />
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-bold text-gray-800 truncate">{name}</p>
                                <p className="text-xs text-gray-400 mt-0.5">
                                  单价 ¥{unitPrice} × {item.quantity}
                                </p>
                              </div>
                              <span className="text-sm font-bold text-gray-900 shrink-0">
                                ¥{(unitPrice * item.quantity).toFixed(2)}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
