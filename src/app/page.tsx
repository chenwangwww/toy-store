'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { mockDB } from '@/services/db';
import Link from 'next/link';
import { Star, ShoppingCart, Sparkles, Filter } from 'lucide-react';
import { useAppDispatch } from '@/store/hooks';
import { addToCart } from '@/store/cartSlice';

export default function HomePage() {
  const [category, setCategory] = useState('all');
  const dispatch = useAppDispatch();

  const { data: toys = [], isLoading } = useQuery({
    queryKey: ['toys', category],
    queryFn: () => mockDB.getToys(category),
  });

  const categories = [
    { id: 'all', label: '全部玩具 🧸' },
    { id: 'educational', label: '智能益智 🧠' },
    { id: 'lego', label: '积木拼装 🏰' },
    { id: 'plush', label: '毛绒公仔 🐻' },
    { id: 'outdoor', label: '户外运动 🛹' },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* 头部 Banner */}
      <div className="relative rounded-3xl bg-gradient-to-r from-pink-500 via-purple-500 to-amber-400 p-8 sm:p-12 text-white shadow-xl overflow-hidden mb-10">
        <div className="relative z-10 max-w-xl">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/20 text-xs font-semibold mb-4 backdrop-blur">
            <Sparkles className="w-3.5 h-3.5" /> 2026 全球儿童精选季
          </span>
          <h1 className="text-3xl sm:text-5xl font-black mb-4 tracking-tight">点亮童年，创造无限欢笑</h1>
          <p className="text-white/90 text-sm sm:text-base mb-6 leading-relaxed">
            探索数百款寓教于乐的高品质玩具，安全环保材质，陪伴孩子健康快乐成长。
          </p>
        </div>
      </div>

      {/* 分类标签栏 */}
      <div className="flex items-center gap-2 overflow-x-auto pb-4 mb-8 scrollbar-none">
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setCategory(cat.id)}
            className={`px-5 py-2.5 rounded-full text-sm font-bold whitespace-nowrap transition shadow-sm ${
              category === cat.id
                ? 'bg-pink-600 text-white shadow-pink-500/25 shadow-md'
                : 'bg-white text-gray-600 hover:bg-pink-50 border border-pink-100'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* 玩具列表网格 */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map(n => (
            <div key={n} className="bg-white rounded-3xl h-80 animate-pulse border border-pink-100" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {toys.map((toy) => (
            <div key={toy.id} className="bg-white rounded-3xl border border-pink-100 shadow-sm hover:shadow-xl transition flex flex-col overflow-hidden group">
              <Link href={`/products/${toy.id}`} className="relative aspect-square overflow-hidden bg-pink-50">
                <img
                  src={toy.image}
                  alt={toy.name}
                  className="w-full h-full object-cover group-hover:scale-105 transition duration-500"
                />
                <span className="absolute top-3 left-3 bg-white/90 backdrop-blur text-pink-600 text-xs font-bold px-2.5 py-1 rounded-full shadow">
                  {toy.ageRange}
                </span>
              </Link>

              <div className="p-5 flex-1 flex flex-col justify-between">
                <div>
                  <Link href={`/products/${toy.id}`} className="font-bold text-gray-800 hover:text-pink-600 transition line-clamp-1 text-lg">
                    {toy.name}
                  </Link>
                  <p className="text-xs text-gray-400 mt-1 line-clamp-2">{toy.description}</p>
                </div>

                <div className="mt-4 flex items-center justify-between">
                  <div>
                    <span className="text-xl font-black text-pink-600">¥{toy.price}</span>
                    {toy.originalPrice && (
                      <span className="text-xs text-gray-400 line-through ml-2">¥{toy.originalPrice}</span>
                    )}
                  </div>
                  <button
                    onClick={() => dispatch(addToCart({ toy }))}
                    className="p-2.5 rounded-2xl bg-pink-50 text-pink-600 hover:bg-pink-600 hover:text-white transition shadow-sm"
                  >
                    <ShoppingCart className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}