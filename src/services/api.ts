import { Toy, Order, User } from '@/types'

export const api = {
    getToys: async (category?: string): Promise<Toy[]> => {
        const url = category && category !== 'all' ? `/api/toys?category=${category}` : '/api/toys';
        const res = await fetch(url)
        if (!res.ok) {
            throw new Error('获取商品失败')
        }
        return res.json()
    },
    getToyById: async (id: string): Promise<Toy> => {
        const res = await fetch(`/api/toys/${id}`)
        if (!res.ok) throw new Error('获取详情失败')
        return res.json()
    },

    createOrder: async (userId: string, items: any[], totalAmount: number): Promise<Order> => {
        const res = await fetch('/api/orders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, items, totalAmount })
        });
        if (!res.ok) throw new Error('下单失败')
        return res.json()
    },

    getOrders: async(userId: string): Promise<Order[]> => {
        const res = await fetch(`/api/orders?userId=${userId}`)
        if(!res.ok)throw new Error('获取订单失败')
        return res.json();
    },

    auth: async (data: {action: 'login' | 'register'; email: string; passowrd?:string; username?:string}): Promise<User> => {
        const res = await fetch('/api/auth', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(data)
        })
        const result = await res.json()
        if (!res.ok) throw new Error(result.error || '认证失败')
        return result
    }
}