"use client";

import React, { useEffect, useState } from "react";
import { api } from "@/services/api";
import type { EmailCodePurpose } from "@toy-store/shared";

interface SendCodeButtonProps {
  /** 当前表单里填的邮箱，点击时才会校验 */
  email: string;
  purpose: EmailCodePurpose;
  disabled?: boolean;
  /** 成功提示（绿色框），例如「验证码已发送」 */
  onMessage?: (message: string) => void;
  /** 失败提示（红色框）。和 onMessage 分开，否则报错会显示成绿色的成功样式 */
  onError?: (message: string) => void;
  /** 本地没配 SMTP 时，后端会把码回传，这里自动填进输入框 */
  onDevCode?: (code: string) => void;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function SendCodeButton({
  email,
  purpose,
  disabled,
  onMessage,
  onError,
  onDevCode,
}: SendCodeButtonProps) {
  const [seconds, setSeconds] = useState(0);
  const [sending, setSending] = useState(false);

  // 倒计时用「每次 seconds 变化排一个 setTimeout」实现，
  // 比 setInterval 稳：组件卸载 / 重复点击都不会留下野定时器
  useEffect(() => {
    if (seconds <= 0) return;
    const timer = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [seconds]);

  const handleClick = async () => {
    if (seconds > 0 || sending) return;

    if (!EMAIL_PATTERN.test(email.trim())) {
      onError?.("请先填写正确的邮箱地址");
      return;
    }

    setSending(true);
    try {
      const res = await api.sendEmailCode({ email: email.trim(), purpose });
      onMessage?.(res.message || "验证码已发送");
      if (res.devCode) onDevCode?.(res.devCode);
      // 用后端返回的冷却时间，前后端只认一个数，不会出现前端 60 秒后端 30 秒的错位
      setSeconds(res.cooldown || 60);
    } catch (err) {
      onError?.(err instanceof Error ? err.message : "验证码发送失败");
    } finally {
      setSending(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || sending || seconds > 0}
      className="shrink-0 px-3 py-3 rounded-xl border border-pink-200 text-pink-600 text-sm font-bold whitespace-nowrap hover:bg-pink-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {sending ? "发送中..." : seconds > 0 ? `${seconds}s 后重发` : "获取验证码"}
    </button>
  );
}