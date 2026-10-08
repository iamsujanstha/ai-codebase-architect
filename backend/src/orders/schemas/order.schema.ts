import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type OrderDocument = Order & Document;

@Schema({ timestamps: true })
export class Order {
  @Prop({ required: true })
  userId!: string;

  @Prop({ required: true })
  userEmail!: string;

  @Prop({
    type: [
      {
        productId: String,
        productName: String,
        quantity: Number,
        unitPrice: Number,
        lineTotal: Number,
        currency: String,
      },
    ],
    required: true,
  })
  items!: {
    productId: string;
    productName: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
    currency: string;
  }[];

  @Prop({ required: true })
  subtotal!: number;

  @Prop({ required: true })
  total!: number;

  @Prop({ required: true })
  currency!: string;

  @Prop({ default: 'pending', enum: ['pending', 'paid', 'failed', 'cancelled'] })
  status!: string;

  @Prop()
  paymentProvider!: string;

  @Prop()
  paymentReference?: string;

  @Prop({
    type: {
      fullName: String,
      email: String,
      phone: String,
      addressLine1: String,
      city: String,
      country: String,
    },
  })
  customer!: {
    fullName: string;
    email: string;
    phone?: string;
    addressLine1?: string;
    city?: string;
    country?: string;
  };
}

export const OrderSchema = SchemaFactory.createForClass(Order);
