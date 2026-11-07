'use client'

import React, { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { adminApi } from '@/services/adminApi'
import { getAccessToken } from '@/lib/auth-client'
import type {
  AdminOrderListItem,
  AdminOrderListResult,
  OrderStatus,
} from '@toy-store/shared'
import {
  Search,
  ChevronLeft,
  ChevronRight,
  Receipt,
  Mail,
} from 'lucide-react'

const PAGE_SIZE = 10

const STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING: '待支付',
  PAID: '已支付',
  SHIPPED: '已发货',
  COMPLETED: '已完成',
  CANCELLED: '已取消',
}

/** 下拉框和状态角标共用一套配色 */
const STATUS_STYLE: Record<OrderStatus, string> = {
  PENDING: 'bg-amber-50 text-amber-700 border-amber-200',
  PAID: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  SHIPPED: 'bg-sky-50 text-sky-700 border-sky-200',
  COMPLETED: 'bg-gray-50 text-gray-600 border-gray-200',
  CANCELLED: 'bg-red-50 text-red-600 border-red-200',
}

const STATUS_TABS: { key: OrderStatus | 'all'; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'PENDING', label: '待支付' },
  { key: 'PAID', label: '已支付' },
  { key: 'SHIPPED', label: '已发货' },
  { key: 'COMPLETED', label: '已完成' },
  { key: 'CANCELLED', label: '已取消' },
]

const STATUS_OPTIONS: OrderStatus[] = ['PENDING', 'PAID', 'SHIPPED', 'COMPLETED', 'CANCELLED']

/** 列表里只显示前一个商品名，剩下的用"等 N 种"带过 */
function itemSummary(order: AdminOrderListItem) {
  const names = order.items.map((item) => item.toy.name)
  if (names.length === 0) return '—'
  return names.length === 1 ? names[0] : `${names[0]} 等 ${names.length} 种`
}

export default function AdminOrdersPage() {
  const router = useRouter()
  const [authorized, setAuthorized] = useState(false)

  const [emailInput, setEmailInput] = useState('')
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<OrderStatus | 'all'>('all')
  const [page, setPage] = useState(1)

  const [data, setData] = useState<AdminOrderListResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  // 权限校验：与 toys / users 页同一套
  useEffect(() => {
    const raw = sessionStorage.getItem('admin_user')
    if (!raw || !getAccessToken()) {
      sessionStorage.removeItem('admin_user')
      router.replace('/admin/login')
      return
    }

    let isAdmin = false
    try {
      isAdmin = Boolean(JSON.parse(raw)?.isAdmin)
    } catch {
      isAdmin = false
    }

    if (!isAdmin) {
      sessionStorage.removeItem('admin_user')
      router.replace('/admin/login')
      return
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAuthorized(true)
  }, [router])

  const fetchOrders = useCallback(async () => {
    if (!getAccessToken()) {
      router.replace('/admin/login')
      return
    }

    setLoading(true)
    setError('')

    try {
      const res = await adminApi.getOrders({ page, pageSize: PAGE_SIZE, email, status })
      setData(res)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败')
      // 登录态彻底失效（authFetch 已清空本地 token）→ 回登录页
      if (!getAccessToken()) {
        sessionStorage.removeItem('admin_user')
        router.replace('/admin/login')
      }
    } finally {
      setLoading(false)
    }
  }, [page, email, status, router])

  useEffect(() => {
    // 首屏 / 翻页 / 筛选变化时重新拉取，进入 loading 态需要同步 setState
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchOrders()
  }, [fetchOrders])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setPage(1)
    setEmail(emailInput.trim())
  }

  /** 切换状态筛选：页码必须归 1，否则从第 3 页切过去可能直接空列表 */
  const handleSwitchStatus = (next: OrderStatus | 'all') => {
    if (next === status) return
    setStatus(next)
    setPage(1)
  }

  const handleStatusChange = async (
    e: React.ChangeEvent<HTMLSelectElement>,
    order: AdminOrderListItem,
  ) => {
    // 先把元素抓在手里：await 之后 React 会把 currentTarget 置空
    const select = e.currentTarget
    const next = select.value as OrderStatus
    if (next === order.status) return

    const tip =
      next === 'CANCELLED'
        ? '\n取消后该订单的商品库存和销量会一并还原。'
        : order.status === 'CANCELLED'
          ? '\n该订单之前已取消，恢复状态会重新扣减库存、增加销量。'
          : ''

    if (!confirm(`把订单 ${order.id.slice(0, 8)} 的状态改为「${STATUS_LABEL[next]}」吗？${tip}`)) {
      // 原生 select 不受控：value prop 没变，React 不会重置 DOM，得手动还原
      select.value = order.status
      return
    }

    setUpdatingId(order.id)
    setError('')

    try {
      await adminApi.updateOrderStatus(order.id, next)
      await fetchOrders()
    } catch (err) {
      // 失败同样要还原，不然下拉框会显示一个数据库里并不存在的状态
      select.value = order.status
      setError(err instanceof Error ? err.message : '更新订单状态失败')
    } finally {
      setUpdatingId(null)
    }
  }

  if (!authorized) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center font-bold text-pink-600">
        正在进行安全校验...
      </div>
    )
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1

  return (
    <div className="max-w-7xl mx-auto px-4 py-10">
      {/* 状态筛选：角标数字受邮箱影响，不受当前状态影响 */}
      <div className="flex flex-wrap items-center gap-2 mb-6">
        {STATUS_TABS.map((tab) => {
          const active = status === tab.key
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => handleSwitchStatus(tab.key)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-bold transition border ${
                active
                  ? 'bg-gradient-to-r from-pink-500 to-amber-500 text-white border-transparent shadow'
                  : 'bg-white text-gray-500 border-pink-100 hover:bg-pink-50 hover:text-pink-600'
              }`}
            >
              {tab.label}
              <span
                className={`px-1.5 py-0.5 rounded-md text-[10px] font-black leading-none ${
                  active ? 'bg-white/25 text-white' : 'bg-gray-100 text-gray-500'
                }`}
              >
                {data?.counts[tab.key] ?? 0}
              </span>
            </button>
          )
        })}
      </div>

      <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-pink-100 text-pink-700 text-xs font-bold mb-2">
            <Receipt className="w-3.5 h-3.5" /> 交易管理
          </div>
          <h1 className="text-3xl font-black text-gray-900">订单列表</h1>
          <p className="text-sm text-gray-400 mt-1">
            共 {data?.total ?? 0} 笔订单
            {email ? `（邮箱包含「${email}」）` : ''}
            ，改状态会同步调整商品库存
          </p>
        </div>

        <form onSubmit={handleSearch} className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              placeholder="按用户邮箱筛选，如 chenwang"
              className="w-72 pl-9 pr-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-pink-500 text-gray-800"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-pink-500 to-amber-500 text-white text-sm font-bold shadow hover:opacity-95 transition"
          >
            搜索
          </button>
          {(email || status !== 'all') && (
            <button
              type="button"
              onClick={() => {
                setEmailInput('')
                setEmail('')
                setStatus('all')
                setPage(1)
              }}
              className="px-3 py-2.5 rounded-xl border border-gray-200 bg-white text-gray-500 text-sm hover:bg-gray-50 transition"
            >
              重置
            </button>
          )}
        </form>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-xl bg-red-50 text-red-600 text-sm font-medium">{error}</div>
      )}

      <div className="bg-white rounded-3xl border border-pink-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="text-center py-20 text-pink-500 font-bold">加载中...</div>
        ) : !data || data.items.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            {email ? `没有找到邮箱包含「${email}」的订单` : '暂无订单'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-pink-50/50 border-b border-pink-100 text-xs font-bold text-gray-600 uppercase">
                  <th className="p-4">订单</th>
                  <th className="p-4">用户</th>
                  <th className="p-4">商品</th>
                  <th className="p-4">金额</th>
                  <th className="p-4">状态</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm">
                {data.items.map((order) => (
                  <tr key={order.id} className="hover:bg-pink-50/20 transition">
                    <td className="p-4">
                      <div className="font-mono text-xs font-bold text-gray-700">
                        {order.id.slice(0, 8)}
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        {new Date(order.createdAt).toLocaleString()}
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="font-bold text-gray-800">{order.user.username}</div>
                      <div className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                        <Mail className="w-3 h-3" />
                        {order.user.email}
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="text-gray-700 max-w-[220px] truncate">
                        {itemSummary(order)}
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5">共 {order.itemCount} 件</div>
                    </td>
                    <td className="p-4 font-black text-gray-900">¥{order.totalAmount}</td>
                    <td className="p-4">
                      <select
                        value={order.status}
                        disabled={updatingId === order.id}
                        onChange={(e) => handleStatusChange(e, order)}
                        className={`text-xs font-bold px-2.5 py-1.5 rounded-full border cursor-pointer transition disabled:opacity-50 disabled:cursor-wait ${STATUS_STYLE[order.status]}`}
                      >
                        {STATUS_OPTIONS.map((value) => (
                          <option key={value} value={value}>
                            {STATUS_LABEL[value]}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {data && data.total > data.pageSize && (
        <div className="flex items-center justify-between mt-6 text-sm text-gray-500">
          <span>
            第 {data.page} / {totalPages} 页
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={data.page <= 1}
              className="flex items-center gap-1 px-3 py-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40 transition"
            >
              <ChevronLeft className="w-4 h-4" /> 上一页
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={data.page >= totalPages}
              className="flex items-center gap-1 px-3 py-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40 transition"
            >
              下一页 <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}