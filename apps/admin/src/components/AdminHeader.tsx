"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Package, ShieldCheck } from "lucide-react";

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

  const handleLogout = () => {
    sessionStorage.removeItem("admin_user");
    setUser(null);
    router.replace("/admin/login");
  };

  return (
    <header className="sticky top-0 z-40 bg-slate-900 text-white shadow">
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link href="/admin/toys" className="flex items-center gap-2 font-bold">
          <span className="w-8 h-8 rounded-lg bg-gradient-to-tr from-pink-500 to-amber-400 flex items-center justify-center">
            <Package className="w-4 h-4" />
          </span>
          Toyland Admin
        </Link>

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
