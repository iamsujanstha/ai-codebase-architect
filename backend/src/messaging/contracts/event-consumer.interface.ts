import type { EventEnvelope } from './event-envelope.interface';

/** Rejecting the handler promise signals that transport retry policy should run. */
export type EventHandler = (event: EventEnvelope) => Promise<void>;

export interface IEventConsumer {
  /** Registers a business handler without exposing broker delivery mechanics. */
  registerHandler(eventType: string, handler: EventHandler): void;
}

export const EVENT_CONSUMER_TOKEN = Symbol('IEventConsumer');
