'use client'

import React, { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { adminApi } from '@/services/adminApi'
import { getAccessToken } from '@/lib/auth-client'
import type {
  AdminUserDetail,
  AdminUserListItem,
  AdminUserListResult,
  AdminUserRole,
} from '@toy-store/shared'
import {
  Search,
  ShieldBan,
  ShieldCheck,
  X,
  Package,
  Mail,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Users,
} from 'lucide-react'

const PAGE_SIZE = 10

/** 顶部标签栏：客户 / 后台管理员 */
const ROLE_TABS: { key: AdminUserRole; label: string; icon: typeof Users }[] = [
  { key: 'customer', label: '客户', icon: Users },
  { key: 'admin', label: '后台管理员', icon: ShieldCheck },
]

export default function AdminUsersPage() {
  const router = useRouter()
  const [authorized, setAuthorized] = useState(false)

  const [role, setRole] = useState<AdminUserRole>('customer')
  const [searchInput, setSearchInput] = useState('')
  const [keyword, setKeyword] = useState('')
  const [status, setStatus] = useState<'all' | 'active' | 'banned'>('all')
  const [page, setPage] = useState(1)

  const [data, setData] = useState<AdminUserListResult | null>(null)
  // 标签栏角标用的两类账号总数，跟列表分开存，切标签时不会闪成 0
  const [counts, setCounts] = useState<Record<AdminUserRole, number>>({ customer: 0, admin: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [detail, setDetail] = useState<AdminUserDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [reason, setReason] = useState('')
  const [acting, setActing] = useState(false)

  // 权限校验：与 toys 页同一套
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

  const fetchUsers = useCallback(async () => {
    if (!getAccessToken()) {
      router.replace('/admin/login')
      return
    }

    setLoading(true)
    setError('')

    try {
      const res = await adminApi.getUsers({ page, pageSize: PAGE_SIZE, keyword, status, role })
      setData(res)
      setCounts(res.counts)
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
  }, [page, keyword, status, role, router])

  useEffect(() => {
    // 首屏 / 翻页 / 筛选变化时重新拉取，进入 loading 态需要同步 setState
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchUsers()
  }, [fetchUsers])

  const openDetail = async (id: string) => {
    setDetailLoading(true)
    setDetail(null)
    setReason('')

    try {
      const res = await adminApi.getUser(id)
      setDetail(res)
      setReason(res.bannedReason ?? '')
    } catch (err) {
      alert(err instanceof Error ? err.message : '加载详情失败')
    } finally {
      setDetailLoading(false)
    }
  }

  const handleToggleBan = async (user: AdminUserListItem | AdminUserDetail) => {
    const nextBanned = !user.bannedAt

    const ok = nextBanned
      ? confirm(`确定封禁「${user.username}」吗？封禁后该用户会立刻被踢下线，且无法再登录。`)
      : confirm(`确定解封「${user.username}」吗？`)
    if (!ok) return

    setActing(true)
    try {
      await adminApi.banUser(user.id, {
        banned: nextBanned,
        reason: nextBanned ? reason.trim() || undefined : undefined,
      })
      await fetchUsers()
      if (detail?.id === user.id) await openDetail(user.id)
    } catch (err) {
      alert(err instanceof Error ? err.message : '操作失败')
    } finally {
      setActing(false)
    }
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setPage(1)
    setKeyword(searchInput.trim())
  }

  /** 切标签页：回到第一页，搜索词和状态筛选保留（按标签页各自生效） */
  const handleSwitchRole = (next: AdminUserRole) => {
    if (next === role) return
    setRole(next)
    setPage(1)
  }

  if (!authorized) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center font-bold text-pink-600">
        正在进行安全校验...
      </div>
    )
  }

  const isAdminTab = role === 'admin'
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1

  return (
    <div className="max-w-7xl mx-auto px-4 py-10">
      {/* 顶部标签栏：客户 / 后台管理员 */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="inline-flex items-center gap-1 p-1.5 rounded-2xl bg-white border border-pink-100 shadow-sm">
          {ROLE_TABS.map((tab) => {
            const active = role === tab.key
            const Icon = tab.icon
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => handleSwitchRole(tab.key)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition ${
                  active
                    ? 'bg-gradient-to-r from-pink-500 to-amber-500 text-white shadow'
                    : 'text-gray-500 hover:bg-pink-50 hover:text-pink-600'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
                <span
                  className={`px-1.5 py-0.5 rounded-md text-[10px] font-black leading-none ${
                    active ? 'bg-white/25 text-white' : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  {counts[tab.key]}
                </span>
              </button>
            )
          })}
        </div>

        <p className="text-xs text-gray-400">
          {isAdminTab
            ? '可登录管理后台的账号，管理员账号不可封禁'
            : '商城的注册用户，封禁后立刻踢下线且无法再登录'}
        </p>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-pink-100 text-pink-700 text-xs font-bold mb-2">
            {isAdminTab ? <ShieldCheck className="w-3.5 h-3.5" /> : <Users className="w-3.5 h-3.5" />}
            {isAdminTab ? '权限管理' : '会员管理'}
          </div>
          <h1 className="text-3xl font-black text-gray-900">
            {isAdminTab ? '管理员列表' : '用户列表'}
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            共 {data?.total ?? 0} {isAdminTab ? '位管理员' : '位用户'}，
            {isAdminTab ? '管理员账号不可封禁' : '封禁后该用户会立刻退出登录且无法再登录'}
          </p>
        </div>

        <form onSubmit={handleSearch} className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="搜索邮箱 / 用户名"
              className="w-64 pl-9 pr-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-pink-500 text-gray-800"
            />
          </div>
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as 'all' | 'active' | 'banned')
              setPage(1)
            }}
            className="px-3 py-2.5 rounded-xl border border-gray-200 text-sm bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-pink-500"
          >
            <option value="all">全部状态</option>
            <option value="active">正常</option>
            <option value="banned">已封禁</option>
          </select>
          <button
            type="submit"
            className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-pink-500 to-amber-500 text-white text-sm font-bold shadow hover:opacity-95 transition"
          >
            搜索
          </button>
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
            {isAdminTab ? '没有匹配的管理员' : '没有匹配的用户'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-pink-50/50 border-b border-pink-100 text-xs font-bold text-gray-600 uppercase">
                  <th className="p-4">用户</th>
                  <th className="p-4">注册时间</th>
                  {!isAdminTab && <th className="p-4">订单数</th>}
                  <th className="p-4">状态</th>
                  <th className="p-4 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm">
                {data.items.map((user) => (
                  <tr key={user.id} className="hover:bg-pink-50/20 transition">
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <img
                          src={user.avatar || 'https://api.dicebear.com/7.x/bottts/svg?seed=default'}
                          alt=""
                          className="w-10 h-10 rounded-full bg-pink-50 border border-pink-100"
                        />
                        <div>
                          <div className="font-bold text-gray-800">
                            {user.username}
                            {user.isAdmin && (
                              <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-white align-middle">
                                ADMIN
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-gray-400">{user.email}</span>
                        </div>
                      </div>
                    </td>
                    <td className="p-4 text-gray-600">
                      {new Date(user.createdAt).toLocaleDateString()}
                    </td>
                    {!isAdminTab && <td className="p-4 text-gray-600">{user.orderCount}</td>}
                    <td className="p-4">
                      {user.bannedAt ? (
                        <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-red-50 text-red-600">
                          已封禁
                        </span>
                      ) : (
                        <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-600">
                          正常
                        </span>
                      )}
                    </td>
                    <td className="p-4 text-right space-x-2 whitespace-nowrap">
                      <button
                        onClick={() => openDetail(user.id)}
                        className="px-3 py-1.5 rounded-xl bg-gray-50 text-gray-600 text-xs font-bold hover:bg-pink-100 hover:text-pink-600 transition"
                      >
                        详情
                      </button>
                      {/* 管理员标签页不出现封禁入口：管理员账号一律不可封禁 */}
                      {!isAdminTab && (
                        <button
                          onClick={() => handleToggleBan(user)}
                          disabled={acting || user.isAdmin}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition disabled:opacity-40 ${
                            user.bannedAt
                              ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
                              : 'bg-red-50 text-red-600 hover:bg-red-100'
                          }`}
                        >
                          {user.bannedAt ? '解封' : '封禁'}
                        </button>
                      )}
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

      {(detail || detailLoading) && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full p-8 relative my-8">
            <button
              onClick={() => {
                setDetail(null)
                setReason('')
              }}
              className="absolute top-6 right-6 text-gray-400 hover:text-gray-600 p-1"
            >
              <X className="w-5 h-5" />
            </button>

            {detailLoading || !detail ? (
              <div className="py-20 text-center text-pink-500 font-bold">加载中...</div>
            ) : (
              <>
                <div className="flex items-center gap-4 mb-6">
                  <img
                    src={detail.avatar || 'https://api.dicebear.com/7.x/bottts/svg?seed=default'}
                    alt=""
                    className="w-16 h-16 rounded-full bg-pink-50 border-2 border-pink-200"
                  />
                  <div>
                    <h2 className="text-2xl font-black text-gray-900">{detail.username}</h2>
                    <div className="flex items-center gap-3 text-xs text-gray-400 mt-1">
                      <span className="flex items-center gap-1">
                        <Mail className="w-3.5 h-3.5" /> {detail.email}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" />
                        {new Date(detail.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </div>

                {detail.bannedAt && (
                  <div className="mb-4 p-3 rounded-xl bg-red-50 text-red-600 text-sm">
                    <div className="font-bold flex items-center gap-1.5">
                      <ShieldBan className="w-4 h-4" /> 已封禁
                    </div>
                    <div className="mt-1 text-xs">
                      封禁时间：{new Date(detail.bannedAt).toLocaleString()}
                      {detail.bannedReason ? `　原因：${detail.bannedReason}` : ''}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-3 gap-3 mb-6">
                  <div className="p-4 rounded-2xl bg-pink-50/40 border border-pink-50">
                    <div className="text-xs text-gray-400">订单数</div>
                    <div className="text-xl font-black text-gray-900">{detail.orderCount}</div>
                  </div>
                  <div className="p-4 rounded-2xl bg-pink-50/40 border border-pink-50">
                    <div className="text-xs text-gray-400">累计消费</div>
                    <div className="text-xl font-black text-pink-600">¥{detail.totalSpent.toFixed(2)}</div>
                  </div>
                  <div className="p-4 rounded-2xl bg-pink-50/40 border border-pink-50">
                    <div className="text-xs text-gray-400">账号状态</div>
                    <div
                      className={`text-xl font-black ${
                        detail.bannedAt ? 'text-red-600' : 'text-emerald-600'
                      }`}
                    >
                      {detail.bannedAt ? '已封禁' : '正常'}
                    </div>
                  </div>
                </div>

                <h3 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
                  <Package className="w-4 h-4 text-pink-600" /> 最近订单
                </h3>

                {detail.orders.length === 0 ? (
                  <p className="text-sm text-gray-400 py-6 text-center">该用户暂无订单</p>
                ) : (
                  <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                    {detail.orders.map((order) => (
                      <div
                        key={order.id}
                        className="p-3 rounded-2xl border border-gray-100 flex items-center justify-between text-sm"
                      >
                        <div>
                          <div className="font-bold text-gray-800">¥{order.totalAmount}</div>
                          <div className="text-xs text-gray-400">
                            {new Date(order.createdAt).toLocaleString()}
                          </div>
                        </div>
                        <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-pink-50 text-pink-600">
                          {order.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="mt-6 pt-5 border-t border-gray-100">
                  {detail.bannedAt ? (
                    <button
                      onClick={() => handleToggleBan(detail)}
                      disabled={acting}
                      className="w-full py-3 rounded-xl bg-emerald-50 text-emerald-600 font-bold hover:bg-emerald-100 transition disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      <ShieldCheck className="w-4 h-4" /> 解封该用户
                    </button>
                  ) : (
                    <div className="space-y-3">
                      <input
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="封禁原因（可选，会展示给用户）"
                        className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-pink-500 text-gray-800"
                      />
                      <button
                        onClick={() => handleToggleBan(detail)}
                        disabled={acting || detail.isAdmin}
                        className="w-full py-3 rounded-xl bg-red-50 text-red-600 font-bold hover:bg-red-100 transition disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        <ShieldBan className="w-4 h-4" />
                        {detail.isAdmin ? '管理员账号不可封禁' : '封禁该用户'}
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}