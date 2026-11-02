'use client'

import React, { Suspense, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAppSelector, useAppDispatch } from '@/store/hooks';
import { removeFromCart, updateQuantity, clearCart } from '@/store/cartSlice';
import { api } from '@/services/api';
import { useHydrated } from '@/lib/use-hydrated';
import { Trash2, ShoppingBag, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';

function CartContent() {
    const dispatch = useAppDispatch()
    const queryClient = useQueryClient()
    const router = useRouter()
    const searchParams = useSearchParams()
    const cartItems = useAppSelector((state) => state.cart.items)
    const user = useAppSelector((state) => state.auth.user)
    const [paying, setPaying] = useState(false)
    const [payError, setPayError] = useState('')

    // 购物车是从 localStorage 恢复的，服务端拿不到。
    // 必须等水合完成再渲染，否则服务端渲染的"空购物车"会和客户端"已有商品"对不上，
    // React 会直接报 hydration mismatch。
    const hydrated = useHydrated()

    // 「刚下单成功」这个状态放在 URL 里，而不是组件 state。
    // Next.js 的路由缓存会让组件 state 活过路由切换，之前用 useState 存 successOrder，
    // 结果从首页加购再点购物车时，看到的还是上一次的「支付成功」页。
    // 改成 ?paid=<订单号>：从导航栏点购物车（href="/cart" 不带参数）自然回到正常购物车视图。
    const paidOrderId = searchParams.get('paid')

    const totalAmount = cartItems.reduce((sum, item) => sum + item.toy.price * item.quantity, 0);

    const handleSimulatedPayment = async () => {
        if (!user) {
            alert('请先登录再进行支付')
            return
        }
        setPaying(true)
        setPayError('')
        try {
            // 保留 1.5s 的「调起支付」动效
            await new Promise((resolve) => setTimeout(resolve, 1500))
            const order = await api.createOrder(cartItems, totalAmount)
            dispatch(clearCart())
            // 下单成功必须让订单列表缓存失效。
            // QueryClient 挂在根 layout 上，跨路由不销毁，而全局 staleTime 是 5 分钟；
            // 不失效的话回到个人中心会拿旧的缓存渲染，看起来像"新订单没进去"，要刷新才出现。
            queryClient.invalidateQueries({ queryKey: ['orders'] })
            // replace 而不是 push：避免按返回键又回到"待支付"的购物车
            router.replace(`/cart?paid=${order.id}`)
        } catch (err) {
            // 不加 try/catch 的话，下单失败会让 paying 永远为 true，按钮卡死在「正在调起安全支付」
            setPayError(err instanceof Error ? err.message : '下单失败，请稍后重试')
        } finally {
            setPaying(false)
        }
    }

    if (!hydrated) {
        return (
            <div className='max-w-md mx-auto px-4 py-20 text-center text-sm text-gray-400'>
                加载中...
            </div>
        )
    }

    if (paidOrderId) {
        return (
            <div className='max-w-md mx-auto px-4 py-20 text-center'>
                <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg">
                    <CheckCircle2 className="w-10 h-10" />
                </div>
                <h1 className="text-2xl font-bold mb-2">支付成功！</h1>
                <p className="text-gray-500 text-sm mb-6">订单号：{paidOrderId}，后端已模拟生成订单记录。</p>
                <Link href="/profile" className="inline-block px-8 py-3 rounded-xl bg-pink-600 text-white font-bold shadow hover:bg-pink-700 transition">
                    查看个人中心订单
                </Link>
            </div>
        )
    }

    if (cartItems.length === 0) {
        return (
            <div className='max-w-md mx-auto px-4 py-20 text-center'>
                <div className="w-20 h-20 bg-pink-100 text-pink-500 rounded-full flex items-center justify-center mx-auto mb-6">
                    <ShoppingBag className="w-10 h-10" />
                </div>
                <h2 className="text-2xl font-bold mb-2">购物车还是空的</h2>
                <p className="text-gray-500 text-sm mb-6">快去挑选几款令孩子心仪的玩具吧！</p>
                <Link href="/" className="inline-block px-8 py-3 rounded-xl bg-pink-600 text-white font-bold shadow hover:bg-pink-700 transition">
                    去首页逛逛
                </Link>
            </div>
        )
    }

    return (
        <div className='max-w-7xl mx-auto px-4 py-10'>
            <h1 className='text-3xl font-extrabold mb-8'>我的购物车</h1>
            <div className='grid grid-cols-1 lg:grid-cols-3 gap-8'>
                <div className='lg:col-span-2 space-y-4'>
                    {cartItems.map((item) => (
                        <div key={item.toy.id} className='bg-white p-4 rounded-3xl border border-pink-100 shadow-sm flex items-center gap-4'>
                            <img src={item.toy.image} alt={item.toy.name} className="w-20 h-20 object-cover rounded-2xl bg-pink-50" />
                            <div className="flex-1">
                                <h3 className="font-bold text-gray-800">{item.toy.name}</h3>
                                <span className="text-pink-600 font-black">¥{item.toy.price}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <button onClick={() => dispatch(updateQuantity({ id: item.toy.id, quantity: item.quantity - 1 }))} className="w-8 h-8 rounded-lg bg-gray-50 font-bold">-</button>
                                <span className="font-bold w-6 text-center">{item.quantity}</span>
                                <button onClick={() => dispatch(updateQuantity({ id: item.toy.id, quantity: item.quantity + 1 }))} className="w-8 h-8 rounded-lg bg-gray-50 font-bold">+</button>
                            </div>
                            <button onClick={() => dispatch(removeFromCart(item.toy.id))} className="text-gray-400 hover:text-red-500 p-2">
                                <Trash2 className="w-5 h-5" />
                            </button>
                        </div>
                    ))}
                </div>

                <div className="bg-white p-6 rounded-3xl border border-pink-100 shadow-lg h-fit">
                    <h2 className="text-xl font-bold mb-4">订单结算</h2>
                    <div className="space-y-3 text-sm text-gray-600 mb-6 border-b border-gray-100 pb-4">
                        <div className="flex justify-between">
                            <span>商品总计</span>
                            <span className="font-bold">¥{totalAmount}</span>
                        </div>
                        <div className="flex justify-between">
                            <span>运费</span>
                            <span className="text-green-600 font-bold">免运费</span>
                        </div>
                    </div>
                    <div className="flex justify-between text-lg font-black text-gray-900 mb-6">
                        <span>应付金额</span>
                        <span className="text-pink-600">¥{totalAmount}</span>
                    </div>

                    {payError && (
                        <p className="mb-4 px-3 py-2 rounded-xl bg-red-50 text-red-600 text-sm font-bold">
                            {payError}
                        </p>
                    )}

                    <button
                        disabled={paying}
                        onClick={handleSimulatedPayment}
                        className="w-full py-3.5 rounded-xl bg-gradient-to-r from-pink-500 to-amber-500 text-white font-bold shadow-lg shadow-pink-500/25 hover:opacity-95 transition disabled:opacity-60"
                    >
                        {paying ? '正在调起安全支付...' : '后端模拟支付 (一键下单)'}
                    </button>
                </div>
            </div>
        </div>
    )
}

export default function CartPage() {
    // useSearchParams() 必须包在 Suspense 里，否则 next build 会报
    // "useSearchParams() should be wrapped in a suspense boundary"
    return (
        <Suspense
            fallback={
                <div className='max-w-md mx-auto px-4 py-20 text-center text-sm text-gray-400'>
                    加载中...
                </div>
            }
        >
            <CartContent />
        </Suspense>
    )
}
