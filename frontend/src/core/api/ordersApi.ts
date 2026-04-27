import type { Order, CreateOrderPayload } from '@/core/types/order';

function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem('auth_token');
  return token
    ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    : { 'Content-Type': 'application/json' };
}

export async function createOrder(payload: CreateOrderPayload): Promise<Order> {
  const response = await fetch('/orders', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error((err as any).message ?? 'Failed to create order.');
  }

  return response.json() as Promise<Order>;
}

export async function fetchMyOrders(): Promise<Order[]> {
  const response = await fetch('/orders/my', {
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error('Failed to load order history.');
  }

  return response.json() as Promise<Order[]>;
}
