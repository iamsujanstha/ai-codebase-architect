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
): Promise<T> {
  const controller = new AbortController();
  const timeoutHandle = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(input, {
      ...init,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    });

    if (!response.ok) {
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

export function createStripeCheckoutSession(input: {
  items: CheckoutCartItemInput[];
  customer: CheckoutCustomerInput;
}): Promise<CreateStripeCheckoutSessionResponse> {
  return requestJson<CreateStripeCheckoutSessionResponse>(
    '/payments/stripe/checkout-session',
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
  );
}

export function createEsewaCheckout(input: {
  items: CheckoutCartItemInput[];
  customer: CheckoutCustomerInput;
}): Promise<EsewaCheckoutResponse> {
  return requestJson<EsewaCheckoutResponse>('/payments/esewa/initiate', {
    method: 'POST',
    body: JSON.stringify(input),
  });
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
