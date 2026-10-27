'use client'

import React, { useState } from 'react';
import { useAppSelector, useAppDispatch } from '@/store/hooks';
import { setAuthModalOpen, setAuthModalMode, setUser } from '@/store/authSlice';
import { X, Sparkles } from 'lucide-react';

export default function AuthModal() {
    const dispatch = useAppDispatch()
    const { authModalOpen, authModalMode } = useAppSelector((state) => state.auth)
    const [account, setAccount] = useState('')
    const [password, setPassword] = useState('')
    const [message, setMessage] = useState('')

    if (!authModalOpen) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        if (authModalMode === 'forgot') {
            setMessage('重置密码验证码已发送至您的邮箱！')
            setTimeout(() => {
                return dispatch(setAuthModalMode('login'))
            }, 2000);
            return
        }

        dispatch(setUser({
            id: 'USR-' + Math.floor(1000 + Math.random() * 9000),
            username: account.split('@')[0] || '童趣会员',
            email: account.includes('@') ? account : 'user@toyland.com',
            phone: '+971 50 987 6543',
            avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=' + account,
        }))
        dispatch(setAuthModalOpen(false))
        setMessage('')
    }

    return (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-8 relative animate-in fade-in zoom-in-95 duration-200">
                <button onClick={() => dispatch(setAuthModalOpen(false))} className="absolute top-6 right-6 text-gray-400 hover:text-gray-600 p-1"
                >
                    <X className="w-5 h-5" />
                </button>
                <div className='flex items-center gap-2 mb-6'>
                    <div className="w-8 h-8 rounded-lg bg-pink-500 flex items-center justify-center text-white">
                        <Sparkles className="w-5 h-5" />
                    </div>
                    <h2 className='text-2xl font-bold text-gray-800'>
                        {authModalMode === 'login' && '欢迎回到 Toyland'}
                        {authModalMode === 'register' && '加入童趣俱乐部'}
                        {authModalMode === 'login' && '找回密码'}
                    </h2>
                </div>

                {message && (
                    <div className="mb-4 p-3 bg-pink-50 text-pink-600 rounded-xl text-sm font-medium">
                        {message}
                    </div>
                )}

                <form onSubmit={handleSubmit} className='space-y-4'>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">电子邮箱 / 手机号</label>
                        <input
                            type='text'
                            required
                            value={account}
                            onChange={(e) => setAccount(e.target.value)}
                            placeholder='请输入邮箱或手机号'
                            className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-pink-500 text-gray-800"
                        />
                    </div>

                    {authModalMode !== 'forgot' && (
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">登录密码</label>
                            <input
                                type="password"
                                required
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="请输入密码"
                                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-pink-500 text-gray-800"
                            />
                        </div>
                    )}

                    <button type='submit' className="w-full py-3 rounded-xl bg-gradient-to-r from-pink-500 to-amber-500 text-white font-bold shadow-lg shadow-pink-500/25 hover:opacity-95 transition">
                        {authModalMode === 'login' && '立即登录'}
                        {authModalMode === 'register' && '确认注册'}
                        {authModalMode === 'forgot' && '发送重置邮件'}
                    </button>
                </form>

                <div className="mt-6 flex items-center justify-between text-sm text-gray-500">
                    {
                        authModalMode === 'login' ? (
                            <>
                                <button onClick={() => dispatch(setAuthModalMode('forgot'))} className="hover:text-pink-600">忘记密码？</button>
                                <button onClick={() => dispatch(setAuthModalMode('register'))} className="text-pink-600 font-semibold">注册新账号</button>
                            </>
                        ) : (
                            <button onClick={() => dispatch(setAuthModalMode('login'))} className="text-pink-600 font-semibold mx-auto">已有账号？返回登录</button>
                        )
                    }
                </div>
            </div>
        </div>
    )
}