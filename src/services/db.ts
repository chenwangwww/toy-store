import { Toy, User, Order } from '@/types';

// 初始种子数据
const INITIAL_TOYS: Toy[] = [
  {
    id: '1',
    name: '智能编程机器狗',
    price: 399,
    originalPrice: 499,
    category: 'educational',
    ageRange: '6-12岁',
    rating: 4.9,
    sales: 1250,
    image: 'https://images.unsplash.com/photo-1535378917042-10a22c95931a?auto=format&fit=crop&q=80&w=600',
    description: '支持图形化编程、语音互动、动作感应，培养儿童逻辑思维与动手能力。',
    stock: 50,
  },
  {
    id: '2',
    name: '星际宇航员积木大城堡',
    price: 268,
    originalPrice: 328,
    category: 'lego',
    ageRange: '8-14岁',
    rating: 4.8,
    sales: 830,
    image: 'https://images.unsplash.com/photo-1587654780291-39c9404d746b?auto=format&fit=crop&q=80&w=600',
    description: '超过 1200 颗粒环保 ABS 材质，精细做工，拼砌出属于孩子的宏伟太空梦。',
    stock: 35,
  },
  {
    id: '3',
    name: '超柔大号害羞毛绒小熊',
    price: 128,
    originalPrice: 158,
    category: 'plush',
    ageRange: '1-6岁',
    rating: 5.0,
    sales: 2300,
    image: 'https://images.unsplash.com/photo-1556015048-d44aa4eb45c3?auto=format&fit=crop&q=80&w=600',
    description: '采用婴儿级亲肤短毛绒，PP棉饱满填充，不掉毛无异味，陪伴宝宝安心入睡。',
    stock: 100,
  },
  {
    id: '4',
    name: '儿童多功能平衡滑板车',
    price: 199,
    originalPrice: 259,
    category: 'outdoor',
    ageRange: '3-8岁',
    rating: 4.7,
    sales: 920,
    image: 'https://images.unsplash.com/photo-1564419320461-6870880221ad?auto=format&fit=crop&q=80&w=600',
    description: '三轮重力转向设计，闪光静音轮，高度可调，让户外运动充满安全与欢笑。',
    stock: 40,
  },
];

// 本地存储数据库存取模拟
export const mockDB = {
  getToys: async (category?: string): Promise<Toy[]> => {
    const data = localStorage.getItem('toyland_toys');
    const toys: Toy[] = data ? JSON.parse(data) : INITIAL_TOYS;
    if (!data) localStorage.setItem('toyland_toys', JSON.stringify(INITIAL_TOYS));
    if (category && category !== 'all') {
      return toys.filter(t => t.category === category);
    }
    return toys;
  },
  getToyById: async (id: string): Promise<Toy | undefined> => {
    const toys = await mockDB.getToys();
    return toys.find(t => t.id === id);
  },
  createOrder: async (userId: string, items: { toy: Toy; quantity: number }[], totalAmount: number): Promise<Order> => {
    const ordersData = localStorage.getItem('toyland_orders') || '[]';
    const orders: Order[] = JSON.parse(ordersData);
    const newOrder: Order = {
      id: 'ORD-' + Math.floor(100000 + Math.random() * 900000),
      userId,
      items,
      totalAmount,
      status: 'PAID', // 模拟支付成功
      createdAt: new Date().toISOString(),
    };
    orders.unshift(newOrder);
    localStorage.setItem('toyland_orders', JSON.stringify(orders));
    return newOrder;
  },
  getOrders: async (userId: string): Promise<Order[]> => {
    const ordersData = localStorage.getItem('toyland_orders') || '[]';
    const orders: Order[] = JSON.parse(ordersData);
    return orders.filter(o => o.userId === userId);
  }
};