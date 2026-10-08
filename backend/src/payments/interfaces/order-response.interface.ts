import { OrderStatus } from '../enums/order-status.enum';
import { PaymentProvider } from '../enums/payment-provider.enum';

export interface OrderSummaryItem {
  productId: string;
  slug: string;
  name: string;
  quantity: number;
  unitAmount: number;
  lineTotal: number;
  currency: string;
}

export interface OrderSummaryResponse {
  orderNumber: string;
  status: OrderStatus;
  paymentProvider: PaymentProvider;
  customer: {
    fullName: string;
    email: string;
    phone?: string;
  };
  pricing: {
    currency: string;
    subtotal: number;
    taxAmount: number;
    serviceCharge: number;
    deliveryCharge: number;
    total: number;
  };
  items: OrderSummaryItem[];
  providerReference?: string | null;
  paymentReference?: string | null;
  failureReason?: string | null;
  paidAt?: string | null;
  createdAt: string;
}

export interface StripeSessionStatusResponse {
  order: OrderSummaryResponse;
  checkoutSessionId: string;
  sessionStatus: string | null;
  paymentStatus: string | null;
}
