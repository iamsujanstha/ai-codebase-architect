/**
 * Exercise 7: Locks & MVCC (Multi-Version Concurrency Control)
 * 
 * Goal: Understand how PostgreSQL implements concurrency without blocking:
 * - Row-level locks (FOR UPDATE, FOR SHARE, SKIP LOCKED)
 * - Advisory locks for application-level distributed locking
 * - MVCC internals: xmin, xmax, and non-blocking reads
 */

import { PoolClient } from 'pg';
import { pool } from './db';

export async function demonstrateLocksAndMVCC() {
  console.log('\n=== Exercise 7: Locks & MVCC ===\n');

  try {
    // Setup test table
    await pool.query(`
      DROP TABLE IF EXISTS inventory_locks_demo CASCADE;
      CREATE TABLE inventory_locks_demo (
        id SERIAL PRIMARY KEY,
        item_name VARCHAR(100),
        stock INTEGER,
        reserved INTEGER DEFAULT 0
      );
      INSERT INTO inventory_locks_demo (item_name, stock)
      VALUES ('Keychron K8 Pro', 5), ('Standing Desk', 2);
    `);

    // Task 1: SELECT FOR UPDATE (Pessimistic Locking)
    console.log('Task 1: SELECT FOR UPDATE (Pessimistic Locking)');
    console.log('Prevents race conditions in high-concurrency checkout...\n');

    const client1: PoolClient = await pool.connect();
    const client2: PoolClient = await pool.connect();

    try {
      await client1.query('BEGIN');
      const res1 = await client1.query(
        'SELECT * FROM inventory_locks_demo WHERE id = 1 FOR UPDATE'
      );
      console.log(`Transaction 1 locked item "${res1.rows[0].item_name}" for update.`);

      // Client 2 attempts to lock the same row with a short timeout
      await client2.query('BEGIN');
      await client2.query('SET LOCAL lock_timeout = "500ms"');

      try {
        await client2.query(
          'SELECT * FROM inventory_locks_demo WHERE id = 1 FOR UPDATE'
        );
      } catch (err: any) {
        console.log(`Transaction 2 blocked and timed out as expected: ${err.message}`);
      }
      await client2.query('ROLLBACK');

      // Client 1 safely updates and commits
      await client1.query(
        'UPDATE inventory_locks_demo SET stock = stock - 1 WHERE id = 1'
      );
      await client1.query('COMMIT');
      console.log('✅ Transaction 1 safely decremented stock and committed.\n');
    } finally {
      client1.release();
      client2.release();
    }

    // Task 2: SKIP LOCKED (Concurrent Job Queue / Ticket Booking)
    console.log('Task 2: SKIP LOCKED (Worker Queue Pattern)');
    console.log('Multiple workers grab tasks without competing or blocking...\n');

    const w1 = await pool.connect();
    const w2 = await pool.connect();

    try {
      await w1.query('BEGIN');
      const task1 = await w1.query(
        'SELECT id, item_name FROM inventory_locks_demo ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 1'
      );
      console.log(`Worker 1 grabbed: ${task1.rows[0].item_name} (ID: ${task1.rows[0].id})`);

      await w2.query('BEGIN');
      const task2 = await w2.query(
        'SELECT id, item_name FROM inventory_locks_demo ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 1'
      );
      console.log(`Worker 2 grabbed next available: ${task2.rows[0].item_name} (ID: ${task2.rows[0].id})`);

      await w1.query('COMMIT');
      await w2.query('COMMIT');
      console.log('✅ Workers grabbed different items concurrently with zero lock wait!\n');
    } finally {
      w1.release();
      w2.release();
    }

    // Task 3: MVCC Internals (xmin, xmax, and Non-blocking Reads)
    console.log('Task 3: MVCC Internals (xmin, xmax system columns)');
    console.log('Showing that readers NEVER block writers, and writers NEVER block readers...\n');

    const mvccClient = await pool.connect();
    try {
      // Query system columns xmin (created XID) and xmax (deleted/updated XID)
      const mvccRes1 = await mvccClient.query(
        'SELECT id, item_name, stock, xmin, xmax FROM inventory_locks_demo WHERE id = 1'
      );
      console.log('Row version before update:');
      console.log(mvccRes1.rows[0]);

      // Update row
      await mvccClient.query(
        'UPDATE inventory_locks_demo SET stock = 10 WHERE id = 1'
      );

      const mvccRes2 = await mvccClient.query(
        'SELECT id, item_name, stock, xmin, xmax FROM inventory_locks_demo WHERE id = 1'
      );
      console.log('\nRow version after update (new tuple inserted, old marked with xmax):');
      console.log(mvccRes2.rows[0]);
      console.log('Notice: xmin changed because PostgreSQL creates a NEW row version rather than mutating in place!\n');
    } finally {
      mvccClient.release();
    }

    // Task 4: Advisory Locks (Distributed Application Lock)
    console.log('Task 4: PostgreSQL Advisory Locks');
    console.log('Cluster-wide application locks without creating lock tables...\n');

    const lockKey = 424242;
    const advClient = await pool.connect();
    try {
      const lockAcquired = await advClient.query(
        'SELECT pg_try_advisory_lock($1) AS acquired',
        [lockKey]
      );
      console.log(`Advisory lock ${lockKey} acquired: ${lockAcquired.rows[0].acquired}`);

      // Try acquiring again on same connection (reentrant in same session)
      const lock2 = await pool.query(
        'SELECT pg_try_advisory_lock($1) AS acquired',
        [lockKey]
      );
      console.log(`Second session trying to acquire lock ${lockKey}: ${lock2.rows[0].acquired} (false = already locked)`);

      await advClient.query('SELECT pg_advisory_unlock($1)', [lockKey]);
      console.log('✅ Advisory lock successfully released.\n');
    } finally {
      advClient.release();
    }

    console.log('=== Interview Questions & Answers ===');
    console.log(`
Q: "How does PostgreSQL implement MVCC and why does it matter?"
A: "PostgreSQL implements Multi-Version Concurrency Control by never updating rows in place.
Instead, UPDATE writes a new tuple with the current transaction ID in 'xmin' and writes that XID into
the old tuple's 'xmax'. Readers evaluate row visibility against their snapshot, meaning readers never
block writers and writers never block readers. Old dead tuples are later reclaimed by VACUUM."

Q: "When would you use SELECT FOR UPDATE SKIP LOCKED?"
A: "For high-throughput background queues or ticket booking systems where multiple workers grab jobs
simultaneously. Standard FOR UPDATE causes workers to wait on the first locked row. SKIP LOCKED allows
workers to instantly skip locked rows and pick the next available job, eliminating contention."
    `);
  } catch (error) {
    console.error('Error in Locks & MVCC exercise:', error);
  }
}

if (require.main === module) {
  demonstrateLocksAndMVCC().then(() => pool.end());
}
