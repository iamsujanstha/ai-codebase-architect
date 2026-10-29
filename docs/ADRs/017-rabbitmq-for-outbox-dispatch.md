# ADR-017: RabbitMQ for outbox dispatch and asynchronous order effects

**Status:** Accepted for the learning implementation  
**Date:** 2026-10-29  
**Related:** ADR-013 (Transactional Outbox), ADR-015 (Repository Boundaries)

## Context

The PostgreSQL outbox already stores `order.paid` in the same transaction as the paid order. Processing inventory and SMTP directly in the outbox poller couples event recovery to slow external email delivery. The project also needs a broker example that exposes routing, confirms, acknowledgements, prefetch, retries, and dead-letter handling to learners.

## Decision

Keep PostgreSQL as the source of truth for committed payment events. The API process runs a NestJS outbox publisher that claims rows with the existing lease and fencing-token protocol, publishes a persistent event to RabbitMQ, waits for a publisher confirm, then marks the outbox row published. A separate NestJS worker process consumes events and handles inventory and email, so it can scale and restart independently of the API and publisher.

The outbox row is marked `published` after RabbitMQ confirms the routed persistent message; this is broker handoff, not consumer completion. The topology uses a durable topic exchange, a durable order-paid queue, three fixed-TTL retry queues, and a durable dead-letter exchange and queue. The consumer uses manual acknowledgements and bounded prefetch. Transient failures receive delayed retries; invalid envelopes and oversized messages go directly to the dead-letter queue. Retry publication is confirmed before the original delivery is acknowledged. The local Compose topology uses a single RabbitMQ node and classic queues; a production cluster that needs replicated queue data must use quorum queues and multiple broker nodes.

## Dependency boundaries

`OutboxPublisher` depends on `IEventPublisher`; the payment email handler depends on the transport-neutral `EventEnvelope`; and worker composition registers that handler through `IEventConsumer`. RabbitMQ implements those ports in `RabbitMqEventAdapter`, and `RabbitMqModule` binds the interface tokens. A BullMQ implementation can provide the same tokens and reuse the event contract and business handler. The BullMQ adapter must deliberately map attempts, delayed retries, dead-letter behavior, acknowledgements, and availability reporting to BullMQ/Redis semantics; transport replacement does not make those semantics identical.

```mermaid
sequenceDiagram
  participant API as PaymentsService
  participant PG as PostgreSQL
  participant P as OutboxPublisher
  participant X as RabbitMQ Exchange
  participant Q as Durable Queue
  participant C as Separate OrderPaidWorker
  participant SMTP as SMTP
  API->>PG: BEGIN; mark paid; insert outbox event; COMMIT
  P->>PG: Claim with SKIP LOCKED, lease, fencing token
  P->>X: Persistent order.paid event, mandatory route
  X-->>P: Publisher confirm
  P->>PG: Mark outbox published with claim token
  X->>Q: Route by order.paid
  Q->>C: Deliver with manual ack
  C->>PG: Idempotent inventory effect
  C->>SMTP: Send confirmation email
  C-->>Q: Ack after both effects succeed
```

## Delivery and failure semantics

- The outbox transaction closes the PostgreSQL/business-event dual-write gap. It cannot atomically commit with RabbitMQ.
- A publisher confirm means RabbitMQ accepted responsibility for the routed persistent message; it does not mean a consumer finished the work.
- If publish succeeds and the process stops before the outbox row is marked published, lease recovery can publish the same event again. `eventId` is stable and inventory is guarded by the existing transactional `outbox_effects` marker.
- The consumer acknowledges only after database and SMTP effects complete. If SMTP accepts the email and the consumer loses its acknowledgement, RabbitMQ can redeliver and the email can be duplicated. SMTP has no idempotency-key contract, so exactly-once email is not promised.
- A failed delivery is published to a fixed-delay retry queue and only then acknowledged. After five delivery attempts it is published to the dead-letter queue. If retry/dead-letter publication fails, the original is negatively acknowledged for redelivery.
- RabbitMQ connection loss does not make the payment API depend on RabbitMQ availability. PostgreSQL retains new outbox events and the publisher retries after reconnect. `/health` reports RabbitMQ connectivity separately from database readiness.

## Operational requirements and limits

- Alert on RabbitMQ disconnects, PostgreSQL outbox pending count and oldest age, RabbitMQ ready and unacknowledged counts, retry traffic, dead-letter count, consumer processing latency, and publisher confirm failures.
- Keep credentials in deployment secrets and require TLS/authentication for remote broker connections. Compose defaults are for local learning only.
- Use quorum queues in a multi-node production RabbitMQ deployment when replicated queue data is required. Queue type is immutable after declaration; migrate by creating a new queue and moving/binding consumers.
- Set queue length, disk watermark, memory watermark, connection/channel limits, and alert thresholds from the workload and recovery objectives. The local sample intentionally does not invent those capacity numbers.
- SMTP delivery is currently at least once. A durable notification ledger can reduce duplicates only if the provider offers an idempotency contract or the application can reconcile provider acceptance.
- Password-reset email still uses its current direct MailService call. This ADR routes payment confirmation email through RabbitMQ; auth email can be migrated as a separate change because reset-token persistence and expiry need their own event contract.

## Alternatives

- **Direct SMTP from the outbox poller:** fewer moving pieces, but couples event publication and delivery retries to SMTP latency and does not teach broker operations.
- **Publish directly from PaymentsService:** rejected because PostgreSQL commit and broker publish would be an unsafe dual write.
- **SQS/Pub/Sub/Service Bus:** managed choices for their respective clouds; they reduce broker operations but teach provider-specific APIs rather than RabbitMQ exchanges and bindings.
- **Redis Streams:** viable for stream-style work distribution, but RabbitMQ's exchange and queue topology is a clearer exercise for broker routing and AMQP acknowledgements.
- **Kafka:** event log and replay use cases are outside this order-email workload.

## Learning objectives

Explain the distinction between publisher confirms and consumer acknowledgements; why all stages are at least once; why idempotency remains necessary; what happens when a broker, worker, database, SMTP server, or network fails; how retry tiers and dead-letter handling avoid poison-message loops; and why a local single-node broker is not a highly available production topology.
