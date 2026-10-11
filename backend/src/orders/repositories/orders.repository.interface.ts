import { PoolClient } from 'pg';

export interface OrderItemRow {
  id: number;
  order_id: number;
  product_id: number;
  name: string;
  price: number | string;
  quantity: number;
  subtotal: number | string;
}

export interface OrderRow {
  id: number;
  user_id: number;
  order_number: string;
  total_amount: number | string;
  status: string;
  payment_method?: string | null;
  payment_intent_id?: string | null;
  created_at: Date;
  updated_at: Date;
  user_email?: string;
  user_name?: string;
  items?: OrderItemRow[];
}

export interface CreateOrderParams {
  userId: number;
  orderNumber: string;
  totalAmount: number;
  status: string;
  paymentMethod?: string;
  paymentIntentId?: string;
  items: {
    productId: number;
    name: string;
    price: number;
    quantity: number;
  }[];
}

export interface IOrdersRepository {
  create(params: CreateOrderParams, client?: PoolClient): Promise<OrderRow>;
  findByUserId(userId: number): Promise<OrderRow[]>;
  findById(id: number | string, userId?: number): Promise<OrderRow | null>;
  updateStatus(
    id: number | string,
    status: string,
    paymentReference?: string,
    client?: PoolClient,
  ): Promise<OrderRow | null>;
}

export const ORDERS_REPOSITORY_TOKEN = Symbol('IOrdersRepository');
