'use client'

import { useSyncExternalStore } from 'react'

/** 永远不变化的订阅：这个 hook 只用来区分"服务端/水合首帧"和"真正挂载后" */
const subscribe = () => () => {}

/**
 * 返回 false 直到客户端水合完成。
 *
 * 服务端快照固定返回 false，客户端首帧（水合时）也会用服务端快照，
 * 所以两边渲染结果一致 —— 用它包住依赖 localStorage 的内容，
 * 可以避免"服务端渲染空购物车、客户端已有商品"的 hydration mismatch。
 *
 * 用 useSyncExternalStore 而不是 useState + useEffect，是因为
 * eslint 的 react-hooks/set-state-in-effect 规则不允许在 effect 里直接 setState。
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  )
}
