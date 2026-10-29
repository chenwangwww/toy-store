"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useAppSelector, useAppDispatch } from "@/store/hooks";
import { logout } from "@/store/authSlice";
import { api } from "@/services/api";
import type { Order } from "@toy-store/shared";
import { Package, LogOut } from "lucide-react";

export default function ProfilePage() {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const { user, isAuthenticated } = useAppSelector((state) => state.auth);

  // 未登录直接回首页（只做跳转，不改 state）
  useEffect(() => {
    if (!isAuthenticated) router.replace("/");
  }, [isAuthenticated, router]);

  const { data: orders = [], isLoading } = useQuery<Order[]>({
    queryKey: ["orders", user?.id],
    queryFn: () => api.getOrders(user!.id),
    enabled: Boolean(user?.id),
  });

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
            onClick={() => {
              sessionStorage.removeItem("client_user");
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
                {orders.map((order) => (
                  <div
                    key={order.id}
                    className="p-4 rounded-2xl border border-pink-50 bg-pink-50/20 flex flex-col sm:flex-row justify-between gap-4"
                  >
                    <div>
                      <span className="text-xs font-bold text-pink-600 bg-pink-100 px-2.5 py-1 rounded-full">
                        {order.status}
                      </span>
                      <p className="text-xs text-gray-400 mt-2">订单号：{order.id}</p>
                      <p className="text-xs text-gray-400">
                        下单时间：{new Date(order.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="text-lg font-black text-gray-900">¥{order.totalAmount}</span>
                      <p className="text-xs text-gray-500 mt-1">
                        共 {order.items.reduce((s, i) => s + i.quantity, 0)} 件商品
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
