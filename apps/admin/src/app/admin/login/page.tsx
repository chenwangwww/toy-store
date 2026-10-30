'use client'

import React, { useState } from "react"
import { useRouter } from "next/navigation"
import { ShieldAlert } from "lucide-react"
import { adminApi } from "@/services/adminApi"

export default function AdminLoginPage() {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const router = useRouter()

    const handleAdminLogin = async (e: React.FormEvent) => {
        e.preventDefault()
        try {
            setError('')
            // 直连纯后端服务的 /api/admin/login
            const data = await adminApi.login(email, password)

            // token 已在 adminApi.login 里存好，这里只留一份展示用的用户信息
            sessionStorage.setItem('admin_user', JSON.stringify(data.user))
            router.push('/admin/toys')
        } catch (err) {
            setError(err instanceof Error ? err.message : '登录失败')
        }
    }

    return (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
            <div className="bg-slate-800 border border-slate-700 rounded-3xl p-8 max-w-md w-full shadow-2xl text-white">
                <div className="w-12 h-12 rounded-2xl bg-pink-600/20 text-pink-500 flex items-center justify-center mb-6">
                    <ShieldAlert className="w-6 h-6" />
                </div>
                <h1 className="text-2xl font-bold mb-2">管理员专用后台</h1>
                <p className="text-xs text-slate-400 mb-6">此区域严禁外部注册，仅限系统授权管理员登录。</p>

                {error && <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-xl">{error}</div>}

                <form onSubmit={handleAdminLogin} className="space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-slate-300 mb-1 uppercase">管理员邮箱</label>
                        <input
                            type="email"
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="admin@toyland.com"
                            className="w-full px-4 py-3 rounded-xl bg-slate-900 border border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-pink-500 text-white"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-300 mb-1 uppercase">登录密码</label>
                        <input
                            type="password"
                            required
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="请输入密码"
                            className="w-full px-4 py-3 rounded-xl bg-slate-900 border border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-pink-500 text-white"
                        />
                    </div>
                    <button
                        type="submit"
                        className="w-full py-3.5 rounded-xl bg-gradient-to-r cursor-pointer from-pink-500 to-amber-500 text-white font-bold shadow-lg hover:opacity-95 transition"
                    >
                        安全登录后台
                    </button>
                </form>
            </div>
        </div>
    )
}