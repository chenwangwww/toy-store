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
  code?: string;
}

export type EmailCodePurpose = 'register' | 'reset';

/** 后台商品表单提交的字段 */
export type ToyInput = Partial<Omit<Toy, 'id' | 'rating' | 'sales' | 'createdAt'>>;

/** 后台用户列表项 */
export interface AdminUserListItem {
  id: string;
  username: string;
  email: string;
  phone: string | null;
  avatar: string | null;
  isAdmin: boolean;
  bannedAt: string | null;
  bannedReason: string | null;
  createdAt: string;
  orderCount: number;
}

/** 后台用户详情：多累计消费和最近订单 */
export interface AdminUserDetail extends AdminUserListItem {
  totalSpent: number;
  orders: Order[];
}

/** 通用分页返回 */
export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** 后台用户列表的角色分组：customer = 普通客户，admin = 后台管理员 */
export type AdminUserRole = 'customer' | 'admin';

/** 后台用户列表返回：额外带一份两类账号的总数，给顶部标签栏的角标用 */
export interface AdminUserListResult extends PaginatedResult<AdminUserListItem> {
  counts: Record<AdminUserRole, number>;
}


/** 后台订单列表里的商品行：只带展示需要的字段，不返回完整 Toy */
export interface AdminOrderItem {
  id: string;
  toyId: string;
  quantity: number;
  price: number;
  toy: {
    id: string;
    name: string;
    image: string;
  }
}

/** 后台订单列表项 */
export interface AdminOrderListItem {
  id: string;
  userId: string;
  totalAmount: number;
  status: OrderStatus;
  createdAt: string;
  /** 商品总件数（所有明细 quantity 之和），列表里显示「共 N 件」 */
  itemCount: number;
  /** 下单用户：邮箱筛选和列表展示都要用 */
  user: {
    id: string;
    username: string;
    email: string;
  };
  items: AdminOrderItem[];
}

/** 后台订单列表返回：counts 是各状态的订单数，给状态筛选按钮的角标用 */
export interface AdminOrderListResult extends PaginatedResult<AdminOrderListItem> {
  counts: Record<OrderStatus | 'all', number>
}