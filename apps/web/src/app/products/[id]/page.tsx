'use client';

import React, { useState, Suspense } from 'react';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/api'; // 改为你的真实 api 服务
import { useAppDispatch } from '@/store/hooks';
import { addToCart } from '@/store/cartSlice';
import { ShoppingCart } from 'lucide-react';

// 1. 将原先使用 useParams 的核心内容抽离成内部组件
function ProductDetailContent() {
  const { id } = useParams();
  const dispatch = useAppDispatch();
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);

  const { data: toy, isLoading } = useQuery({
    queryKey: ['toy', id],
    queryFn: () => api.getToyById(id as string),
    enabled: !!id,
  });

  if (isLoading) return <div className="text-center py-20 text-pink-500 font-bold">加载中...</div>;
  if (!toy) return <div className="text-center py-20 text-gray-500">未找到该玩具</div>;

  const handleAddToCart = () => {
    dispatch(addToCart({ toy, quantity: qty }));
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-10">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
        <div className="aspect-square rounded-3xl overflow-hidden bg-pink-50 border border-pink-100 shadow-lg">
          <img src={toy.image} alt={toy.name} className="w-full h-full object-cover" />
        </div>

        <div className="flex flex-col justify-between">
          <div>
            <div className="inline-block px-3 py-1 rounded-full bg-pink-100 text-pink-700 text-xs font-bold mb-3">
              适合年龄：{toy.ageRange}
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-4">{toy.name}</h1>
            <div className="flex items-center gap-4 mb-6">
              <span className="text-3xl font-black text-pink-600">¥{toy.price}</span>
              {toy.originalPrice && <span className="text-gray-400 line-through">¥{toy.originalPrice}</span>}
            </div>
            <p className="text-gray-600 leading-relaxed mb-8">{toy.description}</p>
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="flex items-center border border-gray-200 rounded-xl overflow-hidden bg-white">
                <button onClick={() => setQty(Math.max(1, qty - 1))} className="px-4 py-2 bg-gray-50 font-bold">-</button>
                <span className="px-6 font-bold">{qty}</span>
                <button onClick={() => setQty(qty + 1)} className="px-4 py-2 bg-gray-50 font-bold">+</button>
              </div>
              <button
                onClick={handleAddToCart}
                className="flex-1 py-3.5 rounded-xl bg-gradient-to-r from-pink-500 to-amber-500 text-white font-bold shadow-lg shadow-pink-500/25 transition flex items-center justify-center gap-2"
              >
                <ShoppingCart className="w-5 h-5" />
                {added ? '已成功加入购物车！' : '加入购物车'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// 2. 页面主入口用 Suspense 包裹
export default function ProductDetailPage() {
  return (
    <Suspense fallback={<div className="text-center py-20 text-pink-500 font-bold">加载商品详情中...</div>}>
      <ProductDetailContent />
    </Suspense>
  );
}