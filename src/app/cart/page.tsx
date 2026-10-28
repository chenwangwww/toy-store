'use client'

import React, { useState } from 'react';
import { useAppSelector, useAppDispatch } from '@/store/hooks';
import { removeFromCart, updateQuantity, clearCart } from '@/store/cartSlice';
import { api } from '@/services/api';
import { Trash2, ShoppingBag, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';

export default function CartPage() {
    const dispatch = useAppDispatch()
    const cartItems = useAppSelector((state) => state.cart.items)
    const user = useAppSelector((state) => state.auth.user)
    const [paying, setPaying] = useState(false)
    const [successOrder, setSuccessOrder] = useState<any>(null);

    const totalAmount = cartItems.reduce((sum, item) => sum + item.toy.price * item.quantity, 0);
    const handleSimulatedPayment = async () => {
        if (!user) {
            alert('请先登录再进行支付')
            return
        }
        setPaying(true)
        setTimeout(async () => {
            const order = await api.createOrder(user.id, cartItems, totalAmount)
            dispatch(clearCart())
            setSuccessOrder(order)
            setPaying(false)
        }, 1500);
    }

    if (successOrder) {
        return (
            <div className='max-w-md mx-auto px-4 py-20 text-center'>
                <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg">
                    <CheckCircle2 className="w-10 h-10" />
                </div>
                <h1 className="text-2xl font-bold mb-2">支付成功！</h1>
                <p className="text-gray-500 text-sm mb-6">订单号：{successOrder.id}，后端已模拟生成订单记录。</p>
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

                    <button
                        disabled={paying}
                        onClick={handleSimulatedPayment}
                        className="w-full py-3.5 rounded-xl bg-gradient-to-r from-pink-500 to-amber-500 text-white font-bold shadow-lg shadow-pink-500/25 hover:opacity-95 transition"
                    >
                        {paying ? '正在调起安全支付...' : '后端模拟支付 (一键下单)'}
                    </button>
                </div>
            </div>
        </div>
    )
}