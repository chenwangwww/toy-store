"use client";

import React, { useEffect, useState } from "react";
import { Provider } from "react-redux";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { store } from "@/store/store";
import { setUser } from "@/store/authSlice";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 1000 * 60 * 5, refetchOnWindowFocus: false },
        },
      }),
  );

  // 刷新页面后 Redux 状态会重置，这里从 sessionStorage 恢复登录态
  useEffect(() => {
    const raw = sessionStorage.getItem("client_user");
    if (!raw) return;
    try {
      store.dispatch(setUser(JSON.parse(raw)));
    } catch {
      sessionStorage.removeItem("client_user");
    }
  }, []);

  return (
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </Provider>
  );
}
