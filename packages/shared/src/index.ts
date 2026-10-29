/**
 * 前后端共用的领域类型。
 * 只放类型（type / interface），不要放任何运行时代码，
 * 这样 api / web / admin 三个子项目都能直接引用而不会引入额外依赖。
 */

export type ToyCategory = 'educational' | 'plush' | 'lego' | 'outdoor';

export type OrderStatus = 'PENDING' | 'PAID' | 'SHIPPED' | 'COMPLETED' | 'CANCELLED';

export interface Toy {
  id: string;
  name: string;
  price: number;
  originalPrice?: number | null;
  category: ToyCategory;
  ageRange: string;
  rating: number;
  sales: number;
  image: string;
  description: string;
  stock: number;
  createdAt?: string;
}

export interface User {
  id: string;
  username: string;
  email: string;
  phone?: string | null;
  avatar?: string | null;
  isAdmin?: boolean;
  createdAt?: string;
}

export interface OrderItem {
  id?: string;
  orderId?: string;
  toyId: string;
  toy: Toy;
  quantity: number;
  price?: number;
}

export interface Order {
  id: string;
  userId: string;
  items: OrderItem[];
  totalAmount: number;
  status: OrderStatus;
  createdAt: string;
}

/** 下单时提交给后端的购物车条目 */
export interface CreateOrderItemPayload {
  toy: Pick<Toy, 'id' | 'price'>;
  quantity: number;
}

export interface AuthPayload {
  action: 'login' | 'register';
  email: string;
  password?: string;
  username?: string;
}

/** 后台商品表单提交的字段 */
export type ToyInput = Partial<Omit<Toy, 'id' | 'rating' | 'sales' | 'createdAt'>>;
