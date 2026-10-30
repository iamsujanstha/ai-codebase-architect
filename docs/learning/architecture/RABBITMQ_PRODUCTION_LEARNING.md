# RabbitMQ production learning path

This guide describes the implementation in ADR-017 and prepares you to reason about it under interview follow-up questions. The questions are production-style prompts, not claims that they are verbatim from a particular interview.

## Run the flow locally

1. Set `POSTGRES_URL` and the usual application configuration in `.env`.
2. Run `docker compose up --build`; Compose starts the API/outbox publisher and the separate `backend-worker` process.
3. Apply database migrations using the project's migration process.
4. Make a successful test payment through the existing local payment flow.
5. Open `http://localhost:15672` and sign in with the local `RABBITMQ_USER` and `RABBITMQ_PASSWORD` values.
6. Inspect `commerce.events`, `commerce.order-paid`, the retry queues, and `commerce.order-paid.dead`.
7. Check `/health`: database readiness controls HTTP health; the `messaging.state` field reports event-transport connectivity separately.

Local Compose uses a single RabbitMQ node and classic queues. It is a learning topology, not a highly available production cluster. Set `RABBITMQ_QUEUE_TYPE=quorum` only when connecting to a RabbitMQ cluster that supports quorum queues. Existing queues cannot change type in place.

## SOLID boundaries and a future BullMQ adapter

The event contract lives in `src/messaging/contracts`. `OutboxPublisher` depends on `IEventPublisher`; the order-paid business handler receives `EventEnvelope` and has no AMQP dependency; and `OrderPaidEventRegistration` wires that handler through `IEventConsumer`. `RabbitMqEventAdapter` is the infrastructure adapter and `RabbitMqModule` binds the ports to it.

To compare BullMQ later, add a BullMQ adapter implementing `IEventPublisher` and `IEventConsumer`, then bind those tokens in API and worker composition. Keep `OutboxPublisher`, `OrderPaidConsumer`, and the event envelope unchanged. Map job names, retries, delays, dead-letter handling, acknowledgements, and health to BullMQ explicitly; similar concepts do not guarantee identical delivery behavior.

## Current message lifecycle

```text
payment transaction
  -> PostgreSQL order update + outbox row, one commit
  -> leased outbox publisher in the API process
  -> durable topic exchange + publisher confirm
  -> durable queue
  -> separate worker process: inventory transaction + SMTP
  -> ack
```

On a transient handler error, the consumer sends the event to a confirmed retry queue with a fixed delay, then acknowledges the original delivery. The delays are 5 seconds, 30 seconds, then 5 minutes; the fifth failed delivery goes to the dead-letter queue. Invalid event envelopes and oversized messages go directly to the dead-letter queue. If retry publication fails, the original is negatively acknowledged and requeued. Inventory is deduplicated by the existing PostgreSQL effect marker. SMTP may send a duplicate if its acceptance succeeds but the consumer loses the acknowledgement.

## Interview questions and model answers

### 1. Why use an outbox if RabbitMQ is durable?

RabbitMQ durability cannot make a PostgreSQL transaction and a broker publish atomic. If the application commits the order and crashes before publishing, the message is lost; if it publishes first and the database rolls back, consumers see an event for nonexistent state. The outbox records the event in the same PostgreSQL transaction as the order. A separate publisher transfers committed outbox rows to RabbitMQ.

### 2. What does a publisher confirm guarantee?

It confirms the broker accepted the publish according to the queue's configured durability semantics. It does not confirm consumer receipt or business completion. The publisher uses a durable exchange, persistent message, mandatory routing, and a confirm channel. An unroutable message is returned and treated as a publish failure.

### 3. What does a consumer acknowledgement guarantee?

It tells RabbitMQ the consumer completed that delivery and the broker can remove it. Acknowledging before side effects risks losing work after a crash. Acknowledging after SMTP and database work risks redelivery if the consumer crashes between the effect and the acknowledgement. Therefore the system remains at least once and handlers must be duplicate-safe.

### 4. Can this send an email exactly once?

No. The SMTP provider may accept the email, then the connection or worker may fail before the consumer's acknowledgement reaches RabbitMQ. Retrying is required to avoid losing mail, but can send a duplicate. Exactly-once effects need provider-supported idempotency or a reconciliation mechanism; a broker alone cannot provide it.

### 5. Why acknowledge the original only after confirming the retry publish?

If the original is acknowledged before the retry is durably accepted, a crash can lose the job. Confirm-then-ack prefers possible duplication over loss. If the consumer crashes after the retry confirm but before acknowledging the original, both deliveries may exist, so the handler still needs idempotency.

### 6. Why use fixed-TTL retry queues instead of `nack(requeue=true)`?

Immediate requeue can create a hot loop that consumes CPU and broker capacity while a dependency remains unavailable. Fixed-TTL queues delay retries and provide bounded backoff. Requeue is used only if the retry publish itself fails, preserving the original delivery.

### 7. What belongs in a dead-letter queue?

Messages that exhausted delivery attempts or repeatedly fail validation. The DLQ is an operational holding area, not automatic deletion. Alert on its depth, retain enough metadata to diagnose the cause, define safe redrive procedures, and avoid redriving a poison event without correcting its cause.

### 8. How do you prevent duplicate inventory decrements?

Use a durable event identifier and commit the effect marker with the stock updates in one PostgreSQL transaction. The unique `(event_id, effect_type)` constraint makes repeated delivery a no-op for that effect. The marker must not be written in a separate transaction from the decrement.

### 9. What does prefetch control?

Prefetch bounds how many unacknowledged deliveries RabbitMQ can send to a consumer. A small value limits in-flight memory and unfair hoarding by slow workers; a larger value can improve throughput but increases work held by a consumer and can worsen tail latency. Tune it against handler latency, message size, and concurrency.

### 10. What happens if RabbitMQ is unavailable?

The API can continue recording payment events because the outbox is in PostgreSQL. The publisher's claim fails or is rescheduled with backoff, and pending age/count grow. After RabbitMQ returns, publishing resumes. The operational risks are outbox growth and delayed email/inventory; monitor them and keep database capacity for the backlog.

### 11. What happens if PostgreSQL is unavailable?

New payment state and its outbox row cannot commit, so the request must fail rather than claim success. If PostgreSQL fails while a consumer is applying inventory, it must not acknowledge that message; RabbitMQ will redeliver after the channel/connection recovers.

### 12. Why use both publisher confirms and consumer acknowledgements?

They protect different hops. Publisher confirms cover producer-to-broker acceptance. Consumer acknowledgements cover consumer-to-broker completion. Neither confirms the other side's work.

### 13. How do you scale consumers safely?

Run more instances of the same queue consumer; RabbitMQ distributes deliveries among competing consumers. Keep processing bounded with prefetch and ensure every side effect is idempotent. Scaling is limited by SMTP throughput, PostgreSQL capacity, and any ordering requirement, not just broker throughput.

### 14. Does RabbitMQ preserve order?

Do not assume global completion order with multiple consumers, retries, and redeliveries. A single queue provides enqueue order, but concurrent consumers can finish out of order and a retried message can reappear later. If per-order order matters, route by aggregate key and serialize work for that key or use a broker feature designed for ordered groups.

### 15. What is the difference between classic and quorum queues?

Classic queues are suitable for the local single-node learning setup. Quorum queues replicate queue state using a majority of nodes, improving data safety during node failure at added latency, disk I/O, and operational cost. A durable queue on one node is not equivalent to a replicated production queue.

### 16. What would you alert on?

RabbitMQ connection state and reconnects; publisher confirm latency and failures; ready and unacknowledged queue counts; oldest outbox age and count; retry rate; DLQ depth; consumer processing latency and errors; broker disk/memory alarms; and SMTP failure rate. Queue depth alone is insufficient: a small queue with old messages can be more urgent than a large queue draining quickly.

### 17. How do you deploy a schema change?

Version the event contract and maintain compatibility while old messages remain in the queue. Consumers should tolerate supported older schemas; producers should not remove fields until queued old events have expired or been migrated. Track schema version with every envelope and test forward/backward compatibility.

### 18. How do you recover a DLQ message safely?

Inspect the message and failure reason, verify whether any side effect already completed, fix the root cause, and redrive with the original stable event ID. Since inventory has an effect marker but SMTP cannot be made exactly once, email redrive needs a conscious duplicate-send decision. Record who redrove it and when.

### 19. What production features are still absent from this learning implementation?

The Compose broker is single-node classic, queue capacity limits and alert thresholds need workload-derived values, auth emails are still direct SMTP calls, SMTP has no idempotency contract, and there is no automated DLQ redrive tool or broker metrics exporter. Call these out rather than describing the sample as fully production-ready.

### 20. What do you do when RabbitMQ raises a disk or memory alarm?

Treat it as a broker-capacity incident: inspect ready/unacknowledged queue depth, consumer rate, message size, disk free space, memory use, and publisher-confirm latency. Stop unbounded producers or shed noncritical work, restore capacity or drain safely, and verify the alert clears. Do not blindly delete durable messages; that converts an availability incident into data loss.

## Failure drills to perform

| Drill | Expected signal | Expected recovery |
|---|---|---|
| Stop RabbitMQ while a payment event is created | `messaging.state` disconnects; outbox pending age/count rise | Broker reconnects; outbox publisher drains committed events |
| Stop the consumer after delivery but before ack | Unacknowledged delivery is requeued when connection closes | Another consumer retries it; inventory effect marker prevents a second decrement |
| Make SMTP unavailable | Retry queue grows, then DLQ after the configured attempts | Restore SMTP and redrive only after inspecting the DLQ |
| Publish malformed event content | Consumer validation logs; immediate DLQ routing | Correct the producer/schema and redrive with an operator decision |
| Stop PostgreSQL during consumer work | Consumer processing fails and message is not acknowledged | Restore database; RabbitMQ redelivers the event |
| Kill publisher after confirm but before outbox completion | Event can be published again after lease recovery | Consumer's idempotent effects absorb duplicates; SMTP may still duplicate |

For each drill, write down the detection signal, user impact, recovery action, and any data that may have been duplicated or delayed. That explanation is the architecture skill interviewers are looking for.
