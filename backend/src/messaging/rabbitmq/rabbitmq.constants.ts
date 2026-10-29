import { ORDER_PAID_EVENT_TYPE } from '../contracts/event-types';

/**
 * Domain messaging topology: exchanges, queues, routing keys, and retry schedules.
 */
export const RABBITMQ_TOPOLOGY = {
  exchanges: {
    events: 'commerce.events',
    retry: 'commerce.retry',
    deadLetter: 'commerce.dead',
  },
  queues: {
    orderPaid: 'commerce.order-paid',
    orderPaidDeadLetter: 'commerce.order-paid.dead',
  },
  routingKeys: {
    orderPaid: ORDER_PAID_EVENT_TYPE,
  },
  retryTiers: [
    {
      routingKey: 'order.paid.retry.5s',
      queue: 'commerce.order-paid.retry.5s',
      ttlMs: 5_000,
    },
    {
      routingKey: 'order.paid.retry.30s',
      queue: 'commerce.order-paid.retry.30s',
      ttlMs: 30_000,
    },
    {
      routingKey: 'order.paid.retry.5m',
      queue: 'commerce.order-paid.retry.5m',
      ttlMs: 300_000,
    },
  ],
} as const;

/**
 * Operational defaults for connection, consumer prefetch, and reconnect backoff.
 */
export const RABBITMQ_DEFAULTS = {
  prefetch: 5,
  maxDeliveryAttempts: 5,
  maxMessageBytes: 256 * 1024,
  connectTimeoutMs: 10_000,
  heartbeatSeconds: 30,
  shutdownDrainMs: 35_000,
  reconnect: {
    baseDelayMs: 1_000,
    maxDelayMs: 30_000,
    maxExponent: 5,
    jitterRatio: 0.2,
  },
} as const;
