import "./globals.css";
import type { Metadata } from "next";
import { Providers } from "@/providers/Providers";
import Navbar from "@/components/Navbar";
import AuthModal from "@/components/AuthModal";
import ChatWidget from "@/components/ChatWidget";

export const metadata: Metadata = {
  title: 'Toyland Express - 儿童玩具专卖店',
  description: '精选全球优质儿童玩具，智能导购与极速配送。',
}

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="zh-CN">
      <body className="bg-gradient-to-b from-pink-50/50 to-white min-h-screen font-sans text-gray-900 antialiased">
        <Providers>
          <Navbar />
          <main>{children}</main>
          <AuthModal />
          <ChatWidget />
        </Providers>
      </body>
    </html>
  )
}