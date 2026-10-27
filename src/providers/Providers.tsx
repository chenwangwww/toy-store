'use client'

import React, {useState} from "react"
import {Provider } from 'react-redux'
import { store } from "@/store/store"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

export function Providers({children}: {children: React.ReactNode}) {
    const [queryClient] = useState(()=> new QueryClient({
        defaultOptions: {
            queries: {staleTime: 1000 * 60 * 5, refetchOnWindowFocus: false}
        }
    }))

    return (
        <Provider store={store}>
            <QueryClientProvider client={queryClient}>
                {children}
            </QueryClientProvider>
        </Provider>
    )
}