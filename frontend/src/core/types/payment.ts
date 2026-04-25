import type { OrderStatus, PaymentProvider } from './payment-literals';

export interface PaymentQuoteItem {
  productId: string;
  slug: string;
  name: string;
  quantity: number;
  unitAmount: number;
  lineTotal: number;
}

export interface PaymentProviderQuote {
  provider: PaymentProvider;
  displayName: string;
  enabled: boolean;
  reasonUnavailable?: string;
  currency: string;
  subtotal: number;
  taxAmount: number;
  serviceCharge: number;
  deliveryCharge: number;
  total: number;
  note: string;
}

export interface PaymentQuoteResponse {
  items: PaymentQuoteItem[];
  providers: PaymentProviderQuote[];
}

export interface CheckoutCustomerInput {
  fullName: string;
  email: string;
  phone?: string;
  addressLine1?: string;
  city?: string;
  country?: string;
}

export interface CheckoutCartItemInput {
  productId: string;
  quantity: number;
}

export interface CreateStripeCheckoutSessionResponse {
  orderNumber: string;
  checkoutUrl: string;
}

export interface EsewaCheckoutResponse {
  orderNumber: string;
  actionUrl: string;
  method: 'POST';
  fields: Record<string, string>;
}

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
