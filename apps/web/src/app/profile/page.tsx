"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useAppSelector, useAppDispatch } from "@/store/hooks";
import { logout } from "@/store/authSlice";
import { api } from "@/services/api";
import { useHydrated } from "@/lib/use-hydrated";
import type { Order, OrderStatus } from "@toy-store/shared";
import { Package, LogOut, ArrowRight } from "lucide-react";

/** 订单状态的中文展示，避免直接把 PAID 这种枚举值甩给用户 */
const STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING: "待支付",
  PAID: "已支付",
  SHIPPED: "已发货",
  COMPLETED: "已完成",
  CANCELLED: "已取消",
};

/** 状态胶囊：浅底 + 深字 */
const STATUS_STYLE: Record<OrderStatus, string> = {
  PENDING: "bg-amber-100 text-amber-700",
  PAID: "bg-emerald-100 text-emerald-700",
  SHIPPED: "bg-sky-100 text-sky-700",
  COMPLETED: "bg-gray-100 text-gray-600",
  CANCELLED: "bg-red-100 text-red-600",
};

/**
 * 卡片左侧的状态色条。
 * 这是区分「一张订单从哪开始、到哪结束」最有效的手段 ——
 * 光靠边框和间距，商品行一多就会糊成一片。
 */
const STATUS_ACCENT: Record<OrderStatus, string> = {
  PENDING: "bg-amber-400",
  PAID: "bg-emerald-400",
  SHIPPED: "bg-sky-400",
  COMPLETED: "bg-gray-300",
  CANCELLED: "bg-red-400",
};

/** 固定成 2026-11-07 13:44 这种格式，不受系统语言影响，也省掉秒的干扰 */
function formatDateTime(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 金额统一两位小数：避免「¥599」和「¥200.00」混排 */
const money = (n: number) => n.toFixed(2);

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
            <div className="min-w-0">
              <h2 className="font-bold text-lg text-gray-900 truncate">{user.username}</h2>
              <span className="text-xs text-gray-400 break-all">{user.email}</span>
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

        <div className="lg:col-span-3">
          <div className="bg-white p-5 sm:p-6 rounded-3xl border border-pink-100 shadow-sm">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Package className="w-5 h-5 text-pink-600" /> 我的订单
                <span className="text-sm font-bold text-gray-400">({orders.length})</span>
              </h2>
              {orders.length > 0 && (
                <span className="text-xs text-gray-400 hidden sm:inline">
                  最近一次下单 {formatDateTime(orders[0].createdAt)}
                </span>
              )}
            </div>

            {isLoading ? (
              <p className="text-gray-400 text-sm py-12 text-center">订单加载中...</p>
            ) : orders.length === 0 ? (
              <div className="text-center py-14">
                <div className="w-16 h-16 rounded-full bg-pink-50 text-pink-400 flex items-center justify-center mx-auto mb-4">
                  <Package className="w-7 h-7" />
                </div>
                <p className="text-sm text-gray-400 mb-5">还没有订单，去挑点好玩的吧</p>
                <Link
                  href="/"
                  className="inline-flex items-center gap-1.5 px-6 py-2.5 rounded-xl bg-pink-600 text-white text-sm font-bold hover:bg-pink-700 transition"
                >
                  去逛逛 <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            ) : (
              <div className="space-y-5">
                {orders.map((order) => {
                  const totalQuantity = order.items.reduce((sum, item) => sum + item.quantity, 0);

                  return (
                    <article
                      key={order.id}
                      className="flex rounded-2xl bg-white border border-pink-100 shadow-sm hover:shadow-md hover:border-pink-200 transition overflow-hidden"
                    >
                      {/* 左侧状态色条：一张订单从哪开始一眼就看出来 */}
                      <div
                        className={`w-1.5 shrink-0 ${
                          STATUS_ACCENT[order.status] ?? "bg-gray-300"
                        }`}
                        aria-hidden
                      />

                      <div className="flex-1 min-w-0">
                        {/* 订单头：状态 + 单号 + 时间 / 右侧件数与合计 */}
                        <header className="px-4 sm:px-5 py-4 flex items-start justify-between gap-4 border-b border-pink-50">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span
                                className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full ${
                                  STATUS_STYLE[order.status] ?? "bg-gray-100 text-gray-600"
                                }`}
                              >
                                <span className="w-1.5 h-1.5 rounded-full bg-current" />
                                {STATUS_LABEL[order.status] ?? order.status}
                              </span>
                              <span
                                className="text-xs font-mono text-gray-400 truncate"
                                title={order.id}
                              >
                                #{order.id.slice(0, 8)}
                              </span>
                            </div>
                            <p className="text-xs text-gray-400 mt-2">
                              {formatDateTime(order.createdAt)}
                            </p>
                          </div>

                          <div className="text-right shrink-0">
                            <p className="text-[11px] text-gray-400">共 {totalQuantity} 件</p>
                            <p className="text-xl font-black text-gray-900 tabular-nums mt-0.5">
                              ¥{money(order.totalAmount)}
                            </p>
                          </div>
                        </header>

                        {/* 商品明细：浅粉底和头部区分开，形成「卡片内嵌列表」的层次 */}
                        <ul className="bg-pink-50/25 divide-y divide-pink-50">
                          {order.items.map((item, index) => {
                            const name = item.toy?.name ?? "商品已下架";
                            const unitPrice = item.price ?? item.toy?.price ?? 0;

                            return (
                              <li
                                key={item.id ?? `${item.toyId}-${index}`}
                                className="px-4 sm:px-5 py-3.5 flex items-center gap-3"
                              >
                                <img
                                  src={
                                    item.toy?.image ||
                                    "https://api.dicebear.com/7.x/bottts/svg?seed=toy"
                                  }
                                  alt={name}
                                  className="w-14 h-14 rounded-xl object-cover bg-white border border-pink-100 shrink-0"
                                />
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-bold text-gray-800 truncate">{name}</p>
                                  <p className="text-xs text-gray-400 mt-1 tabular-nums">
                                    ¥{money(unitPrice)} × {item.quantity}
                                  </p>
                                </div>
                                <span className="text-sm font-bold text-gray-900 tabular-nums shrink-0">
                                  ¥{money(unitPrice * item.quantity)}
                                </span>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    </article>
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
