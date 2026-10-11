import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

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
  constructor(private readonly prisma: PrismaService) {}

  private mapOrder(o: any): OrderResponse {
    return {
      _id: o.id.toString(),
      id: o.id.toString(),
      orderNumber: o.order_number,
      userId: o.user_id.toString(),
      userEmail: o.users?.email ?? '',
      items: (o.order_items || []).map((item: any) => ({
        productId: item.product_id.toString(),
        productName: item.name,
        quantity: item.quantity,
        unitPrice: Number(item.price),
        lineTotal: Number(item.subtotal),
        currency: 'USD',
      })),
      subtotal: Number(o.total_amount),
      total: Number(o.total_amount),
      currency: 'USD',
      status: o.status,
      paymentProvider: o.payment_method ?? 'stripe',
      paymentReference: o.payment_intent_id ?? undefined,
      customer: {
        fullName:
          [o.users?.first_name, o.users?.last_name].filter(Boolean).join(' ') ||
          (o.users?.email ?? ''),
        email: o.users?.email ?? '',
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

    const order = await this.prisma.orders.create({
      data: {
        user_id: numericUserId,
        order_number: orderNumber,
        total_amount: dto.total || dto.subtotal,
        status: 'pending',
        payment_method: dto.paymentProvider || 'stripe',
        payment_intent_id: dto.paymentReference,
        order_items: {
          create: (dto.items || []).map((item) => ({
            product_id: parseInt(item.productId, 10) || 1,
            name: item.productName,
            price: item.unitPrice,
            quantity: item.quantity,
          })),
        },
      },
      include: {
        users: true,
        order_items: true,
      },
    });

    return this.mapOrder(order);
  }

  async getOrdersByUser(userId: string): Promise<OrderResponse[]> {
    const numericUserId = parseInt(userId, 10) || 0;
    const orders = await this.prisma.orders.findMany({
      where: { user_id: numericUserId },
      orderBy: { created_at: 'desc' },
      include: {
        users: true,
        order_items: true,
      },
    });

    return orders.map((o) => this.mapOrder(o));
  }

  async getOrderById(orderId: string, userId: string): Promise<OrderResponse> {
    const numericOrderId = parseInt(orderId, 10);
    const numericUserId = parseInt(userId, 10) || 0;

    const order = await this.prisma.orders.findFirst({
      where: {
        ...(isNaN(numericOrderId)
          ? { order_number: orderId }
          : { id: numericOrderId }),
        user_id: numericUserId,
      },
      include: {
        users: true,
        order_items: true,
      },
    });

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
    const numericOrderId = parseInt(orderId, 10);

    const updated = await this.prisma.orders.update({
      where: isNaN(numericOrderId)
        ? { order_number: orderId }
        : { id: numericOrderId },
      data: {
        status,
        ...(paymentReference ? { payment_intent_id: paymentReference } : {}),
        updated_at: new Date(),
      },
      include: {
        users: true,
        order_items: true,
      },
    });

    return this.mapOrder(updated);
  }
}
