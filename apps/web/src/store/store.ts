import { combineReducers, configureStore } from "@reduxjs/toolkit";
import {
    FLUSH,
    PAUSE,
    PERSIST,
    persistReducer,
    persistStore,
    PURGE,
    REGISTER,
    REHYDRATE,
} from 'redux-persist'
import authReducer from './authSlice'
import cartReducer from './cartSlice'

/**
 * redux-persist 用的 storage。
 * 服务端没有 localStorage，静默退化成空实现：
 * SSR 读到 null → 渲染空购物车，客户端水合完成后再补上真实数据，
 * 这样不会出现「服务端渲染有商品、客户端渲染没有」的 hydration 不匹配。
 */
const storage = {
    getItem: (key: string) =>
        Promise.resolve(typeof window === 'undefined' ? null : window.localStorage.getItem(key)),
    setItem: (key: string, value: string) => {
        if (typeof window !== 'undefined') window.localStorage.setItem(key, value)
        return Promise.resolve(value)
    },
    removeItem: (key: string) => {
        if (typeof window !== 'undefined') window.localStorage.removeItem(key)
        return Promise.resolve()
    },
}

const cartPersistConfig = {
    key: 'toyland:cart',
    storage,
    // 只持久化 items，_persist 这类运行时元数据不用存
    whitelist: ['items'],
}

// 用 combineReducers 显式收口：persistReducer 返回的类型带 _persist，
// 直接塞进 configureStore 的 reducer map 会推导失败
const rootReducer = combineReducers({
    // auth 故意不持久化：登录态由 Providers 里的 api.me() 用 token 换回来，
    // 这样被封禁 / 改角色能立刻生效，而不是从本地缓存读到一个过期的"已登录"
    auth: authReducer,
    cart: persistReducer(cartPersistConfig, cartReducer),
})

export const store = configureStore({
    reducer: rootReducer,
    middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware({
            serializableCheck: {
                // redux-persist 内部会派发这些 action，忽略掉免得报"不可序列化"
                ignoredActions: [FLUSH, REHYDRATE, PAUSE, PERSIST, PURGE, REGISTER],
            },
        }),
})

let persistorInstance: ReturnType<typeof persistStore> | null = null

/**
 * 启动持久化。**必须在客户端挂载之后调用**（Providers 里的 useEffect）。
 *
 * persistStore 会立刻读 localStorage 回填 state。如果在模块顶层调用，
 * 回填会早于 React 首次渲染 —— 服务端渲染的是空购物车，客户端首帧却已经有商品，
 * React 会直接报 hydration mismatch（导航栏角标对不上）。
 * 放进 effect 后：首帧两边都是空购物车，挂载完再补数据，不匹配的问题就没了。
 */
export function initPersistence() {
    if (!persistorInstance) persistorInstance = persistStore(store)
    return persistorInstance
}

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch
