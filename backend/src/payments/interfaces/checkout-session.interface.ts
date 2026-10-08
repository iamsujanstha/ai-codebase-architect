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
