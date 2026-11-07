"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Package, Receipt, ShieldCheck, Users } from "lucide-react";
import { adminApi } from "@/services/adminApi";

type AdminUser = { id?: string; username?: string; email?: string };

export default function AdminHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<AdminUser | null>(null);

  // 登录页不显示顶栏
  const isLoginPage = pathname?.startsWith("/admin/login");

  useEffect(() => {
    if (isLoginPage) return;
    const raw = sessionStorage.getItem("admin_user");
    if (!raw) return;
    try {
      // sessionStorage 只能在挂载后读取，这里同步回填一次展示用的用户名
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setUser(JSON.parse(raw));
    } catch {
      sessionStorage.removeItem("admin_user");
    }
  }, [isLoginPage, pathname]);

  if (isLoginPage) return null;

  const handleLogout = async () => {
    // 先让服务端吊销 refresh token，再清本地状态
    await adminApi.logout();
    sessionStorage.removeItem("admin_user");
    setUser(null);
    router.replace("/admin/login");
  };

  return (
    <header className="sticky top-0 z-40 bg-slate-900 text-white shadow">
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href="/admin/toys" className="flex items-center gap-2 font-bold">
            <span className="w-8 h-8 rounded-lg bg-gradient-to-tr from-pink-500 to-amber-400 flex items-center justify-center">
              <Package className="w-4 h-4" />
            </span>
            Toyland Admin
          </Link>

          <nav className="flex items-center gap-1 text-sm">
            <Link
              href="/admin/toys"
              className={`px-3 py-1.5 rounded-lg transition ${pathname?.startsWith('/admin/toys')
                  ? 'bg-white/10 text-white'
                  : 'text-slate-400 hover:text-white'
                }`}
            >
              商品管理
            </Link>
            <Link
              href="/admin/orders"
              className={`px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 ${pathname?.startsWith('/admin/orders')
                  ? 'bg-white/10 text-white'
                  : 'text-slate-400 hover:text-white'
                }`}
            >
              <Receipt className="w-4 h-4" /> 订单管理
            </Link>
            <Link
              href="/admin/users"
              className={`px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 ${pathname?.startsWith('/admin/users')
                  ? 'bg-white/10 text-white'
                  : 'text-slate-400 hover:text-white'
                }`}
            >
              <Users className="w-4 h-4" /> 用户管理
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-4 text-sm">
          {user?.username && (
            <span className="hidden sm:flex items-center gap-1.5 text-slate-300">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              {user.username}
            </span>
          )}
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 text-slate-300 hover:text-white transition"
          >
            <LogOut className="w-4 h-4" /> 退出
          </button>
        </div>
      </div>
    </header>
  );
}