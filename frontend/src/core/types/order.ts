// Order types shared across frontend features

export interface OrderItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  currency: string;
}

export interface OrderCustomer {
  fullName: string;
  email: string;
  phone?: string;
  addressLine1?: string;
  city?: string;
  country?: string;
}

export interface Order {
  _id: string;
  userId: string;
  userEmail: string;
  items: OrderItem[];
  subtotal: number;
  total: number;
  currency: string;
  status: 'pending' | 'paid' | 'failed' | 'cancelled';
  paymentProvider: string;
  paymentReference?: string;
  customer: OrderCustomer;
  createdAt: string;
  updatedAt: string;
}

export interface CreateOrderPayload {
  items: OrderItem[];
  subtotal: number;
  total: number;
  currency: string;
  paymentProvider: string;
  customer: OrderCustomer;
}
