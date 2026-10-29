import "./globals.css";
import type { Metadata } from "next";
import AdminHeader from "@/components/AdminHeader";

export const metadata: Metadata = {
  title: "Toyland Admin Console - 玩具商城管理后台",
  description: "Toyland 玩具商城后台管理系统，仅限授权管理员使用。",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="bg-slate-50 min-h-screen font-sans text-gray-900 antialiased">
        <AdminHeader />
        <main>{children}</main>
      </body>
    </html>
  );
}
