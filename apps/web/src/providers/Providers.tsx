"use client";

import React, { useEffect, useState } from "react";
import { Provider } from "react-redux";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { store } from "@/store/store";
import { setUser } from "@/store/authSlice";
import { api } from "@/services/api";
import { clearTokens, getAccessToken } from "@/lib/auth-client";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 1000 * 60 * 5, refetchOnWindowFocus: false },
        },
      }),
  );

  // 刷新页面后 Redux 会重置，这里用本地 token 向后端换回用户信息
  useEffect(() => {
    if (!getAccessToken()) return;
    api
      .me()
      .then((user) => store.dispatch(setUser(user)))
      .catch(() => clearTokens());
  }, []);

  return (
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </Provider>
  );
}
