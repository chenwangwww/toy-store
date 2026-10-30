"use client";

import React, { useState } from "react";
import { useAppSelector, useAppDispatch } from "@/store/hooks";
import { setAuthModalOpen, setAuthModalMode, setUser } from "@/store/authSlice";
import { api } from "@/services/api";
import { X, Sparkles } from "lucide-react";

export default function AuthModal() {
  const dispatch = useAppDispatch();
  const { authModalOpen, authModalMode } = useAppSelector((state) => state.auth);
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  if (!authModalOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // 找回密码仍是前端模拟，后续可对接后端邮件服务
    if (authModalMode === "forgot") {
      setMessage("重置密码验证码已发送至您的邮箱！");
      setTimeout(() => dispatch(setAuthModalMode("login")), 2000);
      return;
    }

    setLoading(true);
    setMessage("");
    try {
      // 真实登录/注册：走纯后端 /api/auth，成功后 token 已在 api.auth 里存好
      const { user } = await api.auth({
        action: authModalMode === "register" ? "register" : "login",
        email: account,
        password,
      });

      dispatch(setUser(user));
      dispatch(setAuthModalOpen(false));
      setPassword("");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "认证失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-8 relative animate-in fade-in zoom-in-95 duration-200">
        <button
          onClick={() => dispatch(setAuthModalOpen(false))}
          className="absolute top-6 right-6 text-gray-400 hover:text-gray-600 p-1"
        >
          <X className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2 mb-6">
          <div className="w-8 h-8 rounded-lg bg-pink-500 flex items-center justify-center text-white">
            <Sparkles className="w-5 h-5" />
          </div>
          <h2 className="text-2xl font-bold text-gray-800">
            {authModalMode === "login" && "欢迎回到 Toyland"}
            {authModalMode === "register" && "加入童趣俱乐部"}
            {authModalMode === "forgot" && "找回密码"}
          </h2>
        </div>

        {message && (
          <div className="mb-4 p-3 bg-pink-50 text-pink-600 rounded-xl text-sm font-medium">
            {message}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">电子邮箱</label>
            <input
              type="email"
              required
              value={account}
              onChange={(e) => setAccount(e.target.value)}
              placeholder="customer@toyland.com"
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-pink-500 text-gray-800"
            />
          </div>

          {authModalMode !== "forgot" && (
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

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-pink-500 to-amber-500 text-white font-bold shadow-lg shadow-pink-500/25 hover:opacity-95 transition disabled:opacity-60"
          >
            {loading
              ? "处理中..."
              : authModalMode === "login"
                ? "立即登录"
                : authModalMode === "register"
                  ? "确认注册"
                  : "发送重置邮件"}
          </button>
        </form>

        <div className="mt-6 flex items-center justify-between text-sm text-gray-500">
          {authModalMode === "login" ? (
            <>
              <button
                onClick={() => dispatch(setAuthModalMode("forgot"))}
                className="hover:text-pink-600"
              >
                忘记密码？
              </button>
              <button
                onClick={() => dispatch(setAuthModalMode("register"))}
                className="text-pink-600 font-semibold"
              >
                注册新账号
              </button>
            </>
          ) : (
            <button
              onClick={() => dispatch(setAuthModalMode("login"))}
              className="text-pink-600 font-semibold mx-auto"
            >
              已有账号？返回登录
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
