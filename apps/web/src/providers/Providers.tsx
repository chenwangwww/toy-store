"use client";

import React, { useEffect, useState } from "react";
import { Provider } from "react-redux";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { store, initPersistence } from "@/store/store";
import { logout, setInitialized, setUser } from "@/store/authSlice";
import { AUTH_LOST_EVENT, clearTokens, getAccessToken } from "@/lib/auth-client";
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

  // 0) 启动购物车持久化。放在 effect 里而不是 store 模块顶层，
  //    是为了让首帧渲染与服务端一致（都读到空购物车），避免 hydration mismatch
  useEffect(() => {
    initPersistence();
  }, []);

  // 1) 监听"登录态失效"事件：任何请求发现 token 救不回来，立刻清 Redux
  useEffect(() => {
    const onAuthLost = () => store.dispatch(logout());
    window.addEventListener(AUTH_LOST_EVENT, onAuthLost);
    return () => window.removeEventListener(AUTH_LOST_EVENT, onAuthLost);
  }, []);

  // 2) 刷新页面后 Redux 会重置，用本地 token 换回用户信息；
  //    同时定时 + 窗口聚焦 + 标签页切回时校验一次，被封禁后能自动登出
  useEffect(() => {
    let cancelled = false;

    const check = () => {
      const { isAuthenticated } = store.getState().auth;

      // 注意：这里不能只判断 localStorage 里有没有 token。
      // 一旦某次刷新失败把 token 清掉了、但 Redux 里 user 还在，
      // 只判断 token 就会永远跳过校验，界面永久卡在"已登录"。
      if (!getAccessToken() && !isAuthenticated) {
        // 本来就没登录，直接标记初始化完成，否则需要登录的页面会一直等
        store.dispatch(setInitialized(true));
        return;
      }

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
        })
        .finally(() => {
          // 成功或失败都算"已恢复"，页面可以据此决定要不要跳登录
          if (!cancelled) store.dispatch(setInitialized(true));
        });
    };

    // 同一窗口内切换标签页不会触发 window 的 focus 事件，
    // 必须靠 visibilitychange 才能做到"切回来就校验"
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') check();
    };

    check();
    const timer = setInterval(check, 15_000);
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  return (
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </Provider>
  );
}
