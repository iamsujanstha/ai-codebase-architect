import { ORDER_PAID_EVENT_TYPE } from '../contracts/event-types';

/**
 * Domain messaging topology: exchanges, queues, and routing keys.
 */
export const RABBITMQ_TOPOLOGY = {
  exchanges: {
    events: 'commerce.events',
    deadLetter: 'commerce.dead',
  },
  queues: {
    orderPaid: 'commerce.order-paid',
    orderPaidDeadLetter: 'commerce.order-paid.dead',
  },
  routingKeys: {
    orderPaid: ORDER_PAID_EVENT_TYPE,
  },
} as const;

/**
 * Operational defaults for connection prefetch and reconnect.
 */
export const RABBITMQ_DEFAULTS = {
  prefetch: 5,
  maxDeliveryAttempts: 3,
  reconnectDelayMs: 5_000,
} as const;
