"use client";

import React, { useEffect, useState } from "react";
import { useAppSelector, useAppDispatch } from "@/store/hooks";
import { setAuthModalOpen, setAuthModalMode, setUser } from "@/store/authSlice";
import { api } from "@/services/api";
import { X, Sparkles, KeyRound } from "lucide-react";
import SendCodeButton from "@/components/SendCodeButton";

const CODE_PATTERN = /^\d{6}$/;

export default function AuthModal() {
  const dispatch = useAppDispatch();
  const { authModalOpen, authModalMode } = useAppSelector((state) => state.auth);

  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // 在 登录 / 注册 / 找回密码 之间切换时，清掉上一次的输入和提示
  useEffect(() => {
    setPassword("");
    setConfirmPassword("");
    setCode("");
    setMessage("");
    setError("");
  }, [authModalMode]);

  if (!authModalOpen) return null;

  const isRegister = authModalMode === "register";
  const isForgot = authModalMode === "forgot";
  const needCode = isRegister || isForgot;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setMessage("");

    const email = account.trim();

    // ── 找回密码：邮箱 + 验证码 + 新密码，不需要旧密码 ──
    if (isForgot) {
      if (!CODE_PATTERN.test(code.trim())) {
        setError("请输入 6 位邮箱验证码");
        return;
      }
      if (password.length < 6) {
        setError("新密码至少 6 位");
        return;
      }
      if (password !== confirmPassword) {
        setError("两次输入的新密码不一致");
        return;
      }

      setLoading(true);
      try {
        const res = await api.resetPassword({
          email,
          code: code.trim(),
          newPassword: password,
        });
        setMessage(res.message || "密码已重置，请用新密码登录");
        setTimeout(() => dispatch(setAuthModalMode("login")), 1500);
      } catch (err) {
        setError(err instanceof Error ? err.message : "重置密码失败");
      } finally {
        setLoading(false);
      }
      return;
    }

    // ── 注册 / 登录 ──
    if (isRegister && !CODE_PATTERN.test(code.trim())) {
      setError("请输入 6 位邮箱验证码");
      return;
    }

    setLoading(true);
    try {
      // 真实登录/注册：走纯后端 /api/auth，成功后 token 已在 api.auth 里存好
      const { user } = await api.auth({
        action: isRegister ? "register" : "login",
        email,
        password,
        ...(isRegister ? { code: code.trim() } : {}),
      });

      dispatch(setUser(user));
      dispatch(setAuthModalOpen(false));
      setPassword("");
      setCode("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "认证失败，请稍后重试");
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

        <div className="flex items-center gap-2 mb-2">
          <div className="w-8 h-8 rounded-lg bg-pink-500 flex items-center justify-center text-white">
            <Sparkles className="w-5 h-5" />
          </div>
          <h2 className="text-2xl font-bold text-gray-800">
            {authModalMode === "login" && "欢迎回到 Toyland"}
            {isRegister && "加入童趣俱乐部"}
            {isForgot && "找回密码"}
          </h2>
        </div>

        <p className="text-xs text-gray-400 mb-6">
          {authModalMode === "login" && "登录后即可下单、查看订单"}
          {isRegister && "需要邮箱验证码，确保是你本人的邮箱"}
          {isForgot && "验证码 5 分钟内有效，验证通过后直接设置新密码"}
        </p>

        {error && (
          <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-xl text-sm font-medium">
            {error}
          </div>
        )}
        {message && (
          <div className="mb-4 p-3 bg-emerald-50 text-emerald-600 rounded-xl text-sm font-medium">
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

          {needCode && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">邮箱验证码</label>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <KeyRound className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    inputMode="numeric"
                    maxLength={6}
                    required
                    value={code}
                    // 只留数字：粘贴带空格的验证码时不会因为空格校验失败
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                    placeholder="6 位数字"
                    className="w-full pl-9 pr-3 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-pink-500 text-gray-800 tracking-widest"
                  />
                </div>
                <SendCodeButton
                  email={account}
                  purpose={isRegister ? "register" : "reset"}
                  disabled={loading}
                  // 成功和失败分别走绿色 / 红色提示框，并且互斥（出现一个就清掉另一个）
                  onMessage={(msg) => {
                    setError("");
                    setMessage(msg);
                  }}
                  onError={(msg) => {
                    setMessage("");
                    setError(msg);
                  }}
                  onDevCode={setCode}
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {isForgot ? "新密码" : isRegister ? "设置密码" : "登录密码"}
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={needCode ? "至少 6 位" : "请输入密码"}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-pink-500 text-gray-800"
            />
          </div>

          {isForgot && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">确认新密码</label>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="再输入一次新密码"
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
                : isRegister
                  ? "确认注册"
                  : "重置密码"}
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