'use client'

import React, { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { adminApi } from "@/services/adminApi"
import { Toy } from "@toy-store/shared"
import { Plus, Edit, Trash2, Sparkles, X, } from "lucide-react"


export default function AdminToysPage() {

  const router = useRouter()
  const [authorized, setAuthorized] = useState(false)

  const [toys, setToys] = useState<Toy[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingToy, setEditingToy] = useState<Toy | null>(null)

  const [form, setForm] = useState({
    name: '',
    price: '',
    originalPrice: '',
    category: 'educational',
    ageRange: '3-8岁',
    stock: '100',
    image: '',
    description: '',
  })

  const fetchToys = async () => {
    try {
      const data = await adminApi.getToys()
      setToys(data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  // 供事件处理器调用：手动触发刷新时才需要重新进入 loading 态
  const refreshToys = () => {
    setLoading(true)
    fetchToys()
  }

  useEffect(() => {
    // 首屏加载：所有 setState 都发生在 await 之后，不会造成同步级联渲染
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchToys()
  }, [])

  useEffect(() => {
    const adminData = sessionStorage.getItem('admin_user');
    if (!adminData) {
      alert('您尚未登录管理员后台，请先登录！');
      router.push('/admin/login');
      return
    }

    const user = JSON.parse(adminData)
    if (!user.isAdmin) {
      alert('权限拒绝：您不是管理员！');
      sessionStorage.removeItem('admin_user');
      router.push('/admin/login');
      return;
    }
    // sessionStorage 只能在挂载后读取，这里同步回填一次权限状态
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAuthorized(true)
  }, [router])



  const handleOpenAddModal = () => {
    setEditingToy(null)
    setForm({
      name: '',
      price: '',
      originalPrice: '',
      category: 'educational',
      ageRange: '3-8岁',
      stock: '100',
      image: 'https://images.unsplash.com/photo-1535378917042-10a22c95931a?auto=format&fit=crop&q=80&w=600',
      description: '',
    })
    setModalOpen(true)
  }

  const handleOpenEditModal = (toy: Toy) => {
    setEditingToy(toy)
    setForm({
      name: toy.name,
      price: String(toy.price),
      originalPrice: toy.originalPrice ? String(toy.originalPrice) : '',
      category: toy.category,
      ageRange: toy.ageRange,
      stock: String(toy.stock),
      image: toy.image,
      description: toy.description,
    })
    setModalOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        ...form,
        // 将 category 断言为 Toy 中支持的具体分类类型
        category: form.category as 'educational' | 'plush' | 'lego' | 'outdoor',
        price: Number(form.price),
        originalPrice: form.originalPrice ? Number(form.originalPrice) : undefined,
        stock: Number(form.stock),
      };

      if (editingToy) {
        await adminApi.updateToy(editingToy.id, payload);
      } else {
        await adminApi.createToy(payload);
      }
      setModalOpen(false);
      refreshToys();
    } catch (err) {
      alert('保存失败');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除这款玩具吗？')) return;
    try {
      await adminApi.deleteToy(id);
      refreshToys();
    } catch (err) {
      alert('删除失败');
    }
  };

  if (!authorized) {
    return <div className="min-h-screen bg-slate-50 flex items-center justify-center font-bold text-pink-600">正在进行安全校验...</div>
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-10">
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-pink-100 text-pink-700 text-xs font-bold mb-2">
            <Sparkles className="w-3.5 h-3.5" /> Toyland Admin Console
          </div>
          <h1 className="text-3xl font-black text-gray-900">玩具商品管理后台</h1>
        </div>
        <button
          onClick={handleOpenAddModal}
          className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-gradient-to-r from-pink-500 to-amber-500 text-white font-bold shadow-lg shadow-pink-500/25 hover:opacity-95 transition"
        >
          <Plus className="w-5 h-5" /> 添加新玩具
        </button>
      </div>

      <div className="bg-white rounded-3xl border border-pink-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="text-center py-20 text-pink-500 font-bold">加载中...</div>
        ) : toys.length === 0 ? (
          <div className="text-center py-20 text-gray-400">暂无玩具数据，点击右上角添加</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-pink-50/50 border-b border-pink-100 text-xs font-bold text-gray-600 uppercase">
                  <th className="p-4">商品图</th>
                  <th className="p-4">名称 / 分类</th>
                  <th className="p-4">价格 (¥)</th>
                  <th className="p-4">库存</th>
                  <th className="p-4">已售</th>
                  <th className="p-4 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm">
                {toys.map((toy) => (
                  <tr key={toy.id} className="hover:bg-pink-50/20 transition">
                    <td className="p-4">
                      <img src={toy.image} alt={toy.name} className="w-12 h-12 rounded-xl object-cover bg-pink-50 border border-pink-100" />
                    </td>
                    <td className="p-4">
                      <div className="font-bold text-gray-800">{toy.name}</div>
                      <span className="text-xs text-pink-600 bg-pink-100 px-2 py-0.5 rounded-md font-medium">
                        {toy.category} · {toy.ageRange}
                      </span>
                    </td>
                    <td className="p-4 font-black text-pink-600">¥{toy.price}</td>
                    <td className="p-4 text-gray-600">{toy.stock} 件</td>
                    <td className="p-4 text-gray-600">{toy.sales}</td>
                    <td className="p-4 text-right space-x-2">
                      <button
                        onClick={() => handleOpenEditModal(toy)}
                        className="p-2 rounded-xl bg-gray-50 text-gray-600 hover:bg-pink-100 hover:text-pink-600 transition"
                        title="编辑"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(toy.id)}
                        className="p-2 rounded-xl bg-red-50 text-red-600 hover:bg-red-100 transition"
                        title="删除"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full p-8 relative animate-in fade-in zoom-in-95 my-8">
            <button
              onClick={() => setModalOpen(false)}
              className="absolute top-6 right-6 text-gray-400 hover:text-gray-600 p-1"
            >
              <X className="w-5 h-5" />
            </button>

            <h2 className="text-2xl font-bold text-gray-800 mb-6">
              {editingToy ? '编辑玩具信息' : '添加新玩具'}
            </h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1 uppercase">玩具名称</label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="例如：智能编程机器狗"
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-pink-500 text-gray-800"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1 uppercase">现价 (¥)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={form.price}
                    onChange={(e) => setForm({ ...form, price: e.target.value })}
                    placeholder="399"
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-pink-500 text-gray-800"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1 uppercase">原价 (¥)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.originalPrice}
                    onChange={(e) => setForm({ ...form, originalPrice: e.target.value })}
                    placeholder="499"
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-pink-500 text-gray-800"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1 uppercase">分类</label>
                  <select
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-pink-500 text-gray-800 bg-white"
                  >
                    <option value="educational">智能益智</option>
                    <option value="lego">积木拼装</option>
                    <option value="plush">毛绒公仔</option>
                    <option value="outdoor">户外运动</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1 uppercase">适用年龄</label>
                  <input
                    type="text"
                    value={form.ageRange}
                    onChange={(e) => setForm({ ...form, ageRange: e.target.value })}
                    placeholder="6-12岁"
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-pink-500 text-gray-800"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1 uppercase">库存数量</label>
                  <input
                    type="number"
                    value={form.stock}
                    onChange={(e) => setForm({ ...form, stock: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-pink-500 text-gray-800"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1 uppercase">商品图片 URL</label>
                <input
                  type="text"
                  required
                  value={form.image}
                  onChange={(e) => setForm({ ...form, image: e.target.value })}
                  placeholder="https://images.unsplash.com/..."
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-pink-500 text-gray-800"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1 uppercase">商品描述</label>
                <textarea
                  rows={3}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="请输入详细的玩具介绍..."
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-pink-500 text-gray-800"
                />
              </div>

              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="flex-1 py-3 rounded-xl border border-gray-200 font-bold text-gray-600 hover:bg-gray-50 transition"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 rounded-xl bg-gradient-to-r from-pink-500 to-amber-500 text-white font-bold shadow-lg shadow-pink-500/25 hover:opacity-95 transition"
                >
                  确认保存
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}