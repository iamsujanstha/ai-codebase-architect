import Stripe from 'stripe';
import { PaymentProvider } from '../enums/payment-provider.enum';
import { ProviderQuote } from './payment-quote.interface';
import {
  CreateStripeCheckoutSessionResponse,
  EsewaCheckoutResponse,
} from './checkout-session.interface';

export const STRIPE_PROVIDER_TOKEN = Symbol('STRIPE_PROVIDER_TOKEN');
export const ESEWA_PROVIDER_TOKEN = Symbol('ESEWA_PROVIDER_TOKEN');

export interface PricedCartLine {
  productId: string;
  slug: string;
  name: string;
  quantity: number;
  unitAmountUsd: number;
  unitAmountNpr: number | null;
}

export interface QuoteBreakdown {
  currency: string;
  subtotal: number;
  taxAmount: number;
  serviceCharge: number;
  deliveryCharge: number;
  total: number;
}

export interface EsewaSuccessPayload {
  transaction_code?: string;
  status?: string;
  total_amount?: number | string;
  transaction_uuid?: string;
  product_code?: string;
  signed_field_names?: string;
  signature?: string;
}

export interface IPaymentProvider {
  readonly provider: PaymentProvider;
  buildQuote(pricedCart: PricedCartLine[]): ProviderQuote;
}

export interface IStripeProvider extends IPaymentProvider {
  createCheckoutSession(input: {
    orderNumber: string;
    customerEmail: string;
    pricedCart: PricedCartLine[];
    quote: ProviderQuote;
  }): Promise<CreateStripeCheckoutSessionResponse>;
  constructWebhookEvent(
    rawBody: Buffer | undefined,
    signature: string | undefined,
  ): Stripe.Event;
  retrieveSession(sessionId: string): Promise<Stripe.Checkout.Session>;
  extractOrderNumber(session: Stripe.Checkout.Session): string | null;
}

export interface IEsewaProvider extends IPaymentProvider {
  createCheckout(input: {
    orderNumber: string;
    quote: ProviderQuote;
  }): EsewaCheckoutResponse;
  verifyCallbackPayload(query: Record<string, string | undefined>): {
    verified: boolean;
    payload?: EsewaSuccessPayload;
    failureReason?: string;
  };
  queryStatus(input: {
    transactionUuid: string | null;
    totalAmount: string;
  }): Promise<{ status: string; ref_id?: string | null }>;
  buildFrontendResultUrl(
    orderNumber: string,
    status: 'success' | 'failed' | 'pending',
  ): string;
}
