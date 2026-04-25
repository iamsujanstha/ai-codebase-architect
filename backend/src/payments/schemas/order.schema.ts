import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { OrderStatus } from '../enums/order-status.enum';
import { PaymentProvider } from '../enums/payment-provider.enum';

@Schema({ _id: false })
export class OrderCustomerSnapshot {
  @Prop({ required: true, trim: true })
  fullName!: string;

  @Prop({ required: true, trim: true, lowercase: true })
  email!: string;

  @Prop({ type: String, trim: true, default: null })
  phone!: string | null;

  @Prop({ type: String, trim: true, default: null })
  addressLine1!: string | null;

  @Prop({ type: String, trim: true, default: null })
  city!: string | null;

  @Prop({ type: String, trim: true, default: null })
  country!: string | null;
}

@Schema({ _id: false })
export class OrderLineItemSnapshot {
  @Prop({ required: true, trim: true })
  productId!: string;

  @Prop({ required: true, trim: true })
  slug!: string;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ required: true, min: 1 })
  quantity!: number;

  @Prop({ required: true, min: 0 })
  unitAmount!: number;

  @Prop({ required: true, min: 0 })
  lineTotal!: number;

  @Prop({ required: true, trim: true })
  currency!: string;
}

@Schema({ _id: false })
export class OrderPricingSnapshot {
  @Prop({ required: true, trim: true })
  currency!: string;

  @Prop({ required: true, min: 0 })
  subtotal!: number;

  @Prop({ required: true, min: 0 })
  taxAmount!: number;

  @Prop({ required: true, min: 0 })
  serviceCharge!: number;

  @Prop({ required: true, min: 0 })
  deliveryCharge!: number;

  @Prop({ required: true, min: 0 })
  total!: number;
}

@Schema({ _id: false })
export class OrderProviderMetadata {
  @Prop({ type: String, trim: true, default: null })
  stripeCheckoutSessionId!: string | null;

  @Prop({ type: String, trim: true, default: null })
  stripePaymentIntentId!: string | null;

  @Prop({ type: String, trim: true, default: null })
  esewaTransactionUuid!: string | null;

  @Prop({ type: String, trim: true, default: null })
  esewaTransactionCode!: string | null;

  @Prop({ type: String, trim: true, default: null })
  esewaReferenceId!: string | null;
}

@Schema({ _id: false })
export class OrderHistoryEntry {
  @Prop({ required: true, trim: true })
  status!: string;

  @Prop({ required: true, trim: true })
  note!: string;

  @Prop({ required: true })
  changedAt!: Date;
}

@Schema({
  collection: 'checkout_orders',
  timestamps: true,
})
export class Order {
  @Prop({ required: true, trim: true, unique: true, index: true })
  orderNumber!: string;

  @Prop({
    required: true,
    enum: Object.values(PaymentProvider),
  })
  paymentProvider!: PaymentProvider;

  @Prop({
    required: true,
    enum: Object.values(OrderStatus),
    default: OrderStatus.PENDING_PAYMENT,
  })
  status!: OrderStatus;

  @Prop({ type: OrderCustomerSnapshot, required: true })
  customer!: OrderCustomerSnapshot;

  @Prop({ type: [OrderLineItemSnapshot], default: [] })
  items!: OrderLineItemSnapshot[];

  @Prop({ type: OrderPricingSnapshot, required: true })
  pricing!: OrderPricingSnapshot;

  @Prop({ type: OrderProviderMetadata, default: {} })
  providerMetadata!: OrderProviderMetadata;

  @Prop({ type: [OrderHistoryEntry], default: [] })
  history!: OrderHistoryEntry[];

  @Prop({ type: String, trim: true, default: null })
  failureReason!: string | null;

  @Prop({ type: String, trim: true, default: null })
  providerReference!: string | null;

  @Prop({ type: String, trim: true, default: null })
  paymentReference!: string | null;

  @Prop({ type: Date, default: null })
  paidAt!: Date | null;
}

export type OrderDocument = HydratedDocument<Order>;

export const OrderSchema = SchemaFactory.createForClass(Order);

OrderSchema.index({ 'providerMetadata.stripeCheckoutSessionId': 1 }, { sparse: true });
