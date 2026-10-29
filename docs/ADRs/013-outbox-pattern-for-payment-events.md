# ADR-013: Transactional outbox for payment side effects

**Status:** Accepted  
**Date:** 2026-10-25; implementation updated 2026-10-29

## Context

Payment confirmation changes durable order state and triggers inventory and email effects. Calling PostgreSQL and SMTP directly from the payment request creates a dual-write failure: the order can commit while a later effect fails, or a process can stop before the effect runs. An in-process retry cannot recover after the process exits.

## Decision

Commit the paid order and its `outbox_events` row in one PostgreSQL transaction. A NestJS publisher polls the outbox and forwards committed events to RabbitMQ. The repository claims available rows with one `UPDATE ... RETURNING` statement over candidates selected with `FOR UPDATE SKIP LOCKED`. RabbitMQ consumer topology and failure behavior are documented in [ADR-017](017-rabbitmq-for-outbox-dispatch.md).

The outbox row moves to `published` after RabbitMQ confirms the routed persistent message. This records broker handoff, not completion of inventory or email work; RabbitMQ consumer acknowledgements represent that later stage.

Each processing claim stores a timestamp and random UUID token. Claims older than five minutes can be reclaimed. Completion, retry, and dead-letter updates require the current token, so an expired worker cannot change the database state after another worker takes ownership.

Inventory decrement and its unique `(event_id, effect_type)` marker are committed in one transaction. A duplicate execution sees the existing marker and does not decrement stock again. The payment service has no parallel fast path; the RabbitMQ consumer handles paid-order effects after outbox dispatch.

SMTP delivery remains at least once. If SMTP accepts a message and the consumer loses its connection before acknowledging the RabbitMQ delivery, RabbitMQ can redeliver it and send a duplicate. The configured SMTP transport has no idempotency-key contract, so exactly-once email is not promised. SMTP connection and socket timeouts bound how long a worker waits.

## Mechanics

```mermaid
sequenceDiagram
  participant API as PaymentsService
  participant PG as PostgreSQL
  participant P as OutboxPublisher
  participant R as RabbitMQ
  participant C as OrderPaidConsumer
  participant SMTP as SMTP
  API->>PG: BEGIN; update order; insert outbox event; COMMIT
  P->>PG: Claim with SKIP LOCKED, lease, token
  P->>R: Persistent publish and publisher confirm
  P->>PG: Mark event published if claim token still matches
  R->>C: Deliver event
  C->>PG: Insert effect marker and decrement stock
  C->>SMTP: Send confirmation with bounded transport timeouts
  C-->>R: Acknowledge after effects complete
  Note over C,SMTP: Ambiguous SMTP acceptance can result in duplicate email
```

PostgreSQL releases row locks at statement completion, so `SKIP LOCKED` alone cannot represent ownership while external work runs. The lease persists that ownership across statements. The UUID token fences stale workers: a worker whose lease was replaced updates zero rows and must not complete the event.

## Alternatives

- **Direct calls with retries:** rejected because process memory disappears on crash and cannot make two systems commit atomically.
- **Publish directly from the payment transaction to a broker:** rejected because database commit and broker publish remain a dual write. The outbox now feeds RabbitMQ after the database transaction commits.
- **Exactly-once SMTP:** unavailable through the current interface. A provider with a durable idempotency contract or a notification-delivery ledger would be needed to improve this guarantee.

## Failure scenarios and tests

| Failure | Expected behavior | Verification |
|---|---|---|
| Two workers claim concurrently | PostgreSQL row locking gives each claimable row to one statement | Repository test asserts claim is one CTE/update statement; integration concurrency test still requires disposable PostgreSQL |
| Worker exits after claim | Lease expires and another poll may reclaim the event | Migration adds lease fields; needs integration test with `TEST_POSTGRES_URL` |
| Old worker finishes after reclaim | Token-guarded update affects zero rows and raises an error | Repository test checks stale completion rejection |
| Worker repeats inventory effect | Unique marker and stock changes are in the same transaction | Repository unit test checks conflict branch; transaction behavior needs PostgreSQL integration test |
| SMTP accepts then worker loses acknowledgement | Duplicate email can be sent on retry | Documented limitation; cannot be eliminated by this SMTP adapter |

## Operational limits

The five-minute lease is a starting value and should be revisited using observed publisher duration. Outbox retry delays use exponential backoff with downward jitter. Dead-letter events require an alert and an operator runbook before production deployment. Load, pool saturation, and database-loss drills require a disposable environment and have not been measured in this workspace.

## Interview note

Explain that the outbox closes the database dual-write gap, while leases recover publishing work and fencing tokens reject stale completion. The RabbitMQ publisher confirm is separate from the consumer acknowledgement. Be clear that delivery is at least once. Inventory deduplication is transactional; SMTP may duplicate after an ambiguous acknowledgement. Expect follow-up questions about lease duration, retry jitter, poison events, cleanup, and how a broker is introduced without losing atomicity.
