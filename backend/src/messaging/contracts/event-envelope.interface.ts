/** Event contract shared by transports and consumers. */
export interface EventEnvelope {
  eventId: number;
  eventType: string;
  aggregateId: string;
  schemaVersion: number;
  occurredAt: string;
  payload: unknown;
}
