/** Price and quantity snapshot used to render a paid order receipt. */
export interface OrderConfirmationItem {
  name: string;
  quantity: number;
  unitAmount: number;
  lineTotal: number;
  currency: string;
}

/** Receipt data persisted in the outbox so retries do not depend on mutable catalog state. */
export interface OrderConfirmationEmail {
  orderNumber: string;
  paymentProvider: string;
  paymentReference: string | null;
  paidAt: Date | string;
  customer: {
    fullName: string;
    email: string;
    phone?: string | null;
    addressLine1?: string | null;
    city?: string | null;
    country?: string | null;
  };
  items: OrderConfirmationItem[];
  pricing: {
    currency: string;
    subtotal: number;
    taxAmount: number;
    serviceCharge: number;
    deliveryCharge: number;
    total: number;
  };
}
