export interface Toy {
    id: string;
    name: string;
    price: number;
    originalPrice?: number;
    category: 'educational' | 'plush' | 'lego' | 'outdoor';
    ageRange: string;
    rating: number;
    sales: number;
    image: string;
    description: string;
    stock: number;
}

export interface User {
  id: string;
  username: string;
  email: string;
  phone: string;
  avatar: string;
}

export interface Order {
    id: string;
    userId: string;
    items: {toy: Toy; quantity: number}[];
    totalAmount: number;
    status: 'PENDING' | 'PAID' | 'SHIPPED' | 'COMPLETED';
    createdAt: string;
}