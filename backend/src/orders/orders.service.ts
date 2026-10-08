import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Order, OrderDocument } from './schemas/order.schema';

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

@Injectable()
export class OrdersService {
  constructor(
    @InjectModel(Order.name) private readonly orderModel: Model<OrderDocument>,
  ) {}

  async createOrder(userId: string, userEmail: string, dto: CreateOrderDto): Promise<Order> {
    const order = new this.orderModel({
      userId,
      userEmail,
      ...dto,
      status: 'pending',
    });
    return order.save();
  }

  async getOrdersByUser(userId: string): Promise<Order[]> {
    return this.orderModel
      .find({ userId })
      .sort({ createdAt: -1 })
      .lean();
  }

  async getOrderById(orderId: string, userId: string): Promise<Order> {
    const order = await this.orderModel.findOne({ _id: orderId, userId }).lean();
    if (!order) {
      throw new NotFoundException('Order not found.');
    }
    return order;
  }

  async updateOrderStatus(orderId: string, status: string, paymentReference?: string): Promise<Order | null> {
    return this.orderModel.findByIdAndUpdate(
      orderId,
      { status, ...(paymentReference ? { paymentReference } : {}) },
      { new: true },
    );
  }
}
