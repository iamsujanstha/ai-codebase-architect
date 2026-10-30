import { ApiError } from '@/core/api/aiApi';
import type { ApiErrorResponse } from '@/core/types/api';
import type {
  CheckoutCartItemInput,
  CheckoutCustomerInput,
  CreateStripeCheckoutSessionResponse,
  EsewaCheckoutResponse,
  OrderSummaryResponse,
  PaymentQuoteResponse,
  StripeSessionStatusResponse,
} from '@/core/types/payment';

const REQUEST_TIMEOUT_MS = 30000;

function extractErrorMessage(errorPayload: Partial<ApiErrorResponse> | null): string {
  if (!errorPayload) {
    return 'The backend returned a payment error.';
  }

  if (Array.isArray(errorPayload.message)) {
    return errorPayload.message.join(', ');
  }

  if (typeof errorPayload.message === 'string' && errorPayload.message.trim()) {
    return errorPayload.message;
  }

  if (typeof errorPayload.detail === 'string' && errorPayload.detail.trim()) {
    return errorPayload.detail;
  }

  return 'The backend returned a payment error.';
}

async function requestJson<T>(
  input: string,
  init: RequestInit,
  authenticated = false,
): Promise<T> {
  const controller = new AbortController();
  const timeoutHandle = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string> ?? {}),
  };

  if (authenticated) {
    const token = localStorage.getItem('auth_token');
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }

  try {
    const response = await fetch(input, {
      ...init,
      signal: controller.signal,
      headers,
    });

    if (!response.ok) {
      if (response.status === 401) {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('auth_user');
        window.dispatchEvent(new Event('atlas:auth-unauthorized'));
        if (!window.location.pathname.startsWith('/login')) {
          const returnTo = window.location.pathname + window.location.search;
          window.location.assign(`/login?redirect=${encodeURIComponent(returnTo)}`);
        }
      }
      const errorPayload = (await response.json()) as ApiErrorResponse;
      throw new ApiError(extractErrorMessage(errorPayload), response.status);
    }

    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new ApiError(
        'The payment request timed out while waiting for the backend.',
        408,
      );
    }

    throw new ApiError(
      'The frontend could not reach the backend payment service.',
      503,
    );
  } finally {
    window.clearTimeout(timeoutHandle);
  }
}

export function requestPaymentQuote(
  items: CheckoutCartItemInput[],
): Promise<PaymentQuoteResponse> {
  return requestJson<PaymentQuoteResponse>('/payments/quote', {
    method: 'POST',
    body: JSON.stringify({ items }),
  });
}

export function generateIdempotencyKey(): string {
  if (
    typeof window !== 'undefined' &&
    window.crypto &&
    typeof window.crypto.randomUUID === 'function'
  ) {
    return window.crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function createStripeCheckoutSession(
  input: {
    items: CheckoutCartItemInput[];
    customer: CheckoutCustomerInput;
  },
  idempotencyKey?: string,
): Promise<CreateStripeCheckoutSessionResponse> {
  const key =
    idempotencyKey && idempotencyKey.trim().length >= 16
      ? idempotencyKey.trim()
      : generateIdempotencyKey();

  return requestJson<CreateStripeCheckoutSessionResponse>(
    '/payments/stripe/checkout-session',
    {
      method: 'POST',
      headers: { 'Idempotency-Key': key },
      body: JSON.stringify(input),
    },
    true, // requires auth
  );
}

export function createEsewaCheckout(
  input: {
    items: CheckoutCartItemInput[];
    customer: CheckoutCustomerInput;
  },
  idempotencyKey?: string,
): Promise<EsewaCheckoutResponse> {
  const key =
    idempotencyKey && idempotencyKey.trim().length >= 16
      ? idempotencyKey.trim()
      : generateIdempotencyKey();

  return requestJson<EsewaCheckoutResponse>(
    '/payments/esewa/initiate',
    {
      method: 'POST',
      headers: { 'Idempotency-Key': key },
      body: JSON.stringify(input),
    },
    true,
  );
}

export function fetchMyOrders(): Promise<OrderSummaryResponse[]> {
  return requestJson<OrderSummaryResponse[]>(
    '/payments/my-orders',
    { method: 'GET' },
    true, // requires auth
  );
}

export function fetchOrderSummary(
  orderNumber: string,
): Promise<OrderSummaryResponse> {
  return requestJson<OrderSummaryResponse>(
    `/payments/orders/${encodeURIComponent(orderNumber)}`,
    {
      method: 'GET',
    },
  );
}

export function fetchStripeSessionStatus(params: {
  sessionId: string;
  orderNumber?: string;
}): Promise<StripeSessionStatusResponse> {
  const searchParams = new URLSearchParams({ sessionId: params.sessionId });

  if (params.orderNumber) {
    searchParams.set('orderNumber', params.orderNumber);
  }

  return requestJson<StripeSessionStatusResponse>(
    `/payments/stripe/session-status?${searchParams.toString()}`,
    {
      method: 'GET',
    },
  );
}

export interface PurchasedProductItem {
  productId: string;
  name: string;
  quantity: number;
  price: number;
  orderNumber: string;
  purchasedAt: string;
  status: string;
}

export interface PurchasedProductsResponse {
  productIds: string[];
  purchasedItems: PurchasedProductItem[];
  totalOrders: number;
}

export function fetchPurchasedProducts(): Promise<PurchasedProductsResponse> {
  return requestJson<PurchasedProductsResponse>(
    '/payments/purchased-products',
    { method: 'GET' },
    true,
  );
}

