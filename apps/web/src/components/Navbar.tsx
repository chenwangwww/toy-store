"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ShoppingCart, Sparkles, LogIn } from "lucide-react";
import { useAppSelector, useAppDispatch } from "@/store/hooks";
import { setAuthModalOpen, logout } from "@/store/authSlice";

export default function Navbar() {
  const dispatch = useAppDispatch();
  const router = useRouter();

  const cartItems = useAppSelector((state) => state.cart.items);
  const totalCartCount = cartItems.reduce((acc, item) => acc + item.quantity, 0);

  // 登录态统一由 Redux 维护，Providers 会在启动时从 sessionStorage 恢复
  const { user, isAuthenticated } = useAppSelector((state) => state.auth);

  const handleClientLogout = () => {
    sessionStorage.removeItem("client_user");
    dispatch(logout());
    router.push("/");
  };

  return (
    <header className="sticky top-0 z-40 bg-white/90 backdrop-blur border-b border-pink-100 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 group">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-pink-500 to-amber-400 flex items-center justify-center text-white shadow-md group-hover:scale-105 transition">
            <Sparkles className="w-6 h-6" />
          </div>
          <span className="font-extrabold text-xl bg-gradient-to-r from-pink-600 to-amber-500 bg-clip-text text-transparent">
            Toyland Express
          </span>
        </Link>

        <div className="flex items-center gap-4">
          <Link
            href="/cart"
            className="relative p-2 rounded-full hover:bg-pink-50 transition text-gray-700"
          >
            <ShoppingCart className="w-6 h-6" />
            {totalCartCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-pink-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center font-bold shadow">
                {totalCartCount}
              </span>
            )}
          </Link>

          {isAuthenticated ? (
            <div className="flex items-center gap-3">
              <Link
                href="/profile"
                className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-pink-50 hover:bg-pink-100 transition text-pink-700 font-medium text-sm"
              >
                <img
                  src={
                    user?.avatar || "https://api.dicebear.com/7.x/bottts/svg?seed=default"
                  }
                  alt="avatar"
                  className="w-6 h-6 rounded-full bg-white"
                />
                <span>{user?.username}</span>
              </Link>
              <button
                onClick={handleClientLogout}
                className="text-xs text-gray-400 hover:text-red-500 transition"
                title="退出登录"
              >
                退出
              </button>
            </div>
          ) : (
            <button
              onClick={() => dispatch(setAuthModalOpen(true))}
              className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-pink-600 text-white font-medium hover:bg-pink-700 transition shadow"
            >
              <LogIn className="w-4 h-4" />
              登录 / 注册
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
