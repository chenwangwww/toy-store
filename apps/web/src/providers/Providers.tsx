"use client";

import React, { useEffect, useState } from "react";
import { Provider } from "react-redux";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { store } from "@/store/store";
import { logout, setUser } from "@/store/authSlice";
import { clearTokens, getAccessToken, setAuthLostHandler } from "@/lib/auth-client";
import { api } from "@/services/api";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 1000 * 60 * 5, refetchOnWindowFocus: false },
        },
      }),
  );

  // 1) 注册"登录态失效"回调：任何请求发现 token 救不回来，立刻清 Redux
  useEffect(() => {
    setAuthLostHandler(() => store.dispatch(logout()));
    return () => setAuthLostHandler(null);
  }, []);

  // 2) 刷新页面后 Redux 会重置，用本地 token 换回用户信息；
  //    同时每 60 秒 + 窗口聚焦时校验一次，被封禁后即使不操作也会自动登出
  useEffect(() => {
    let cancelled = false;

    const check = () => {
      if (!getAccessToken()) return;
      api
        .me()
        .then((user) => {
          if (!cancelled) store.dispatch(setUser(user));
        })
        .catch(() => {
          if (cancelled) return;
          // me() 内部已尝试过刷新，走到这里说明登录态彻底没了
          clearTokens();
          store.dispatch(logout());
        });
    };

    check();
    const timer = setInterval(check, 60_000);
    window.addEventListener('focus', check);

    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener('focus', check);
    };
  }, []);

  return (
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </Provider>
  );
}
