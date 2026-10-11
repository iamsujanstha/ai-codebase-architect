import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  IOrdersRepository,
  ORDERS_REPOSITORY_TOKEN,
  OrderRow,
} from './repositories/orders.repository.interface';

export interface CreateOrderDto {
  items: {
    productId: string;
    productName: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
    currency: string;
  }[];
  subtotal: number;
  total: number;
  currency: string;
  paymentProvider: string;
  paymentReference?: string;
  customer: {
    fullName: string;
    email: string;
    phone?: string;
    addressLine1?: string;
    city?: string;
    country?: string;
  };
}

export interface OrderResponse {
  _id: string;
  id: string;
  orderNumber: string;
  userId: string;
  userEmail: string;
  items: {
    productId: string;
    productName: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
    currency: string;
  }[];
  subtotal: number;
  total: number;
  currency: string;
  status: string;
  paymentProvider: string;
  paymentReference?: string;
  customer: {
    fullName: string;
    email: string;
    phone?: string;
    addressLine1?: string;
    city?: string;
    country?: string;
  };
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class OrdersService {
  constructor(
    @Inject(ORDERS_REPOSITORY_TOKEN)
    private readonly ordersRepo: IOrdersRepository,
  ) {}

  private mapOrder(o: OrderRow): OrderResponse {
    return {
      _id: o.id.toString(),
      id: o.id.toString(),
      orderNumber: o.order_number,
      userId: o.user_id.toString(),
      userEmail: o.user_email ?? '',
      items: (o.items || []).map((item) => ({
        productId: item.product_id.toString(),
        productName: item.name,
        quantity: item.quantity,
        unitPrice: Number(item.price),
        lineTotal: Number(item.subtotal ?? Number(item.price) * item.quantity),
        currency: 'USD',
      })),
      subtotal: Number(o.total_amount),
      total: Number(o.total_amount),
      currency: 'USD',
      status: o.status,
      paymentProvider: o.payment_method ?? 'stripe',
      paymentReference: o.payment_intent_id ?? undefined,
      customer: {
        fullName: o.user_name || o.user_email || '',
        email: o.user_email ?? '',
      },
      createdAt: o.created_at ? new Date(o.created_at).toISOString() : new Date().toISOString(),
      updatedAt: o.updated_at ? new Date(o.updated_at).toISOString() : new Date().toISOString(),
    };
  }

  async createOrder(
    userId: string,
    userEmail: string,
    dto: CreateOrderDto,
  ): Promise<OrderResponse> {
    const numericUserId = parseInt(userId, 10) || 1;
    const orderNumber = `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    const order = await this.ordersRepo.create({
      userId: numericUserId,
      orderNumber,
      totalAmount: dto.total || dto.subtotal,
      status: 'pending',
      paymentMethod: dto.paymentProvider || 'stripe',
      paymentIntentId: dto.paymentReference,
      items: (dto.items || []).map((item) => ({
        productId: parseInt(item.productId, 10) || 1,
        name: item.productName,
        price: item.unitPrice,
        quantity: item.quantity,
      })),
    });

    return this.mapOrder(order);
  }

  async getOrdersByUser(userId: string): Promise<OrderResponse[]> {
    const numericUserId = parseInt(userId, 10) || 0;
    const orders = await this.ordersRepo.findByUserId(numericUserId);
    return orders.map((o) => this.mapOrder(o));
  }

  async getOrderById(orderId: string, userId: string): Promise<OrderResponse> {
    const numericUserId = parseInt(userId, 10) || 0;
    const order = await this.ordersRepo.findById(orderId, numericUserId);

    if (!order) {
      throw new NotFoundException('Order not found.');
    }

    return this.mapOrder(order);
  }

  async updateOrderStatus(
    orderId: string,
    status: string,
    paymentReference?: string,
  ): Promise<OrderResponse | null> {
    const updated = await this.ordersRepo.updateStatus(orderId, status, paymentReference);
    if (!updated) {
      return null;
    }
    return this.mapOrder(updated);
  }
}
