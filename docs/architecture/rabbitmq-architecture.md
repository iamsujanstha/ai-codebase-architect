# RabbitMQ in Atlas Commerce Lab — Architecture & Developer Guide

This document is a comprehensive, beginner-friendly guide to how RabbitMQ is set up, how it connects to our NestJS applications, and how to use this pattern to build new asynchronous features.

---

## Table of Contents

1. [The Problem RabbitMQ Solves (The "Why")](#1-the-problem-rabbitmq-solves-the-why)
2. [Mental Model & Core Terminology](#2-mental-model--core-terminology)
3. [How RabbitMQ is Installed & Configured](#3-how-rabbitmq-is-installed--configured)
4. [How the App Connects to RabbitMQ](#4-how-the-app-connects-to-rabbitmq)
5. [End-to-End Flow: The Life of an Event](#5-end-to-end-flow-the-life-of-an-event)
6. [The Two Processes (API vs Worker)](#6-the-two-processes-api-vs-worker)
7. [Step-by-Step Recipe: Adding a New Feature with RabbitMQ](#7-step-by-step-recipe-adding-a-new-feature-with-rabbitmq)
8. [Failure Handling: Retries & Dead Letter Queues](#8-failure-handling-retries--dead-letter-queues)
9. [Inspecting & Debugging in RabbitMQ UI](#9-inspecting--debugging-in-rabbitmq-ui)
10. [Key Files Reference](#10-key-files-reference)

---

## 1. The Problem RabbitMQ Solves (The "Why")

### The Naive Approach (Without RabbitMQ)

Imagine what happens when a customer pays for an item via Stripe or eSewa:

```mermaid
flowchart LR
    Customer -->|Webhook| API["API Webhook Handler"]
    API -->|1. Save payment| DB["Postgres DB"]
    API -->|2. Decrement stock| DB
    API -->|3. Send email| SMTP["Gmail / SMTP Server"]
    SMTP -->|4. Respond 200 OK| Customer
```

What could go wrong?

1. **Slow HTTP Requests:** If Gmail SMTP takes 4 seconds to respond, Stripe's webhook waits 4 seconds. Stripe will eventually time out and retry, causing duplicate processing.
2. **Third-Party Failures Crash Transactions:** If the email server is temporarily down, the entire transaction throws an error. Does the customer get refunded? Did stock get updated?
3. **The "Dual-Write" Problem:** If your database commits the order, but the server crashes right before sending the email, that email is lost forever.
4. **Server Crashes Under Load:** If 1,000 orders arrive during Black Friday, the API server tries to send 1,000 emails concurrently and runs out of memory or hits rate limits.

---

### The Solution: Transactional Outbox + RabbitMQ

We separate the **critical business state** from the **side-effects**:

```mermaid
flowchart TD
    subgraph "Step 1: Immediate & Safe (API Transaction)"
        W["Stripe / eSewa Webhook"] -->|Atomically in 1 DB Transaction| DB["PostgreSQL"]
        DB -.->|"1. Mark Order PAID\n2. Write outbox_events row"| DB
    end

    subgraph "Step 2: Reliable Dispatch (Background Poller)"
        OP["OutboxPublisher (API)"] -->|Polls every 5s| DB
        OP -->|Publish message| RMQ["RabbitMQ Broker"]
        RMQ -->|Confirm received| OP
        OP -->|Mark outbox row 'published'| DB
    end

    subgraph "Step 3: Asynchronous Work (Worker Process)"
        RMQ -->|Deliver message| WK["Worker (OrderPaidConsumer)"]
        WK -->|Idempotent decrement| DB
        WK -->|Send email| Mail["MailService (SMTP)"]
        WK -->|Acknowledge ACK| RMQ
    end
```

| Benefit | How It Works |
|---|---|
| **Zero Lost Messages** | If RabbitMQ or the worker is down, events safely wait in the PostgreSQL `outbox_events` table. |
| **Instant Webhook Response** | The API only writes 2 database rows and immediately returns `200 OK` to Stripe in < 50ms. |
| **Automatic Retries with Delays** | If the email server fails, RabbitMQ retries automatically (5s &rarr; 30s &rarr; 5m) without blocking other orders. |
| **Independent Scaling** | The Worker process can scale to 10 instances during flash sales without modifying or restarting the API server. |

---

## 2. Mental Model & Core Terminology

Think of RabbitMQ like the **Postal Service**:

```mermaid
flowchart LR
    P["Publisher (OutboxPublisher)"] -->|"1. Mail letter with routing key\n'order.paid'"| EX["Exchange ('commerce.events')\n(Post Office Sorting Room)"]
    EX -->|"2. Look at address\n& route to mailbox"| Q["Queue ('commerce.order-paid')\n(Mailbox)"]
    Q -->|"3. Deliver letter"| C["Consumer (OrderPaidConsumer)\n(Recipient)"]
    C -->|"4. Send ACK receipt"| Q
```

| Term | Postal Analogy | What It Is in Our Code |
|---|---|---|
| **Producer / Publisher** | Sender mailing a letter | [`OutboxPublisher`](file:///Users/mac/Developer/AI/ai-codebase-architect/backend/src/payments/outbox.publisher.ts) |
| **Exchange** | Post Office Sorting Hub | `commerce.events` (Topic exchange that inspects message topics and routes them) |
| **Routing Key** | Address on the envelope | `'order.paid'` (String tag attached to the message) |
| **Queue** | Mailbox holding letters | `commerce.order-paid` (FIFO buffer storing messages until a worker consumes them) |
| **Binding** | Rule: "Letters marked 'order.*' go into Mailbox X" | Connects `commerce.events` &rarr; `commerce.order-paid` using routing key `order.paid` |
| **Consumer** | Person checking the mailbox | [`OrderPaidConsumer`](file:///Users/mac/Developer/AI/ai-codebase-architect/backend/src/payments/order-paid.consumer.ts) |
| **ACK (Acknowledgement)** | Signed return receipt | Worker signals: *"I finished processing this message. You can safely delete it from the queue."* |
| **DLX (Dead Letter Exchange)** | "Undeliverable Mail" bin | `commerce.dead` (Holds messages that failed after maximum retry attempts for manual review) |

---

## 3. How RabbitMQ is Installed & Configured

RabbitMQ is integrated via three foundational layers:

### Layer A: The Broker Container ([`docker-compose.yml`](file:///Users/mac/Developer/AI/ai-codebase-architect/docker-compose.yml))
RabbitMQ runs as a containerized service with the management plugin pre-installed:

```yaml
services:
  rabbitmq:
    image: rabbitmq:4-management-alpine
    restart: unless-stopped
    hostname: rabbitmq
    environment:
      RABBITMQ_DEFAULT_USER: ${RABBITMQ_USER:-commerce}
      RABBITMQ_DEFAULT_PASS: ${RABBITMQ_PASSWORD:-local-development-only}
    ports:
      - "127.0.0.1:5672:5672"       # AMQP protocol port (app code talks here)
      - "127.0.0.1:15672:15672"   # Web Management UI port (humans inspect here)
    volumes:
      - rabbitmq-data:/var/lib/rabbitmq
```

### Layer B: Node.js AMQP Driver
In [`backend/package.json`](file:///Users/mac/Developer/AI/ai-codebase-architect/backend/package.json), the official client driver is installed:
```json
"dependencies": {
  "amqplib": "^2.2.0"
}
```

### Layer C: Connection URL Configuration
The application reads its connection URI from environment variables:
- **Inside Docker Compose:** `amqp://commerce:local-development-only@rabbitmq:5672`
- **Running Locally (Outside Docker):** `amqp://commerce:local-development-only@localhost:5672` (configured in [`.env`](file:///Users/mac/Developer/AI/ai-codebase-architect/.env))

---

## 4. How the App Connects to RabbitMQ

When the NestJS application starts, [`RabbitMqEventAdapter`](file:///Users/mac/Developer/AI/ai-codebase-architect/backend/src/messaging/rabbitmq/rabbitmq-event.adapter.ts) executes the connection lifecycle:

```mermaid
sequenceDiagram
    participant App as NestJS App (API or Worker)
    participant Adapter as RabbitMqEventAdapter
    participant Broker as RabbitMQ Server

    App->>Adapter: onModuleInit()
    Adapter->>Broker: amqp.connect(RABBITMQ_URL)
    Broker-->>Adapter: Connection Established

    par Create Two Independent Channels
        Adapter->>Broker: createConfirmChannel() (For Publisher)
        Adapter->>Broker: createChannel() (For Consumer)
    end

    Adapter->>Broker: assertExchange('commerce.events', 'topic')
    Adapter->>Broker: assertExchange('commerce.retry', 'direct')
    Adapter->>Broker: assertExchange('commerce.dead', 'direct')
    Adapter->>Broker: assertQueue('commerce.order-paid')
    Adapter->>Broker: bindQueue('commerce.order-paid' -> 'commerce.events', 'order.paid')
    Adapter->>Broker: consumerChannel.prefetch(5)
    Note over Adapter,Broker: Topology ready. Ready to publish and consume!
```

> [!NOTE]
> **Why Two Channels?**
> A channel in AMQP is a lightweight virtual connection inside a single TCP socket. We use **one channel for publishing** with publisher confirms, and **one channel for consuming**. If a consumer is slow or crashes, it never impacts publishing outbox events.

---

## 5. End-to-End Flow: The Life of an Event

Here is the exact lifecycle of an event from payment to delivery:

```mermaid
sequenceDiagram
    autonumber
    actor Customer
    participant Stripe as Stripe API
    participant API as Backend API Process
    participant Postgres as PostgreSQL (Neon)
    participant RMQ as RabbitMQ Broker
    participant Worker as Worker Process (rabbitmq-worker)
    actor Mail as Mail Server (SMTP)

    Customer->>Stripe: Completes checkout
    Stripe->>API: POST /payments/stripe/webhook
    activate API
    API->>Postgres: BEGIN TRANSACTION
    API->>Postgres: UPDATE orders SET status = 'paid'
    API->>Postgres: INSERT INTO outbox_events (event_type, payload, status = 'pending')
    API->>Postgres: COMMIT TRANSACTION
    API-->>Stripe: 200 OK (Instant response)
    deactivate API

    Note over API,Postgres: Every 5s: OutboxPublisher processBatch()
    activate API
    API->>Postgres: SELECT * FROM outbox_events WHERE status = 'pending' FOR UPDATE SKIP LOCKED
    API->>RMQ: publishConfirmed('commerce.events', 'order.paid', EventEnvelope)
    RMQ-->>API: Publisher Confirm ACK
    API->>Postgres: UPDATE outbox_events SET status = 'published'
    deactivate API

    Note over RMQ,Worker: RabbitMQ pushes message to subscribed queue
    activate Worker
    RMQ->>Worker: Deliver message from 'commerce.order-paid'
    Worker->>Postgres: Decrement stock in 'products' table (guarded by 'outbox_effects')
    Worker->>Mail: sendOrderConfirmation()
    Worker->>RMQ: channel.ack(message)
    deactivate Worker
    Note over RMQ: Message removed from queue
```

---

## 6. The Two Processes (API vs Worker)

Our codebase uses a **modular architecture** where the API and the Worker share the same repository and types, but boot as completely separate OS processes:

```
                          ┌─────────────────────────────────────┐
                          │         Codebase Repository         │
                          └──────────────────┬──────────────────┘
                                             │
                    ┌────────────────────────┴────────────────────────┐
                    ▼                                                 ▼
        ┌───────────────────────┐                         ┌───────────────────────┐
        │   Process 1: API      │                         │  Process 2: Worker    │
        │  (main.ts)            │                         │  (rabbitmq-worker)    │
        ├───────────────────────┤                         ├───────────────────────┤
        │ • Listens on HTTP 3000│                         │ • No HTTP port        │
        │ • Serves REST/GraphQL │                         │ • Runs in background  │
        │ • Writes to DB Outbox │                         │ • Consumes RabbitMQ   │
        │ • OutboxPublisher     │                         │ • OrderPaidConsumer   │
        └───────────────────────┘                         └───────────────────────┘
```

- **Boot API Server:** `npm run start:dev` (runs `src/main.ts`)
- **Boot Background Worker:** `npx ts-node -r tsconfig-paths/register src/workers/rabbitmq-worker.main.ts`
- **Docker Compose:** Handled automatically by the `backend` and `rabbitmq-worker` services in `docker-compose.yml`.

---

## 7. Step-by-Step Recipe: Adding a New Feature with RabbitMQ

Want to add a new event (for example: **`user.welcome_email`**, **`order.shipped`**, or **`review.created`**)? Follow this 5-step recipe:

### Step 1: Define the Event Envelope Payload & Type

In [`backend/src/messaging/contracts/event-types.ts`](file:///Users/mac/Developer/AI/ai-codebase-architect/backend/src/messaging/contracts/event-types.ts), add your event constant:

```typescript
export const ORDER_SHIPPED_EVENT_TYPE = 'order.shipped';
```

Define the payload interface:
```typescript
export interface OrderShippedPayload {
  orderNumber: string;
  trackingNumber: string;
  carrier: string;
  customerEmail: string;
}
```

---

### Step 2: Insert into the Outbox inside your Business Transaction

Whenever your service changes state, write to `outbox_events` in the **same database transaction**:

```typescript
// Example inside ShippingService
await client.query('BEGIN');

// 1. Update order status
await client.query('UPDATE orders SET status = $1 WHERE order_number = $2', ['shipped', orderNumber]);

// 2. Insert outbox record
await client.query(`
  INSERT INTO outbox_events (aggregate_type, aggregate_id, event_type, payload)
  VALUES ($1, $2, $3, $4)
`, [
  'order',
  orderNumber,
  ORDER_SHIPPED_EVENT_TYPE,
  JSON.stringify({ orderNumber, trackingNumber, carrier, customerEmail }),
]);

await client.query('COMMIT');
```

The existing [`OutboxPublisher`](file:///Users/mac/Developer/AI/ai-codebase-architect/backend/src/payments/outbox.publisher.ts) will automatically claim this event and publish it to RabbitMQ!

---

### Step 3: Register Queue & Routing Key in Topology Constants

In [`backend/src/messaging/rabbitmq/rabbitmq.constants.ts`](file:///Users/mac/Developer/AI/ai-codebase-architect/backend/src/messaging/rabbitmq/rabbitmq.constants.ts):

```typescript
export const RABBITMQ_TOPOLOGY = {
  exchanges: {
    events: 'commerce.events',
    // ...
  },
  queues: {
    orderPaid: 'commerce.order-paid',
    orderShipped: 'commerce.order-shipped', // <-- Add your queue
  },
  routingKeys: {
    orderPaid: 'order.paid',
    orderShipped: 'order.shipped',         // <-- Add your routing key
  },
};
```

In [`rabbitmq-event.adapter.ts`](file:///Users/mac/Developer/AI/ai-codebase-architect/backend/src/messaging/rabbitmq/rabbitmq-event.adapter.ts), declare the queue in `assertTopology()`:

```typescript
await consumerChannel.assertQueue(RABBITMQ_TOPOLOGY.queues.orderShipped, { durable: true });
await consumerChannel.bindQueue(
  RABBITMQ_TOPOLOGY.queues.orderShipped,
  RABBITMQ_TOPOLOGY.exchanges.events,
  RABBITMQ_TOPOLOGY.routingKeys.orderShipped,
);
```

---

### Step 4: Create the Consumer Handler

Create `backend/src/shipping/order-shipped.consumer.ts`:

```typescript
@Injectable()
export class OrderShippedConsumer {
  constructor(private readonly mailService: MailService) {}

  async handle(event: EventEnvelope): Promise<void> {
    const payload = event.payload as OrderShippedPayload;
    // Perform work (e.g., send tracking email)
    await this.mailService.sendTrackingEmail(payload);
  }
}
```

> [!TIP]
> Notice the consumer does **not** import `amqplib` or call `channel.ack()`. It only deals with plain domain objects and returns a Promise.

---

### Step 5: Register the Consumer with the Event Consumer Token

In your module's registration file:

```typescript
@Injectable()
export class OrderShippedEventRegistration implements OnModuleInit {
  constructor(
    @Inject(EVENT_CONSUMER_TOKEN)
    private readonly eventConsumer: IEventConsumer,
    private readonly orderShippedConsumer: OrderShippedConsumer,
  ) {}

  onModuleInit(): void {
    this.eventConsumer.registerHandler(ORDER_SHIPPED_EVENT_TYPE, (envelope) =>
      this.orderShippedConsumer.handle(envelope),
    );
  }
}
```

Add your consumer and registration to [`rabbitmq-worker.module.ts`](file:///Users/mac/Developer/AI/ai-codebase-architect/backend/src/workers/rabbitmq-worker.module.ts). That's it!

---

## 8. Failure Handling: Retries & Dead Letter Queues

In distributed systems, operations can fail (e.g. SMTP server rate limits or temporary network outages). We handle this gracefully without losing messages:

```mermaid
flowchart TD
    A["Worker receives message"] --> B{"Handler succeeds?"}
    B -->|Yes| C["channel.ack()\nMessage completed"]
    B -->|No: Error thrown| D{"Is error permanent\nOR retry >= 5?"}
    
    D -->|Permanent error (e.g. invalid JSON)| DLQ["Publish to commerce.dead (DLX)\nchannel.ack() original"]
    D -->|Temporary error| RETRY["Publish to commerce.retry\nwith delay tier\nchannel.ack() original"]
    
    RETRY --> T1["retry.5s (wait 5 sec)"]
    T1 -->|TTL expires| EX["Re-route back to\ncommerce.events"]
    EX --> A
```

### The 3 Retry Delays
If an error is transient, the message is routed to a TTL-delayed queue that automatically re-routes back into the main queue once the timer expires:
1. **1st failure:** 5-second delay (`commerce.order-paid.retry.5s`)
2. **2nd failure:** 30-second delay (`commerce.order-paid.retry.30s`)
3. **3rd to 5th failure:** 5-minute delay (`commerce.order-paid.retry.5m`)
4. **Exceeded 5 attempts:** Routed to Dead-Letter Queue (`commerce.order-paid.dead`) for human inspection.

---

## 9. Inspecting & Debugging in RabbitMQ UI

RabbitMQ includes a built-in web dashboard.

1. Open **[http://localhost:15672](http://localhost:15672)** in your browser.
2. Sign in with:
   - **Username:** `commerce`
   - **Password:** `local-development-only`

### Key Dashboards to Check

| Tab | What to Inspect |
|---|---|
| **Connections** | Shows 2 connections: one from `backend` (API publisher) and one from `rabbitmq-worker` (consumer). |
| **Channels** | Shows the active channels and prefetch limits (default: 5 concurrent messages). |
| **Exchanges** | View `commerce.events` (topic routing), `commerce.retry`, and `commerce.dead`. |
| **Queues** | Check `commerce.order-paid` for **Ready** (waiting to be processed) and **Unacked** (currently being worked on). If messages fail repeatedly, look inside `commerce.order-paid.dead`. |

---

## 10. Key Files Reference

| File | Purpose |
|---|---|
| [`docker-compose.yml`](file:///Users/mac/Developer/AI/ai-codebase-architect/docker-compose.yml) | RabbitMQ container configuration (ports `5672` & `15672`). |
| [`.env`](file:///Users/mac/Developer/AI/ai-codebase-architect/.env) | `RABBITMQ_URL` connection strings for local and Docker environments. |
| [`rabbitmq-event.adapter.ts`](file:///Users/mac/Developer/AI/ai-codebase-architect/backend/src/messaging/rabbitmq/rabbitmq-event.adapter.ts) | Core adapter: connects to broker, creates channels, asserts topology, publishes confirmed events, and consumes messages with retries. |
| [`rabbitmq.constants.ts`](file:///Users/mac/Developer/AI/ai-codebase-architect/backend/src/messaging/rabbitmq/rabbitmq.constants.ts) | Names of exchanges, queues, routing keys, prefetch counts, and retry TTL tiers. |
| [`rabbitmq.module.ts`](file:///Users/mac/Developer/AI/ai-codebase-architect/backend/src/messaging/rabbitmq/rabbitmq.module.ts) | NestJS module exporting `EVENT_PUBLISHER_TOKEN` and `EVENT_CONSUMER_TOKEN`. |
| [`event-envelope.interface.ts`](file:///Users/mac/Developer/AI/ai-codebase-architect/backend/src/messaging/contracts/event-envelope.interface.ts) | Transport-neutral message shape (`eventId`, `eventType`, `payload`, etc.). |
| [`outbox.publisher.ts`](file:///Users/mac/Developer/AI/ai-codebase-architect/backend/src/payments/outbox.publisher.ts) | API Poller: polls `outbox_events` table and publishes confirmed messages to RabbitMQ. |
| [`rabbitmq-worker.main.ts`](file:///Users/mac/Developer/AI/ai-codebase-architect/backend/src/workers/rabbitmq-worker.main.ts) | Entry point for the independent background worker process. |
| [`order-paid.consumer.ts`](file:///Users/mac/Developer/AI/ai-codebase-architect/backend/src/payments/order-paid.consumer.ts) | Domain logic handler: decrements product stock and sends confirmation emails. |
| [`017-rabbitmq-for-outbox-dispatch.md`](file:///Users/mac/Developer/AI/ai-codebase-architect/docs/ADRs/017-rabbitmq-for-outbox-dispatch.md) | Architecture Decision Record (ADR) detailing why RabbitMQ was chosen over Redis/BullMQ. |
