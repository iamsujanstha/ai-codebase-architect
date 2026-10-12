/**
 * Exercise 14: The Transactional Outbox Pattern & Eventual Consistency
 *
 * Senior Backend / Architect Checklist — Topic 20 & 21:
 * Outbox Pattern, Atomic DB + Event Creation, At-Least-Once Delivery, Skip Locked
 *
 * Sequence:
 * WHY -> Problem -> Naive Solution -> Failure -> Correct Design -> Implementation -> Tradeoffs -> Interview Q&A
 */

import { pool } from './db';
import { randomUUID } from 'crypto';

export async function runOutboxPatternExercise() {
  console.log('\n=== Exercise 14: The Transactional Outbox Pattern ===\n');

  try {
    // -------------------------------------------------------------
    // Setup Tables for Orders and Outbox Events
    // -------------------------------------------------------------
    await pool.query(`
      DROP TABLE IF EXISTS outbox_events CASCADE;
      DROP TABLE IF EXISTS domain_orders CASCADE;

      CREATE TABLE domain_orders (
        id SERIAL PRIMARY KEY,
        order_number VARCHAR(50) NOT NULL UNIQUE,
        customer_email VARCHAR(100) NOT NULL,
        total_amount NUMERIC(10, 2) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'created',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE outbox_events (
        id SERIAL PRIMARY KEY,
        aggregate_type VARCHAR(50) NOT NULL,
        aggregate_id VARCHAR(50) NOT NULL,
        event_type VARCHAR(100) NOT NULL,
        payload JSONB NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
        retry_count INT NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        processed_at TIMESTAMPTZ
      );

      CREATE INDEX idx_outbox_pending ON outbox_events(status, created_at)
      WHERE status = 'PENDING';
    `);

    console.log(
      'Setup: Created domain_orders and transactional outbox_events tables.\n',
    );

    // -------------------------------------------------------------
    // Task 1: The Dual-Write Failure Scenario (Naive Approach)
    // -------------------------------------------------------------
    console.log(
      'Task 1: The Dual-Write Problem (Why dual-writes always fail)\n',
    );
    console.log('Scenario without Outbox:');
    console.log('  1. Application executes: BEGIN; INSERT order; COMMIT;');
    console.log(
      '  2. Application attempts: await messageQueue.publish(event);',
    );
    console.log(
      '  3. Process crashes / Network partition before publish succeeds!',
    );
    console.log(
      '  Result: Money collected in DB, but downstream inventory/fulfillment NEVER notified.\n',
    );

    // -------------------------------------------------------------
    // Task 2: Atomic Transactional Outbox Write
    // -------------------------------------------------------------
    console.log('Task 2: Atomic Transactional Outbox Insertion\n');

    const client = await pool.connect();
    const orderNumber = `ORD-OUTBOX-${Date.now()}`;
    const orderAmount = 299.99;
    const customerEmail = 'sarah@example.com';

    try {
      await client.query('BEGIN');

      // 1. Insert domain entity
      const orderInsert = await client.query(
        `INSERT INTO domain_orders (order_number, customer_email, total_amount, status)
         VALUES ($1, $2, $3, 'paid')
         RETURNING id;`,
        [orderNumber, customerEmail, orderAmount],
      );
      const orderId = orderInsert.rows[0].id;

      // 2. Insert event into outbox IN THE EXACT SAME TRANSACTION
      await client.query(
        `INSERT INTO outbox_events (aggregate_type, aggregate_id, event_type, payload)
         VALUES ($1, $2, $3, $4);`,
        [
          'Order',
          orderNumber,
          'OrderPaidEvent',
          JSON.stringify({
            orderId,
            orderNumber,
            customerEmail,
            totalAmount: orderAmount,
            timestamp: new Date().toISOString(),
          }),
        ],
      );

      await client.query('COMMIT');
      console.log(
        `✅ Order ${orderNumber} and outbox event created atomically in 1 transaction!\n`,
      );
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    // -------------------------------------------------------------
    // Task 3: Outbox Polling Worker with SELECT FOR UPDATE SKIP LOCKED
    // -------------------------------------------------------------
    console.log(
      'Task 3: Worker Polling with SELECT ... FOR UPDATE SKIP LOCKED\n',
    );
    console.log(
      'Scenario: Background worker pulls pending events without race conditions or locks:\n',
    );

    const workerClient = await pool.connect();
    try {
      await workerClient.query('BEGIN');

      // Fetch pending events and lock them so no other worker picks them up
      const pendingEvents = await workerClient.query(`
        SELECT id, aggregate_id, event_type, payload
        FROM outbox_events
        WHERE status = 'PENDING'
        ORDER BY id ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 5;
      `);

      console.log(
        `Worker found ${pendingEvents.rows.length} pending outbox event(s):`,
      );
      for (const event of pendingEvents.rows) {
        console.log(
          `  - Event #${event.id} [${event.event_type}] for ${event.aggregate_id}`,
        );

        // Simulate publishing to Kafka / RabbitMQ / SQS
        console.log(`    🚀 Published to message broker successfully!`);

        // Mark as PROCESSED
        await workerClient.query(
          `UPDATE outbox_events 
           SET status = 'PROCESSED', processed_at = NOW() 
           WHERE id = $1;`,
          [event.id],
        );
      }

      await workerClient.query('COMMIT');
      console.log('\n✅ Outbox event processed and marked PROCESSED.\n');
    } catch (err) {
      await workerClient.query('ROLLBACK');
      throw err;
    } finally {
      workerClient.release();
    }

    // -------------------------------------------------------------
    // Staff/Principal Interview Questions & Answers
    // -------------------------------------------------------------
    console.log('═'.repeat(70));
    console.log('📚 Senior / Principal Architect Interview Prep');
    console.log('═'.repeat(70));
    console.log(`
Q: "Why can't you simply publish to Kafka immediately after calling db.save()?"
A: "This is the classic Dual-Write Problem. You cannot achieve atomicity across two independent
   distributed systems (PostgreSQL and Kafka) without 2PC (Two-Phase Commit, which kills availability).
   If your application crashes or the network blips after db.save() commits but before Kafka ack,
   the event is permanently lost, causing inconsistent downstream state."

Q: "What are the trade-offs of Polling Publisher vs CDC (Change Data Capture) for the Outbox?"
A: "Polling Publisher:
   - Pros: Simple to implement, no extra infrastructure, respects transactions.
   - Cons: Adds database read polling overhead, slight latency.
   Change Data Capture (Debezium / PostgreSQL logical replication WAL stream):
   - Pros: Zero polling overhead, sub-millisecond event streaming directly from WAL.
   - Cons: Higher operational complexity, requires managing Kafka Connect and replication slots."

Q: "Why does the Outbox Pattern guarantee At-Least-Once, but NOT Exactly-Once delivery?"
A: "If the worker publishes to Kafka and crashes right before updating outbox_events to 'PROCESSED',
   another worker will re-read the event and publish it again. Therefore, all downstream
   consumers MUST be designed to be IDEMPOTENT using deduplication keys."
`);
  } catch (error: any) {
    console.error('❌ Error in Exercise 14:', error?.message);
    throw error;
  }
}

if (require.main === module) {
  runOutboxPatternExercise()
    .then(() => pool.end())
    .catch(() => pool.end());
}
