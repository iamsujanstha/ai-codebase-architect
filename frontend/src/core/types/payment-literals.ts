export type PaymentProvider = 'stripe' | 'esewa';

export type OrderStatus =
  | 'pending_payment'
  | 'paid'
  | 'failed'
  | 'canceled'
  | 'expired';
