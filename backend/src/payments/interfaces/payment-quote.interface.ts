import { PaymentProvider } from '../enums/payment-provider.enum';

export interface QuotedLineItem {
  productId: string;
  slug: string;
  name: string;
  quantity: number;
  unitAmount: number;
  lineTotal: number;
}

export interface ProviderQuote {
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
  items: QuotedLineItem[];
  providers: ProviderQuote[];
}
