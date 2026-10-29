import type { EventEnvelope } from './event-envelope.interface';

export interface IEventPublisher {
  /**
   * Publishes an event to the configured transport.
   * @throws When the transport has not durably accepted the event.
   */
  publish(event: EventEnvelope): Promise<void>;

  /** Returns whether the adapter can currently accept publishes. */
  isAvailable(): boolean;
}

export const EVENT_PUBLISHER_TOKEN = Symbol('IEventPublisher');
